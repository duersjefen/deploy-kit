import chalk from 'chalk';
import ora from 'ora';
/**
 * Rollback manager - handles recovery from failed deployments
 *
 * Responsible for:
 * - Clearing deployment locks
 * - Clearing Pulumi/SST state locks
 * - Providing recovery guidance
 *
 * @example
 * ```typescript
 * const rollbackManager = new RollbackManager(lockManager);
 * await rollbackManager.recover('staging');
 * ```
 */
export class RollbackManager {
    /**
     * Create a new rollback manager
     *
     * @param lockManager - Lock manager instance for clearing locks
     */
    constructor(lockManager) {
        this.lockManager = lockManager;
    }
    /**
     * Recover from failed deployment
     *
     * Clears all locks (file-based and Pulumi) to allow redeployment.
     * This is safe to run and will not affect running deployments.
     *
     * @param stage - Deployment stage to recover
     * @throws {Error} If recovery fails
     *
     * @example
     * ```typescript
     * await rollbackManager.recover('staging');
     * // Locks cleared, ready to redeploy
     * ```
     */
    async recover(stage) {
        console.log(chalk.bold.yellow(`\n🔄 Recovering from failed ${stage} deployment...\n`));
        const spinner = ora('Clearing locks...').start();
        try {
            // Clear file lock
            const lock = await this.lockManager.getFileLock(stage);
            if (lock) {
                await this.lockManager.releaseLock(lock);
                spinner.info(`✅ Cleared deployment lock for ${stage}`);
            }
            // Clear Pulumi lock
            await this.lockManager.clearPulumiLock(stage);
            spinner.info(`✅ Cleared Pulumi lock for ${stage}`);
            spinner.succeed('✅ Recovery complete - ready to redeploy');
            console.log(chalk.green(`\n💡 You can now retry: npx deploy-kit deploy ${stage}\n`));
        }
        catch (error) {
            spinner.fail(`❌ Recovery failed: ${error}`);
            throw error;
        }
    }
    /**
     * Get deployment status
     *
     * Checks both file-based locks and Pulumi locks to determine if deployment
     * is in progress or if recovery is needed.
     *
     * @param stage - Deployment stage to check
     *
     * @example
     * ```typescript
     * await rollbackManager.getStatus('staging');
     * // Prints status: ready, locked, or stale
     * ```
     */
    async getStatus(stage) {
        console.log(chalk.bold.cyan(`\n📊 Checking deployment status for ${stage}...\n`));
        const isPulumiLocked = await this.lockManager.isPulumiLocked(stage);
        const fileLock = await this.lockManager.getFileLock(stage);
        if (isPulumiLocked) {
            console.log(chalk.yellow(`⚠️  Pulumi lock detected for ${stage} (will auto-clear on next deploy)`));
        }
        if (fileLock) {
            const isExpired = new Date() > fileLock.expiresAt;
            if (isExpired) {
                console.log(chalk.yellow(`⚠️  Stale deployment lock for ${stage} (expired, will be cleared)`));
                console.log(chalk.gray(`    Run: npx deploy-kit recover ${stage}`));
            }
            else {
                const minutesLeft = Math.round((fileLock.expiresAt.getTime() - new Date().getTime()) / 60000);
                console.log(chalk.red(`❌ Active deployment lock for ${stage} (${minutesLeft} min remaining)`));
                console.log(chalk.gray(`    Deployment is in progress or was interrupted`));
                console.log(chalk.gray(`    To force recovery: npx deploy-kit recover ${stage}`));
            }
        }
        else {
            console.log(chalk.green(`✅ Ready to deploy to ${stage}`));
        }
    }
    /**
     * Provide guidance for manual rollback scenarios
     *
     * @param stage - Deployment stage
     * @param error - Error that occurred during deployment
     */
    provideRollbackGuidance(stage, error) {
        console.log(chalk.bold.yellow('\n⚠️  Deployment Failed - Rollback Options\n'));
        console.log(chalk.yellow('Automatic rollback:'));
        console.log(chalk.gray(`  1. Run: npx deploy-kit recover ${stage}`));
        console.log(chalk.gray(`  2. Fix the issue locally`));
        console.log(chalk.gray(`  3. Retry: npx deploy-kit deploy ${stage}\n`));
        console.log(chalk.yellow('Manual rollback (if needed):'));
        console.log(chalk.gray(`  • Revert code changes: git revert HEAD`));
        console.log(chalk.gray(`  • Check AWS Console for stuck resources`));
        console.log(chalk.gray(`  • Check CloudFront distributions for orphans\n`));
        console.log(chalk.yellow('Common issues:'));
        if (error.message.includes('certificate') || error.message.includes('SSL')) {
            console.log(chalk.gray(`  • SSL certificate not validated in ACM`));
            console.log(chalk.gray(`  • Run: aws acm describe-certificate --certificate-arn <arn>`));
        }
        if (error.message.includes('distribution') || error.message.includes('CloudFront')) {
            console.log(chalk.gray(`  • CloudFront distribution misconfigured`));
            console.log(chalk.gray(`  • Run: make cloudfront-report`));
        }
        if (error.message.includes('lock') || error.message.includes('Lock')) {
            console.log(chalk.gray(`  • Deployment lock stuck`));
            console.log(chalk.gray(`  • Run: npx deploy-kit recover ${stage}`));
        }
        console.log('');
    }
}
