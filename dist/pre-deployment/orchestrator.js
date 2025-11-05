/**
 * Pre-Deployment Checks Orchestrator
 *
 * Loads configuration, filters checks by stage, and runs them sequentially
 */
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runCheck } from './check-runner.js';
/**
 * Load pre-deployment checks configuration
 *
 * Tries to load from:
 * 1. .deploy-config.json (preDeploymentChecks field)
 * 2. Auto-detection from package.json scripts
 *
 * @param projectRoot - Project root directory
 * @returns Pre-deployment checks configuration
 */
export function loadChecksConfig(projectRoot) {
    // Try loading from .deploy-config.json first
    const deployConfigPath = join(projectRoot, '.deploy-config.json');
    if (existsSync(deployConfigPath)) {
        try {
            const deployConfig = JSON.parse(readFileSync(deployConfigPath, 'utf-8'));
            if (deployConfig.preDeploymentChecks) {
                return deployConfig.preDeploymentChecks;
            }
        }
        catch (error) {
            console.warn(chalk.yellow('⚠️  Could not parse .deploy-config.json, using auto-detection'));
        }
    }
    // Fallback to auto-detection from package.json
    return autoDetectChecks(projectRoot);
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
 * @param projectRoot - Project root directory
 * @returns Auto-detected checks configuration
 */
function autoDetectChecks(projectRoot) {
    const packageJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
        return {};
    }
    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const scripts = packageJson.scripts || {};
        const config = {};
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
        // Detect E2E tests
        if (scripts['test:e2e']) {
            config.e2e = {
                command: 'npm run test:e2e',
                timeout: 180000, // 3 minutes
                stages: ['staging', 'production'], // Only run on staging/production
            };
        }
        // Detect linting
        if (scripts.lint) {
            config.lint = {
                command: 'npm run lint',
                timeout: 30000, // 30 seconds
            };
        }
        return config;
    }
    catch (error) {
        console.warn(chalk.yellow('⚠️  Could not parse package.json, skipping auto-detection'));
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
export function getChecksForStage(config, stage) {
    const checks = [];
    // Helper to normalize boolean|CheckConfig to CheckConfig
    function normalizeCheck(check, defaultConfig) {
        if (check === false || check === undefined)
            return null;
        if (check === true)
            return defaultConfig;
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
        stages: ['staging', 'production'],
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
function shouldRunCheck(check, stage) {
    // Disabled checks don't run
    if (check.enabled === false)
        return false;
    // If stages not specified, run on all stages
    if (!check.stages || check.stages.length === 0)
        return true;
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
export async function runPreDeploymentChecks(projectRoot, stage) {
    const config = loadChecksConfig(projectRoot);
    const checks = getChecksForStage(config, stage);
    // If no checks configured, return success
    if (checks.length === 0) {
        console.log(chalk.yellow('\n⚠️  No pre-deployment checks configured'));
        console.log(chalk.gray('   Add preDeploymentChecks to .deploy-config.json or scripts to package.json\n'));
        return {
            allPassed: true,
            totalDuration: 0,
            results: [],
            passed: 0,
            failed: 0,
        };
    }
    const startTime = Date.now();
    const results = [];
    let passed = 0;
    let failed = 0;
    // Run checks sequentially
    for (const check of checks) {
        // Note: check runner now handles all output (header, streaming, summary)
        // including collapsing on success
        const result = await runCheck(check, projectRoot);
        results.push(result);
        if (result.success) {
            passed++;
        }
        else {
            failed++;
            // Show error details for failures
            console.log(chalk.red(`   Error: ${result.error}\n`));
            // Stop on first failure
            break;
        }
    }
    const totalDuration = Date.now() - startTime;
    const allPassed = failed === 0;
    // Print summary with better visual hierarchy
    console.log('\n' + chalk.bold('═'.repeat(60)));
    if (allPassed) {
        console.log(chalk.bold.green('✅ All Pre-Deployment Checks Passed'));
    }
    else {
        console.log(chalk.bold.red('❌ Pre-Deployment Checks Failed'));
    }
    console.log(chalk.bold('═'.repeat(60)));
    console.log(chalk.white(`\nPassed: ${passed}/${checks.length}`));
    console.log(chalk.white(`Total Duration: ${(totalDuration / 1000).toFixed(1)}s\n`));
    return {
        allPassed,
        totalDuration,
        results,
        passed,
        failed,
    };
}
