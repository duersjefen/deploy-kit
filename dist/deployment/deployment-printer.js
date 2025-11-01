/**
 * Deployment Result Formatting
 *
 * Handles printing deployment summaries and failure reports.
 * Pure functions for formatting deployment results.
 */
import chalk from 'chalk';
/**
 * Print deployment success summary with timing breakdown
 *
 * @param result - Deployment result with status and timing
 * @param stageTimings - Array of stage timing information
 *
 * @example
 * ```typescript
 * const result: DeploymentResult = {
 *   success: true,
 *   stage: 'staging',
 *   durationSeconds: 120,
 *   // ...
 * };
 * printDeploymentSummary(result, [{name: 'Build', duration: 60000}]);
 * ```
 */
export function printDeploymentSummary(result, stageTimings) {
    console.log('\n' + chalk.bold.green('═'.repeat(60)));
    console.log(chalk.bold.green('✨ DEPLOYMENT SUCCESSFUL'));
    console.log(chalk.bold.green('═'.repeat(60)));
    console.log('\n📊 Deployment Summary:');
    console.log(chalk.green(`  Stage: ${result.stage}`));
    console.log(chalk.green(`  Total Duration: ${result.durationSeconds}s`));
    console.log(chalk.green(`  Status: ✅ All checks passed\n`));
    if (stageTimings.length > 0) {
        console.log('⏱️  Stage Timing Breakdown:');
        for (const timing of stageTimings) {
            const durationMs = timing.duration;
            const durationSecs = (durationMs / 1000).toFixed(1);
            const barLength = Math.round(durationMs / 5000); // Scale: 5s = full bar
            const bar = '█'.repeat(Math.min(barLength, 20));
            console.log(`  ${timing.name.padEnd(25)} ${bar.padEnd(20)} ${durationSecs}s`);
        }
        console.log('');
    }
    console.log(chalk.green(`✅ Application is now live on ${result.stage}`));
    console.log(chalk.gray(`   Deployment completed at ${result.endTime.toLocaleTimeString()}\n`));
}
/**
 * Print deployment failure summary with recovery suggestions
 *
 * @param result - Deployment result with error information
 * @param stageTimings - Array of stage timing information
 *
 * @example
 * ```typescript
 * const result: DeploymentResult = {
 *   success: false,
 *   stage: 'production',
 *   error: 'CloudFormation stack failed',
 *   // ...
 * };
 * printDeploymentFailureSummary(result, []);
 * ```
 */
export function printDeploymentFailureSummary(result, stageTimings) {
    console.log('\n' + chalk.bold.red('═'.repeat(60)));
    console.log(chalk.bold.red('❌ DEPLOYMENT FAILED'));
    console.log(chalk.bold.red('═'.repeat(60)));
    console.log('\n❌ Deployment Summary:');
    console.log(chalk.red(`  Stage: ${result.stage}`));
    console.log(chalk.red(`  Duration: ${(result.endTime.getTime() - result.startTime.getTime()) / 1000}s`));
    console.log(chalk.red(`  Error: ${result.error}\n`));
    console.log(chalk.yellow('🔧 Recovery Options:'));
    console.log(chalk.yellow(`  1. Review error message above`));
    console.log(chalk.yellow(`  2. Fix the issue locally`));
    console.log(chalk.yellow(`  3. Retry deployment: npx deploy-kit deploy ${result.stage}`));
    console.log(chalk.yellow(`  4. Or force recovery: npx deploy-kit recover ${result.stage}\n`));
}
