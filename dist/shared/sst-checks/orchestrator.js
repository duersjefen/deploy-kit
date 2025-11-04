/**
 * SST Environment Checks Orchestrator
 * Runs SST-specific checks before deployment with formatted output
 *
 * These are the subset of dev checks that are deployment-relevant:
 * - AWS Credentials
 * - SST Lock
 * - Running SST Processes
 * - SST Config
 * - .sst Directory Health
 * - Lambda Reserved Environment Variables
 * - Pulumi Output Usage
 *
 * Dev-only checks (NOT included):
 * - Port Availability
 * - Recursive SST Dev Script
 * - Next.js Canary Features
 * - Turbopack Migration
 */
import chalk from 'chalk';
import { createAwsCredentialsCheck } from '../../cli/dev-checks/aws-credentials.js';
import { createSstLockCheck } from '../../cli/dev-checks/sst-lock.js';
import { createRunningSstProcessCheck } from '../../cli/dev-checks/running-sst-processes.js';
import { createSstConfigCheck } from '../../cli/dev-checks/sst-config.js';
import { createSstStateHealthCheck } from '../../cli/dev-checks/sst-state-health.js';
import { createLambdaReservedVarsCheck } from '../../cli/dev-checks/lambda-reserved-vars.js';
import { createPulumiOutputUsageCheck } from '../../cli/dev-checks/pulumi-output.js';
/**
 * Get deployment-relevant SST environment checks
 */
function getSstEnvironmentChecks(projectRoot, config, verbose = false) {
    return [
        { name: 'AWS Credentials', check: createAwsCredentialsCheck(projectRoot, config) },
        { name: 'SST Lock', check: createSstLockCheck(projectRoot) },
        { name: 'Running SST Processes', check: createRunningSstProcessCheck(projectRoot, verbose) },
        { name: 'SST Config', check: createSstConfigCheck(projectRoot) },
        { name: '.sst Directory Health', check: createSstStateHealthCheck(projectRoot, config) },
        { name: 'Lambda Reserved Environment Variables', check: createLambdaReservedVarsCheck(projectRoot, verbose) },
        { name: 'Pulumi Output Usage', check: createPulumiOutputUsageCheck(projectRoot) },
    ];
}
/**
 * Run a single SST environment check with timing
 */
async function runSstCheck(check) {
    const startTime = Date.now();
    try {
        const result = await check.check();
        const duration = Date.now() - startTime;
        return {
            passed: result.passed,
            duration,
            error: result.issue,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        return {
            passed: false,
            duration,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Run all SST environment checks with formatted output
 *
 * Output format matches pre-deployment checks:
 * - Header with check count
 * - Progress indicators (▶)
 * - Individual check timing
 * - Summary box with results
 * - Total duration
 *
 * DEPLOYMENT BEHAVIOR:
 * - Does NOT auto-fix issues (fail fast for safety)
 * - Stops on first failure
 * - Blocks deployment on any failure
 *
 * NOTE: Individual checks provide their own detailed output
 * (e.g., AWS account info, lock details). The orchestrator
 * adds progress indicators and timing summary.
 */
export async function runSstEnvironmentChecks(projectRoot, config, stage, verbose = false) {
    const checks = getSstEnvironmentChecks(projectRoot, config, verbose);
    if (checks.length === 0) {
        return {
            allPassed: true,
            totalDuration: 0,
            results: [],
            passed: 0,
            failed: 0,
        };
    }
    console.log(chalk.bold.cyan('\n🔍 Running SST Environment Checks'));
    console.log(chalk.gray(`   Stage: ${stage}`));
    console.log(chalk.gray(`   Checks: ${checks.length}\n`));
    const startTime = Date.now();
    const results = [];
    let passed = 0;
    let failed = 0;
    // Run checks sequentially
    for (const check of checks) {
        console.log(chalk.cyan(`▶ Running: ${check.name}`));
        const result = await runSstCheck(check);
        results.push({
            name: check.name,
            passed: result.passed,
            duration: result.duration,
            error: result.error,
        });
        if (result.passed) {
            passed++;
            const durationSecs = (result.duration / 1000).toFixed(1);
            console.log(chalk.gray(`   Duration: ${durationSecs}s\n`));
        }
        else {
            failed++;
            const durationSecs = (result.duration / 1000).toFixed(1);
            console.log(chalk.red(`\n❌ ${check.name} failed (${durationSecs}s)`));
            if (result.error) {
                console.log(chalk.red(`   Error: ${result.error}`));
            }
            console.log('');
            // Stop on first failure (deployment safety)
            break;
        }
    }
    const totalDuration = Date.now() - startTime;
    const allPassed = failed === 0;
    // Print summary
    console.log(chalk.bold('═'.repeat(60)));
    if (allPassed) {
        console.log(chalk.bold.green('✅ All SST Environment Checks Passed'));
    }
    else {
        console.log(chalk.bold.red('❌ SST Environment Checks Failed'));
    }
    console.log(chalk.bold('═'.repeat(60)));
    console.log(chalk.gray(`\nPassed: ${passed}/${checks.length}`));
    console.log(chalk.gray(`Total Duration: ${(totalDuration / 1000).toFixed(1)}s\n`));
    return {
        allPassed,
        totalDuration,
        results,
        passed,
        failed,
    };
}
