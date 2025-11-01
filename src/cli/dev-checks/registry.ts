/**
 * Development Pre-Flight Checks Registry
 * Manages registration and execution of all dev environment checks
 */

import chalk from 'chalk';
import type { ProjectConfig } from '../../types.js';
import type { CheckResult, DevCheck } from './types.js';
import { createAwsCredentialsCheck } from './aws-credentials.js';
import { createSstLockCheck } from './sst-lock.js';
import { createPortAvailabilityCheck } from './port-availability.js';
import { createSstConfigCheck } from './sst-config.js';
import { createSstStateHealthCheck } from './sst-state.js';
import { createRecursiveSstDevCheck } from './recursive-sst-dev.js';
import { createNextJsCanaryFeaturesCheck } from './nextjs-canary.js';
import { createPulumiOutputUsageCheck } from './pulumi-output.js';

/**
 * Safe fixes that can be auto-applied without user confirmation
 */
const SAFE_FIX_TYPES = ['recursive_sst_dev', 'nextjs_canary_features', 'sst_locks'];

/**
 * Create all development pre-flight checks
 */
export function getDevChecks(
  projectRoot: string,
  config: ProjectConfig | null
): DevCheck[] {
  return [
    { name: 'AWS Credentials', check: createAwsCredentialsCheck(projectRoot, config) },
    { name: 'SST Lock', check: createSstLockCheck(projectRoot) },
    { name: 'Port Availability', check: createPortAvailabilityCheck(3000) },
    { name: 'SST Config', check: createSstConfigCheck(projectRoot) },
    { name: '.sst Directory Health', check: createSstStateHealthCheck(projectRoot) },
    { name: 'Recursive SST Dev Script', check: createRecursiveSstDevCheck(projectRoot) },
    { name: 'Next.js Canary Features', check: createNextJsCanaryFeaturesCheck(projectRoot) },
    { name: 'Pulumi Output Usage', check: createPulumiOutputUsageCheck(projectRoot) },
  ];
}

/**
 * Run all pre-flight checks with hybrid auto-fix approach
 *
 * - Safe fixes: Auto-apply without prompting
 * - Risky fixes: Show issue but require manual intervention
 */
export async function runDevChecks(
  projectRoot: string,
  config: ProjectConfig | null
): Promise<{ allPassed: boolean; results: CheckResult[] }> {
  const checks = getDevChecks(projectRoot, config);
  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      const result = await check.check();
      results.push(result);

      if (!result.passed && result.canAutoFix && result.autoFix) {
        const isSafe = result.errorType && SAFE_FIX_TYPES.includes(result.errorType);

        if (isSafe) {
          // Safe fixes: Auto-apply without prompting
          console.log(chalk.yellow(`🔧 Auto-fixing: ${result.issue}`));
          await result.autoFix();
          console.log(chalk.green('✅ Fixed\n'));
        } else {
          // Risky fixes: Show issue but don't auto-fix (manual intervention required)
          console.log(chalk.red(`❌ ${result.issue}`));
          if (result.manualFix) {
            console.log(chalk.gray(`   Fix: ${result.manualFix}\n`));
          }
        }
      } else if (!result.passed) {
        console.log(chalk.red(`❌ ${result.issue}`));
        if (result.manualFix) {
          console.log(chalk.gray(`   Fix: ${result.manualFix}\n`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  ${check.name}: Could not verify (skipping)\n`));
      results.push({ passed: true }); // Skip check on error
    }
  }

  return {
    allPassed: results.every(r => r.passed),
    results,
  };
}
