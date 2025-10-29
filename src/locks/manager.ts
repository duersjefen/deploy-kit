import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { DeploymentStage, DeploymentLock } from '../types.js';

const execAsync = promisify(exec);

/**
 * Lock management: prevents concurrent deployments
 * Dual-lock system:
 *   1. File-based lock (.deployment-lock-{stage}) - prevents human-triggered concurrent deploys
 *   2. Pulumi lock detection - detects infrastructure state locks
 */
export function getLockManager(projectRoot: string) {
  const LOCK_DURATION_MINUTES = 120; // Auto-expire after 2 hours

  /**
   * Get lock file path
   */
  function getLockFilePath(stage: DeploymentStage): string {
    return join(projectRoot, `.deployment-lock-${stage}`);
  }

  /**
   * Check if Pulumi has infrastructure locked
   */
  async function isPulumiLocked(stage: DeploymentStage): Promise<boolean> {
    try {
      const sstStage = stage === 'production' ? 'prod' : stage;
      const { stdout } = await execAsync(
        `npx sst status --stage ${sstStage} 2>&1 | grep -i "locked" || true`
      );
      return stdout.includes('locked') || stdout.includes('Lock');
    } catch {
      return false;
    }
  }

  /**
   * Clear Pulumi lock (safe - only clears, doesn't deploy)
   */
  async function clearPulumiLock(stage: DeploymentStage): Promise<void> {
    try {
      const sstStage = stage === 'production' ? 'prod' : stage;
      await execAsync(`npx sst unlock --stage ${sstStage}`);
      console.log(chalk.green(`✅ Cleared Pulumi lock for ${stage}`));
    } catch (error) {
      // Unlock command may fail if lock doesn't exist - that's OK
      console.log(chalk.gray(`ℹ️  No Pulumi lock to clear for ${stage}`));
    }
  }

  /**
   * Auto-detect and clean Pulumi locks (runs at start of every deployment)
   */
  async function checkAndCleanPulumiLock(stage: DeploymentStage): Promise<void> {
    const isLocked = await isPulumiLocked(stage);

    if (isLocked) {
      console.log(chalk.yellow(`⚠️  Pulumi state lock detected for ${stage}`));
      console.log(chalk.gray('Auto-clearing...'));
      await clearPulumiLock(stage);
    }
  }

  /**
   * Check file-based lock status
   */
  async function getFileLock(stage: DeploymentStage): Promise<DeploymentLock | null> {
    const lockPath = getLockFilePath(stage);

    if (!existsSync(lockPath)) {
      return null;
    }

    try {
      const content = readFileSync(lockPath, 'utf-8');
      const lock = JSON.parse(content) as DeploymentLock;
      lock.expiresAt = new Date(lock.expiresAt);
      lock.createdAt = new Date(lock.createdAt);
      return lock;
    } catch {
      return null;
    }
  }

  /**
   * Acquire deployment lock
   * Returns the lock object for later release
   */
  async function acquireLock(stage: DeploymentStage): Promise<DeploymentLock> {
    const lockPath = getLockFilePath(stage);
    const existingLock = await getFileLock(stage);

    if (existingLock) {
      const isExpired = new Date() > existingLock.expiresAt;

      if (!isExpired) {
        const minutesLeft = Math.round(
          (existingLock.expiresAt.getTime() - new Date().getTime()) / 60000
        );
        const message = `❌ Deployment for ${stage} is already in progress (${minutesLeft} min remaining)\n` +
          `To force recovery, run: npx deploy-kit recover ${stage}`;
        throw new Error(message);
      } else {
        // Lock expired, clean it up
        unlinkSync(lockPath);
      }
    }

    // Create new lock
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60000);

    const lock: DeploymentLock = {
      stage,
      createdAt: now,
      expiresAt,
      reason: 'Deployment in progress',
    };

    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    return lock;
  }

  /**
   * Release lock after deployment completes
   */
  async function releaseLock(lock: DeploymentLock): Promise<void> {
    const lockPath = getLockFilePath(lock.stage);

    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }

  return {
    isPulumiLocked,
    clearPulumiLock,
    checkAndCleanPulumiLock,
    getFileLock,
    acquireLock,
    releaseLock,
  };
}
