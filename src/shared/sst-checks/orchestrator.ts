/**
 * SST Environment Checks Orchestrator (Issue #220: Enhanced with CloudFront & Stage checks)
 * Runs SST-specific checks before deployment with formatted output
 *
 * These are the subset of dev checks that are deployment-relevant:
 * - AWS Credentials
 * - SST Lock
 * - Running SST Processes
 * - SST Config (with SST-VAL-012/012a pattern detection)
 * - .sst Directory Health
 * - Lambda Reserved Environment Variables
 * - Pulumi Output Usage
 * - SST Stage Mismatch (NEW - Issue #220)
 * - CloudFront Domain Conflicts (NEW - Issue #220)
 *
 * Dev-only checks (NOT included):
 * - Port Availability
 * - Recursive SST Dev Script
 * - Next.js Canary Features
 * - Turbopack Migration
 */

import chalk from 'chalk';
import type { ProjectConfig } from '../../types.js';
import type { CheckResult } from '../../cli/dev-checks/types.js';
import { createAwsCredentialsCheck } from '../../cli/dev-checks/aws-credentials.js';
import { createSstLockCheck } from '../../cli/dev-checks/sst-lock.js';
import { createRunningSstProcessCheck } from '../../cli/dev-checks/running-sst-processes.js';
import { createSstConfigCheck } from '../../cli/dev-checks/sst-config.js';
import { createSstStateHealthCheck } from '../../cli/dev-checks/sst-state-health.js';
import { createLambdaReservedVarsCheck } from '../../cli/dev-checks/lambda-reserved-vars.js';
import { createPulumiOutputUsageCheck } from '../../cli/dev-checks/pulumi-output.js';
import { createSstStageMismatchCheck } from '../../cli/dev-checks/sst-stage-mismatch.js';
import { createCloudFrontDomainCheck } from '../../cli/dev-checks/cloudfront-domain-check.js';

interface SstCheckWithName {
  name: string;
  check: () => Promise<CheckResult>;
}

interface SstChecksSummary {
  allPassed: boolean;
  totalDuration: number;
  results: Array<{
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }>;
  passed: number;
  failed: number;
}

/**
 * Get deployment-relevant SST environment checks
 *
 * Issue #220: Added stage parameter to enable CloudFront and stage mismatch checks
 */
function getSstEnvironmentChecks(
  projectRoot: string,
  config: ProjectConfig | null,
  stage: string,
  verbose: boolean = false
): SstCheckWithName[] {
  return [
    { name: 'AWS Credentials', check: createAwsCredentialsCheck(projectRoot, config) },
    { name: 'SST Lock', check: createSstLockCheck(projectRoot) },
    { name: 'Running SST Processes', check: createRunningSstProcessCheck(projectRoot, verbose) },
    { name: 'SST Config', check: createSstConfigCheck(projectRoot, 'deploy') }, // Use 'deploy' mode for strict validation with SST-VAL-012/012a
    { name: '.sst Directory Health', check: createSstStateHealthCheck(projectRoot, config) },
    { name: 'Lambda Reserved Environment Variables', check: createLambdaReservedVarsCheck(projectRoot, verbose) },
    { name: 'Pulumi Output Usage', check: createPulumiOutputUsageCheck(projectRoot) },

    // NEW CHECKS (Issue #220): Prevent CloudFront CNAME conflicts and SST state drift
    { name: 'SST Stage Mismatch', check: createSstStageMismatchCheck(projectRoot, stage) },
    { name: 'CloudFront Domain Conflicts', check: createCloudFrontDomainCheck(projectRoot, stage, config) },
  ];
}

/**
 * Run a single SST environment check with timing
 */
async function runSstCheck(
  check: SstCheckWithName
): Promise<{ passed: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    const result = await check.check();
    const duration = Date.now() - startTime;

    return {
      passed: result.passed,
      duration,
      error: result.manualFix || result.issue,
    };
  } catch (error) {
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
export async function runSstEnvironmentChecks(
  projectRoot: string,
  config: ProjectConfig | null,
  stage: string,
  verbose: boolean = false
): Promise<SstChecksSummary> {
  const checks = getSstEnvironmentChecks(projectRoot, config, stage, verbose);

  if (checks.length === 0) {
    return {
      allPassed: true,
      totalDuration: 0,
      results: [],
      passed: 0,
      failed: 0,
    };
  }

  const startTime = Date.now();
  const results: Array<{
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }> = [];
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
    } else {
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
  } else {
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
