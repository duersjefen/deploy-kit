import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { DeploymentStage, DeploymentLock } from '../types.js';

const execAsync = promisify(exec);

/**
 * Lock management system preventing concurrent deployments
 * 
 * Implements a dual-lock system:
 * 1. File-based lock (.deployment-lock-{stage}) - prevents human-triggered concurrent deploys
 * 2. Pulumi lock detection - detects infrastructure state locks and provides recovery
 * 
 * @param projectRoot - Root directory of the project
 * @returns Lock manager object with lock management methods
 * 
 * @example
 * ```typescript
 * const lockManager = getLockManager('/path/to/project');
 * const lock = await lockManager.acquireLock('staging');
 * try {
 *   // Perform deployment
 * } finally {
 *   await lockManager.releaseLock(lock);
 * }
 * ```
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
   * Check if Pulumi has infrastructure state locked
   * 
   * Queries SST status to detect if there's an active Pulumi state lock
   * (usually happens when a previous deployment failed mid-way).
   * 
   * @param stage - Deployment stage (staging, production)
   * @returns Promise resolving to true if Pulumi lock is detected
   * 
   * @example
   * ```typescript
   * const locked = await lockManager.isPulumiLocked('staging');
   * if (locked) {
   *   console.log('Previous deployment incomplete - lock detected');
   * }
   * ```
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
   * Clear Pulumi infrastructure state lock safely
   * 
   * Removes the lock preventing new deployments without modifying infrastructure.
   * Safe operation - only clears the lock, doesn't deploy or change resources.
   * Used to recover from failed deployments.
   * 
   * @param stage - Deployment stage (staging, production)
   * @throws Will not throw if lock doesn't exist (logged as info)
   * 
   * @example
   * ```typescript
   * await lockManager.clearPulumiLock('staging');
   * // Can now deploy again
   * ```
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
   * Auto-detect and clear Pulumi locks at start of deployment
   * 
   * Runs at the beginning of every deployment to detect stale Pulumi locks
   * from previous failed attempts. Automatically clears if found.
   * Silent operation - only logs if lock is cleared.
   * 
   * @param stage - Deployment stage (staging, production)
   * @returns Promise that resolves after lock check/cleanup completes
   * 
   * @example
   * ```typescript
   * // Called automatically before deployment
   * await lockManager.checkAndCleanPulumiLock('staging');
   * ```
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
   * Check current file-based lock status for a stage
   * 
   * Reads the lock file if it exists and parses the lock information.
   * Returns null if no lock file exists (no lock active).
   * Parses dates from ISO strings.
   * 
   * @param stage - Deployment stage (staging, production)
   * @returns Promise resolving to DeploymentLock object or null if no lock
   * 
   * @example
   * ```typescript
   * const currentLock = await lockManager.getFileLock('staging');
   * if (currentLock) {
   *   console.log(`Locked since: ${currentLock.createdAt}`);
   *   console.log(`Expires at: ${currentLock.expiresAt}`);
   * }
   * ```
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
   * Acquire a deployment lock for a stage
   * 
   * Prevents concurrent deployments by creating a lock file.
   * Locks expire after 120 minutes (auto-recovery from hung deployments).
   * If lock exists and not expired, throws error with recovery instructions.
   * If lock is expired, removes it and creates new lock.
   * 
   * @param stage - Deployment stage (staging, production)
   * @returns Promise resolving to DeploymentLock object to be released later
   * 
   * @throws {Error} If deployment already in progress with remaining time
   * 
   * @example
   * ```typescript
   * const lock = await lockManager.acquireLock('staging');
   * try {
   *   // Perform deployment
   *   await deploy('staging');
   * } finally {
   *   await lockManager.releaseLock(lock);
   * }
   * ```
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
   * Release deployment lock after operation completes
   * 
   * Removes the lock file, allowing subsequent deployments to proceed.
   * Safe to call even if lock file doesn't exist (e.g., if already released).
   * Should always be called in finally block to ensure cleanup.
   * 
   * @param lock - The lock object returned from acquireLock
   * @returns Promise that resolves when lock is released
   * 
   * @example
   * ```typescript
   * const lock = await lockManager.acquireLock('staging');
   * try {
   *   // Deployment logic
   * } finally {
   *   await lockManager.releaseLock(lock);
   * }
   * ```
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
