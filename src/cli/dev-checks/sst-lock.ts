/**
 * SST Lock Check
 * Detects and optionally clears stale SST lock files with interactive recovery
 *
 * UX Improvements (v2.7.0):
 * - Interactive prompt asking user if they want to auto-unlock
 * - Stage detection (shows which stage is locked)
 * - Contextual explanation of why lock exists
 * - Non-interactive mode support (CI/CD)
 *
 * BEFORE:
 * ❌ SST lock detected (previous session didn't exit cleanly)
 *    Fix: Run npx sst unlock
 *
 * AFTER:
 * 🔒 SST Lock Detected
 *
 * A previous session didn't exit cleanly, leaving a lock file.
 *
 * Stage: staging
 * Lock Type: Pulumi state lock
 * Location: .sst/lock
 *
 * 🔧 Auto-Recovery Available:
 *   Clear the lock and continue? [Y/n]: _
 */

import chalk from 'chalk';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { promptYesNo } from '../../lib/prompt.js';
import type { CheckResult } from './types.js';

export function createSstLockCheck(projectRoot: string, stage?: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking for SST locks...'));

    // Check for local lock file
    const lockPath = join(projectRoot, '.sst', 'lock');
    const hasLocalLock = existsSync(lockPath);

    // Check for remote Pulumi state lock by trying to unlock
    // This is safe - if no lock exists, it just reports "no lock"
    let hasRemoteLock = false;
    let lockCheckTimedOut = false;

    if (!hasLocalLock && stage) {
      try {
        const result = execSync(`npx sst unlock --stage ${stage}`, {
          cwd: projectRoot,
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 10000, // 10 second timeout (DEP-42: reduce from 31s+ to 10s)
        });
        // If unlock succeeds without "no lock" message, there was a lock
        if (!result.toLowerCase().includes('no lock')) {
          hasRemoteLock = true;
        }
      } catch (error: any) {
        const errorMsg = error.message || error.stderr?.toString() || '';

        // DEP-42: Distinguish between timeout and actual lock errors
        if (error.killed || errorMsg.toLowerCase().includes('timeout')) {
          // Timeout - don't treat as lock, just skip check
          lockCheckTimedOut = true;
          console.log(chalk.gray('ℹ️  Lock check timed out (network latency) - skipping\n'));
        } else if (!errorMsg.toLowerCase().includes('no lock')) {
          // Actual error that's not "no lock" - could be a real lock
          // But be conservative: only flag if we're very confident
          const likelyLockKeywords = ['locked', 'lock file', 'state lock', 'concurrent'];
          const isLikelyLock = likelyLockKeywords.some(keyword =>
            errorMsg.toLowerCase().includes(keyword)
          );

          if (isLikelyLock) {
            hasRemoteLock = true;
          } else {
            // Unknown error - log but don't alarm user
            console.log(chalk.gray(`ℹ️  Could not verify remote lock (${errorMsg.split('\n')[0]}) - proceeding\n`));
          }
        }
      }
    }

    // Only show lock warning if we're confident there's an actual lock
    if (hasLocalLock || hasRemoteLock) {
      const lockedStage = stage || detectLockedStage(projectRoot);
      const lockType = hasLocalLock ? 'local' : 'remote Pulumi state';

      return {
        passed: false,
        issue: `SST ${lockType} lock detected (previous session didn't exit cleanly)`,
        canAutoFix: true,
        errorType: 'sst_locks',
        autoFix: async () => {
          await handleLockWithPrompt(projectRoot, lockedStage, stage);
        },
      };
    }

    console.log(chalk.green('✅ No locks found\n'));
    return { passed: true };
  };
}

/**
 * Detect which SST stage is locked
 */
function detectLockedStage(projectRoot: string): string | null {
  try {
    const sstDir = join(projectRoot, '.sst');
    if (!existsSync(sstDir)) {
      return null;
    }

    const sstContents = readdirSync(sstDir);

    // Look for common stage names in .sst directory
    const commonStages = ['staging', 'production', 'dev', 'prod', 'development'];
    for (const stage of commonStages) {
      if (sstContents.includes(stage)) {
        return stage;
      }
    }

    // Fallback: check for any directory that looks like a stage
    for (const item of sstContents) {
      if (item !== 'log' && item !== 'lock' && item !== 'cache') {
        return item;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Handle lock with interactive prompt
 */
async function handleLockWithPrompt(projectRoot: string, detectedStage: string | null, stage?: string): Promise<void> {
  console.log(chalk.bold.yellow('\n🔒 SST Lock Detected\n'));
  console.log(chalk.gray('A previous session didn\'t exit cleanly, leaving a lock file.\n'));

  const stageToUse = stage || detectedStage;
  if (stageToUse) {
    console.log(chalk.gray(`Stage: ${chalk.white(stageToUse)}`));
  }
  console.log(chalk.gray('Lock Type: Pulumi state lock'));
  console.log(chalk.gray('Location: .sst/lock or remote state\n'));

  const unlockCmd = stageToUse ? `npx sst unlock --stage ${stageToUse}` : 'npx sst unlock';

  // Check if we're in non-interactive mode
  if (process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true' || !process.stdin.isTTY) {
    console.log(chalk.yellow('🔧 Non-interactive mode: Auto-unlocking...'));
    execSync(unlockCmd, { cwd: projectRoot, stdio: 'inherit' });
    return;
  }

  // Ask user if they want to auto-unlock
  console.log(chalk.bold.cyan('🔧 Auto-Recovery Available:'));
  const shouldUnlock = await promptYesNo('  Clear the lock and continue?', true);

  console.log(''); // Empty line for spacing

  if (shouldUnlock) {
    try {
      execSync(unlockCmd, { cwd: projectRoot, stdio: 'pipe' });
      console.log(chalk.green('✅ Lock cleared successfully!\n'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Auto-unlock failed'));
      console.log(chalk.gray(`Please run manually: ${unlockCmd}\n`));
      throw error;
    }
  } else {
    console.log(chalk.yellow('⚠️  Lock not cleared'));
    console.log(chalk.gray(`You can clear it later with: ${unlockCmd}\n`));
    throw new Error('User declined to clear SST lock');
  }
}
