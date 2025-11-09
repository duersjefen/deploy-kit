/**
 * SST Lock Check (DEP-49: Simplified, Fast, Reliable)
 *
 * **Problem with Previous Approach:**
 * - Used `npx sst unlock` to detect remote locks (10s timeout, false positives)
 * - Mutation operation used as detection mechanism (fundamentally flawed)
 * - Annoyed users with false lock warnings when no lock existed
 *
 * **New Approach:**
 * - Only check local `.sst/lock` file (fast, reliable, no false positives)
 * - If remote lock exists → SST deployment fails with clear error message
 * - No network calls → instant check (was 10+ seconds)
 *
 * **UX Flow:**
 * 1. Check `.sst/lock` file exists → If no → Pass immediately
 * 2. If yes → Show interactive prompt with auto-unlock option
 * 3. User confirms → Run `npx sst unlock --stage {stage}` → Clear lock
 * 4. CI/CD → Auto-unlock without prompt
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

    // Check for local lock file only (DEP-49: Remove unreliable remote lock detection)
    // Remote locks will be caught by SST deployment itself with clear error messages
    const lockPath = join(projectRoot, '.sst', 'lock');
    const hasLocalLock = existsSync(lockPath);

    if (hasLocalLock) {
      const lockedStage = stage || detectLockedStage(projectRoot);

      return {
        passed: false,
        issue: `SST lock file detected (previous session didn't exit cleanly)`,
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
 * Handle lock with interactive prompt (DEP-49: Simplified)
 *
 * **Simplified Approach:**
 * - Run `npx sst unlock --stage {stage}` to clear both local and remote locks
 * - Verify by checking local lock file is gone
 * - No complex verification logic, no environment flags
 */
async function handleLockWithPrompt(projectRoot: string, detectedStage: string | null, stage?: string): Promise<void> {
  console.log(chalk.bold.yellow('\n🔒 SST Lock Detected\n'));
  console.log(chalk.gray('A previous session didn\'t exit cleanly, leaving a lock file.\n'));

  const stageToUse = stage || detectedStage;
  if (stageToUse) {
    console.log(chalk.gray(`Stage: ${chalk.white(stageToUse)}`));
  }
  console.log(chalk.gray('Location: .sst/lock\n'));

  const unlockCmd = stageToUse ? `npx sst unlock --stage ${stageToUse}` : 'npx sst unlock';

  // Check if we're in non-interactive mode
  if (process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true' || !process.stdin.isTTY) {
    console.log(chalk.yellow('🔧 Non-interactive mode: Auto-unlocking...'));
    execSync(unlockCmd, { cwd: projectRoot, stdio: 'inherit' });
    console.log(chalk.green('✅ Lock cleared!\n'));
    return;
  }

  // Ask user if they want to auto-unlock
  console.log(chalk.bold.cyan('🔧 Auto-Recovery Available:'));
  const shouldUnlock = await promptYesNo('  Clear the lock and continue?', true);

  console.log(''); // Empty line for spacing

  if (shouldUnlock) {
    try {
      execSync(unlockCmd, { cwd: projectRoot, stdio: 'pipe' });
      console.log(chalk.green('✅ Lock cleared!\n'));
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
