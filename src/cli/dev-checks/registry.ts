/**
 * Development Pre-Flight Checks Registry
 * Manages registration and execution of all dev environment checks
 */

import chalk from 'chalk';
import type { ProjectConfig } from '../../types.js';
import type { CheckResult, DevCheck } from './types.js';
import { createAwsCredentialsCheck } from './aws-credentials.js';
import { createSstLockCheck } from './sst-lock.js';
import { createRunningSstProcessCheck } from './running-sst-processes.js';
import { createPortAvailabilityCheck } from './port-availability.js';
import { createSstConfigCheck } from './sst-config.js';
import { createSstStateHealthCheck } from './sst-state-health.js';
import { createRecursiveSstDevCheck } from './recursive-sst-dev.js';
import { createNextJsCanaryFeaturesCheck } from './nextjs-canary.js';
import { createTurbopackMigrationCheck } from './turbopack-migration.js';
import { createPulumiOutputUsageCheck } from './pulumi-output.js';
import { createLambdaReservedVarsCheck } from './lambda-reserved-vars.js';
import { getEventEmitter } from '../../dashboard/event-emitter.js';
import {
  createCheckStartEvent,
  createCheckCompleteEvent,
  createChecksSummaryEvent,
} from '../../dashboard/index.js';

/**
 * Safe fixes that can be auto-applied without user confirmation
 */
const SAFE_FIX_TYPES = ['recursive_sst_dev', 'nextjs_canary_features', 'sst_locks', 'running_sst_processes'];

/**
 * Create all development pre-flight checks
 */
export function getDevChecks(
  projectRoot: string,
  config: ProjectConfig | null,
  requestedPort: number = 3000,
  verbose: boolean = false
): DevCheck[] {
  return [
    { name: 'AWS Credentials', check: createAwsCredentialsCheck(projectRoot, config) },
    { name: 'SST Lock', check: createSstLockCheck(projectRoot) },
    { name: 'Running SST Processes', check: createRunningSstProcessCheck(projectRoot, verbose) },
    { name: 'Port Availability', check: createPortAvailabilityCheck(requestedPort) },
    { name: 'SST Config', check: createSstConfigCheck(projectRoot, 'dev') }, // Use 'dev' mode - warnings only for deployment issues
    { name: '.sst Directory Health', check: createSstStateHealthCheck(projectRoot, config) },
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
 *
 * Enhanced Output (v2.9.0):
 * - Progress indicators (▶)
 * - Individual check timing
 * - Summary box with results
 * - Total duration
 */
export async function runDevChecks(
  projectRoot: string,
  config: ProjectConfig | null,
  requestedPort: number = 3000,
  verbose: boolean = false
): Promise<{ allPassed: boolean; results: CheckResult[] }> {
  const checks = getDevChecks(projectRoot, config, requestedPort, verbose);

  // Print header
  console.log(chalk.bold.cyan('\n🔍 Running Development Pre-Flight Checks'));
  console.log(chalk.gray(`   Checks: ${checks.length}`));
  if (verbose) {
    console.log(chalk.gray('   Mode: Verbose'));
  }
  console.log(''); // Empty line

  const startTime = Date.now();
  const results: CheckResult[] = [];
  let passed = 0;
  let failed = 0;
  let autoFixed = 0;

  const emitter = getEventEmitter();

  for (const check of checks) {
    const checkStartTime = Date.now();

    // Emit check start event
    emitter.emitEvent(createCheckStartEvent(check.name));

    console.log(chalk.cyan(`▶ Running: ${check.name}`));
    console.log(chalk.gray('  Validating development environment\n'));

    try {
      const result = await check.check();
      const checkDuration = Date.now() - checkStartTime;
      const durationSecs = (checkDuration / 1000).toFixed(1);

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

          if (reCheckResult.passed) {
            passed++;
            autoFixed++;
            console.log(chalk.green(`✅ ${check.name} passed after auto-fix (${durationSecs}s)\n`));

            // Emit check complete event (auto-fixed)
            emitter.emitEvent(createCheckCompleteEvent(check.name, reCheckResult, checkDuration, true));
          } else {
            failed++;
            console.log(chalk.red(`❌ ${check.name} failed - fix verification failed (${durationSecs}s)\n`));

            // Emit check complete event (failed after auto-fix)
            emitter.emitEvent(createCheckCompleteEvent(check.name, reCheckResult, checkDuration, false));
          }
        } else {
          // Risky fixes: Show issue but don't auto-fix (manual intervention required)
          failed++;
          console.log(chalk.red(`❌ ${check.name} failed (${durationSecs}s)`));
          console.log(chalk.red(`   Error: ${result.issue}`));
          if (result.manualFix) {
            console.log(chalk.gray(`   Fix: ${result.manualFix}`));
          }
          console.log(''); // Empty line
          results.push(result);

          // Emit check complete event
          emitter.emitEvent(createCheckCompleteEvent(check.name, result, checkDuration, false));
        }
      } else {
        // Check passed or no auto-fix available
        if (result.passed) {
          passed++;
          console.log(chalk.green(`✅ ${check.name} passed (${durationSecs}s)\n`));
        } else {
          failed++;
          console.log(chalk.red(`❌ ${check.name} failed (${durationSecs}s)`));
          console.log(chalk.red(`   Error: ${result.issue}`));
          if (result.manualFix) {
            console.log(chalk.gray(`   Fix: ${result.manualFix}`));
          }
          console.log(''); // Empty line
        }
        results.push(result);

        // Emit check complete event
        emitter.emitEvent(createCheckCompleteEvent(check.name, result, checkDuration, false));
      }
    } catch (error) {
      const checkDuration = Date.now() - checkStartTime;
      const durationSecs = (checkDuration / 1000).toFixed(1);
      console.log(chalk.yellow(`⚠️  ${check.name}: Could not verify - skipping (${durationSecs}s)\n`));
      const skipResult = { passed: true };
      results.push(skipResult); // Skip check on error
      passed++; // Count as passed (skipped)

      // Emit check complete event (skipped)
      emitter.emitEvent(createCheckCompleteEvent(check.name, skipResult, checkDuration, false));
    }
  }

  const totalDuration = Date.now() - startTime;
  const allPassed = failed === 0;

  // Emit checks summary event
  emitter.emitEvent(
    createChecksSummaryEvent(checks.length, passed, failed, autoFixed, totalDuration)
  );

  // Print summary
  console.log(chalk.bold('═'.repeat(60)));
  if (allPassed) {
    console.log(chalk.bold.green('✅ All Development Pre-Flight Checks Passed'));
  } else {
    console.log(chalk.bold.red('❌ Development Pre-Flight Checks Failed'));
  }
  console.log(chalk.bold('═'.repeat(60)));

  console.log(chalk.gray(`\nPassed: ${passed}/${checks.length}`));
  if (autoFixed > 0) {
    console.log(chalk.gray(`Auto-Fixed: ${autoFixed}`));
  }
  if (failed > 0) {
    console.log(chalk.gray(`Failed: ${failed}`));
  }
  console.log(chalk.gray(`Total Duration: ${(totalDuration / 1000).toFixed(1)}s\n`));

  return {
    allPassed,
    results,
  };
}
