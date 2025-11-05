/**
 * Pre-Deployment Checks Orchestrator
 *
 * Loads configuration, filters checks by stage, and runs them sequentially
 */

import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runCheck } from './check-runner.js';
import type {
  CheckConfig,
  PreDeploymentChecksConfig,
  PreDeploymentChecksSummary,
} from './types.js';
import type { E2ETestStrategy } from '../cli/utils/config-validator.js';

/**
 * Load pre-deployment checks configuration
 *
 * Tries to load from:
 * 1. .deploy-config.json (preDeploymentChecks field)
 * 2. Auto-detection from package.json scripts
 *
 * Also extracts e2eTestStrategy from .deploy-config.json to control E2E test execution.
 *
 * @param projectRoot - Project root directory
 * @returns Pre-deployment checks configuration
 */
export function loadChecksConfig(
  projectRoot: string
): PreDeploymentChecksConfig {
  // Try loading from .deploy-config.json first
  const deployConfigPath = join(projectRoot, '.deploy-config.json');
  let e2eTestStrategy: E2ETestStrategy | undefined;

  if (existsSync(deployConfigPath)) {
    try {
      const deployConfig = JSON.parse(readFileSync(deployConfigPath, 'utf-8'));

      // Extract e2eTestStrategy if defined
      if (deployConfig.e2eTestStrategy) {
        e2eTestStrategy = deployConfig.e2eTestStrategy;
      }

      // If preDeploymentChecks is explicitly configured, use it
      if (deployConfig.preDeploymentChecks) {
        return deployConfig.preDeploymentChecks;
      }
    } catch (error) {
      console.warn(
        chalk.yellow('⚠️  Could not parse .deploy-config.json, using auto-detection')
      );
    }
  }

  // Fallback to auto-detection from package.json
  return autoDetectChecks(projectRoot, e2eTestStrategy);
}

/**
 * Auto-detect checks from package.json scripts
 *
 * Looks for common script names:
 * - typecheck
 * - test
 * - build
 * - test:e2e
 * - lint
 *
 * E2E test behavior is controlled by e2eTestStrategy:
 * - If strategy.enabled = false, E2E tests are skipped
 * - If strategy.stages defined, only runs on those stages
 * - If not configured, defaults to production-only: { enabled: true, stages: ['production'] }
 *
 * @param projectRoot - Project root directory
 * @param e2eTestStrategy - Optional E2E test execution strategy from .deploy-config.json
 * @returns Auto-detected checks configuration
 */
function autoDetectChecks(
  projectRoot: string,
  e2eTestStrategy?: E2ETestStrategy
): PreDeploymentChecksConfig {
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};
    const config: PreDeploymentChecksConfig = {};

    // Detect type checking
    if (scripts.typecheck) {
      config.typecheck = {
        command: 'npm run typecheck',
        timeout: 30000, // 30 seconds
      };
    }

    // Detect tests
    if (scripts.test) {
      config.test = {
        command: 'npm test',
        timeout: 60000, // 1 minute
      };
    }

    // Detect build
    if (scripts.build) {
      config.build = {
        command: 'npm run build',
        timeout: 120000, // 2 minutes
      };
    }

    // Detect E2E tests (controlled by e2eTestStrategy)
    if (scripts['test:e2e']) {
      // Default to production-only if not configured
      const strategy = e2eTestStrategy || { enabled: true, stages: ['production'] };

      // Skip E2E tests if explicitly disabled
      if (strategy.enabled !== false) {
        config.e2e = {
          command: strategy.script || 'npm run test:e2e',
          timeout: strategy.timeout || 180000, // 3 minutes default
          stages: strategy.stages || ['production'], // Production-only default
        };
      }
    }

    // Detect linting
    if (scripts.lint) {
      config.lint = {
        command: 'npm run lint',
        timeout: 30000, // 30 seconds
      };
    }

    return config;
  } catch (error) {
    console.warn(
      chalk.yellow('⚠️  Could not parse package.json, skipping auto-detection')
    );
    return {};
  }
}

/**
 * Get checks to run for a specific stage
 *
 * Filters checks based on:
 * - enabled flag
 * - stages array (if specified)
 * - stage parameter
 *
 * @param config - Pre-deployment checks configuration
 * @param stage - Deployment stage
 * @returns Array of checks to run
 */
export function getChecksForStage(
  config: PreDeploymentChecksConfig,
  stage: string
): CheckConfig[] {
  const checks: CheckConfig[] = [];

  // Helper to normalize boolean|CheckConfig to CheckConfig
  function normalizeCheck(
    check: CheckConfig | boolean | undefined,
    defaultConfig: Partial<CheckConfig>
  ): CheckConfig | null {
    if (check === false || check === undefined) return null;
    if (check === true) return defaultConfig as CheckConfig;
    return { ...defaultConfig, ...check };
  }

  // Type check
  const typecheck = normalizeCheck(config.typecheck, {
    name: 'Type Check',
    command: 'npm run typecheck',
    timeout: 30000,
  });
  if (typecheck && shouldRunCheck(typecheck, stage)) {
    checks.push(typecheck);
  }

  // Unit tests
  const test = normalizeCheck(config.test, {
    name: 'Unit Tests',
    command: 'npm test',
    timeout: 60000,
  });
  if (test && shouldRunCheck(test, stage)) {
    checks.push(test);
  }

  // Build
  const build = normalizeCheck(config.build, {
    name: 'Build',
    command: 'npm run build',
    timeout: 120000,
  });
  if (build && shouldRunCheck(build, stage)) {
    checks.push(build);
  }

  // Lint
  const lint = normalizeCheck(config.lint, {
    name: 'Lint',
    command: 'npm run lint',
    timeout: 30000,
  });
  if (lint && shouldRunCheck(lint, stage)) {
    checks.push(lint);
  }

  // E2E tests
  const e2e = normalizeCheck(config.e2e, {
    name: 'E2E Tests',
    command: 'npm run test:e2e',
    timeout: 180000,
    stages: ['production'], // Default: production-only (configurable via e2eTestStrategy)
  });
  if (e2e && shouldRunCheck(e2e, stage)) {
    checks.push(e2e);
  }

  // Custom checks
  if (config.custom) {
    for (const customCheck of config.custom) {
      if (shouldRunCheck(customCheck, stage)) {
        checks.push(customCheck);
      }
    }
  }

  return checks;
}

/**
 * Check if a check should run for the given stage
 *
 * @param check - Check configuration
 * @param stage - Deployment stage
 * @returns Whether the check should run
 */
function shouldRunCheck(check: CheckConfig, stage: string): boolean {
  // Disabled checks don't run
  if (check.enabled === false) return false;

  // If stages not specified, run on all stages
  if (!check.stages || check.stages.length === 0) return true;

  // Otherwise check if current stage is in the list
  return check.stages.includes(stage);
}

/**
 * Run all pre-deployment checks for a stage
 *
 * Runs checks sequentially and stops on first failure.
 * Prints progress and timing for each check.
 *
 * @param projectRoot - Project root directory
 * @param stage - Deployment stage
 * @returns Summary of check results
 *
 * @example
 * ```typescript
 * const summary = await runPreDeploymentChecks('/path/to/project', 'staging');
 * if (!summary.allPassed) {
 *   console.error('Pre-deployment checks failed!');
 *   process.exit(1);
 * }
 * ```
 */
export async function runPreDeploymentChecks(
  projectRoot: string,
  stage: string
): Promise<PreDeploymentChecksSummary> {
  const config = loadChecksConfig(projectRoot);
  const checks = getChecksForStage(config, stage);

  // If no checks configured, return success
  if (checks.length === 0) {
    console.log(chalk.yellow('\n⚠️  No pre-deployment checks configured'));
    console.log(
      chalk.gray('   Add preDeploymentChecks to .deploy-config.json or scripts to package.json\n')
    );
    return {
      allPassed: true,
      totalDuration: 0,
      results: [],
      passed: 0,
      failed: 0,
    };
  }

  const startTime = Date.now();
  const results: Array<Awaited<ReturnType<typeof runCheck>>> = [];
  let passed = 0;
  let failed = 0;

  // Run checks sequentially
  for (const check of checks) {
    const checkName = check.name || check.command;
    console.log(chalk.cyan(`\n▶ Running: ${checkName}`));
    console.log(chalk.gray(`  Command: ${check.command}\n`));

    const result = await runCheck(check, projectRoot);
    results.push(result);

    if (result.success) {
      passed++;
      const durationSecs = (result.duration / 1000).toFixed(1);
      console.log(
        chalk.green(`\n✅ ${checkName} passed (${durationSecs}s)`)
      );
    } else {
      failed++;
      const durationSecs = (result.duration / 1000).toFixed(1);
      console.log(
        chalk.red(`\n❌ ${checkName} failed (${durationSecs}s)`)
      );
      console.log(chalk.red(`   Error: ${result.error}\n`));

      // Stop on first failure
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  const allPassed = failed === 0;

  // Print summary
  console.log(chalk.bold('\n' + '═'.repeat(60)));
  if (allPassed) {
    console.log(chalk.bold.green('✅ All Pre-Deployment Checks Passed'));
  } else {
    console.log(chalk.bold.red('❌ Pre-Deployment Checks Failed'));
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
