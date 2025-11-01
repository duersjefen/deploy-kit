/**
 * SST Lock Check
 * Detects and optionally clears stale SST lock files
 */
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
export function createSstLockCheck(projectRoot) {
    return async () => {
        console.log(chalk.gray('🔍 Checking for SST locks...'));
        const lockPath = join(projectRoot, '.sst', 'lock');
        if (existsSync(lockPath)) {
            return {
                passed: false,
                issue: 'SST lock detected (previous session didn\'t exit cleanly)',
                canAutoFix: true,
                errorType: 'sst_locks',
                autoFix: async () => {
                    execSync('npx sst unlock', { cwd: projectRoot, stdio: 'inherit' });
                },
            };
        }
        console.log(chalk.green('✅ No locks found\n'));
        return { passed: true };
    };
}
