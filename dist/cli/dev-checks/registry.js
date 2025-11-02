/**
 * Development Pre-Flight Checks Registry
 * Manages registration and execution of all dev environment checks
 */
import chalk from 'chalk';
import { createAwsCredentialsCheck } from './aws-credentials.js';
import { createSstLockCheck } from './sst-lock.js';
import { createRunningSstProcessCheck } from './running-sst-processes.js';
import { createPortAvailabilityCheck } from './port-availability.js';
import { createSstConfigCheck } from './sst-config.js';
import { createSstStateHealthCheck } from './sst-state.js';
import { createRecursiveSstDevCheck } from './recursive-sst-dev.js';
import { createNextJsCanaryFeaturesCheck } from './nextjs-canary.js';
import { createTurbopackMigrationCheck } from './turbopack-migration.js';
import { createPulumiOutputUsageCheck } from './pulumi-output.js';
import { createLambdaReservedVarsCheck } from './lambda-reserved-vars.js';
/**
 * Safe fixes that can be auto-applied without user confirmation
 */
const SAFE_FIX_TYPES = ['recursive_sst_dev', 'nextjs_canary_features', 'sst_locks', 'running_sst_processes'];
/**
 * Create all development pre-flight checks
 */
export function getDevChecks(projectRoot, config, requestedPort = 3000, verbose = false) {
    return [
        { name: 'AWS Credentials', check: createAwsCredentialsCheck(projectRoot, config) },
        { name: 'SST Lock', check: createSstLockCheck(projectRoot) },
        { name: 'Running SST Processes', check: createRunningSstProcessCheck(projectRoot, verbose) },
        { name: 'Port Availability', check: createPortAvailabilityCheck(requestedPort) },
        { name: 'SST Config', check: createSstConfigCheck(projectRoot) },
        { name: '.sst Directory Health', check: createSstStateHealthCheck(projectRoot) },
        { name: 'Lambda Reserved Environment Variables', check: createLambdaReservedVarsCheck(projectRoot, verbose) },
        { name: 'Recursive SST Dev Script', check: createRecursiveSstDevCheck(projectRoot) },
        { name: 'Next.js Canary Features', check: createNextJsCanaryFeaturesCheck(projectRoot) },
        { name: 'Turbopack Migration', check: createTurbopackMigrationCheck(projectRoot) },
        { name: 'Pulumi Output Usage', check: createPulumiOutputUsageCheck(projectRoot) },
    ];
}
/**
 * Run all pre-flight checks with hybrid auto-fix approach
 *
 * - Safe fixes: Auto-apply without prompting
 * - Risky fixes: Show issue but require manual intervention
 */
export async function runDevChecks(projectRoot, config, requestedPort = 3000, verbose = false) {
    if (verbose) {
        console.log(chalk.gray('[DEBUG] Running in verbose mode\n'));
    }
    const checks = getDevChecks(projectRoot, config, requestedPort, verbose);
    const results = [];
    for (const check of checks) {
        try {
            const result = await check.check();
            if (!result.passed && result.canAutoFix && result.autoFix) {
                const isSafe = result.errorType && SAFE_FIX_TYPES.includes(result.errorType);
                if (isSafe) {
                    // Safe fixes: Auto-apply without prompting
                    console.log(chalk.yellow(`🔧 Auto-fixing: ${result.issue}`));
                    await result.autoFix();
                    console.log(chalk.green('✅ Fixed'));
                    // Re-run the check to verify the fix worked
                    console.log(chalk.gray('   Verifying fix...'));
                    const reCheckResult = await check.check();
                    results.push(reCheckResult);
                    if (!reCheckResult.passed) {
                        console.log(chalk.red(`   ⚠️  Fix verification failed\n`));
                    }
                }
                else {
                    // Risky fixes: Show issue but don't auto-fix (manual intervention required)
                    console.log(chalk.red(`❌ ${result.issue}`));
                    if (result.manualFix) {
                        console.log(chalk.gray(`   Fix: ${result.manualFix}\n`));
                    }
                    results.push(result);
                }
            }
            else {
                // Check passed or no auto-fix available
                if (!result.passed) {
                    console.log(chalk.red(`❌ ${result.issue}`));
                    if (result.manualFix) {
                        console.log(chalk.gray(`   Fix: ${result.manualFix}\n`));
                    }
                }
                results.push(result);
            }
        }
        catch (error) {
            console.log(chalk.yellow(`⚠️  ${check.name}: Could not verify (skipping)\n`));
            results.push({ passed: true }); // Skip check on error
        }
    }
    return {
        allPassed: results.every(r => r.passed),
        results,
    };
}
