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
export function createSstLockCheck(projectRoot) {
    return async () => {
        console.log(chalk.gray('🔍 Checking for SST locks...'));
        const lockPath = join(projectRoot, '.sst', 'lock');
        if (existsSync(lockPath)) {
            const lockedStage = detectLockedStage(projectRoot);
            return {
                passed: false,
                issue: 'SST lock detected (previous session didn\'t exit cleanly)',
                canAutoFix: true,
                errorType: 'sst_locks',
                autoFix: async () => {
                    await handleLockWithPrompt(projectRoot, lockedStage);
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
function detectLockedStage(projectRoot) {
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
    }
    catch {
        // Ignore errors
    }
    return null;
}
/**
 * Handle lock with interactive prompt
 */
async function handleLockWithPrompt(projectRoot, stage) {
    console.log(chalk.bold.yellow('\n🔒 SST Lock Detected\n'));
    console.log(chalk.gray('A previous session didn\'t exit cleanly, leaving a lock file.\n'));
    if (stage) {
        console.log(chalk.gray(`Stage: ${chalk.white(stage)}`));
    }
    console.log(chalk.gray('Lock Type: Pulumi state lock'));
    console.log(chalk.gray('Location: .sst/lock\n'));
    // Check if we're in non-interactive mode
    if (process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true' || !process.stdin.isTTY) {
        console.log(chalk.yellow('🔧 Non-interactive mode: Auto-unlocking...'));
        execSync('npx sst unlock', { cwd: projectRoot, stdio: 'inherit' });
        return;
    }
    // Ask user if they want to auto-unlock
    console.log(chalk.bold.cyan('🔧 Auto-Recovery Available:'));
    const shouldUnlock = await promptYesNo('  Clear the lock and continue?', true);
    console.log(''); // Empty line for spacing
    if (shouldUnlock) {
        try {
            execSync('npx sst unlock', { cwd: projectRoot, stdio: 'pipe' });
            console.log(chalk.green('✅ Lock cleared successfully!\n'));
        }
        catch (error) {
            console.log(chalk.yellow('⚠️  Auto-unlock failed'));
            console.log(chalk.gray('Please run manually: npx sst unlock\n'));
            throw error;
        }
    }
    else {
        console.log(chalk.yellow('⚠️  Lock not cleared'));
        console.log(chalk.gray('You can clear it later with: npx sst unlock\n'));
        throw new Error('User declined to clear SST lock');
    }
}
