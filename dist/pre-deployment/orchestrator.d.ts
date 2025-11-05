/**
 * Pre-Deployment Checks Orchestrator
 *
 * Loads configuration, filters checks by stage, and runs them sequentially
 */
import type { CheckConfig, PreDeploymentChecksConfig, PreDeploymentChecksSummary } from './types.js';
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
export declare function loadChecksConfig(projectRoot: string): PreDeploymentChecksConfig;
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
export declare function getChecksForStage(config: PreDeploymentChecksConfig, stage: string): CheckConfig[];
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
export declare function runPreDeploymentChecks(projectRoot: string, stage: string): Promise<PreDeploymentChecksSummary>;
//# sourceMappingURL=orchestrator.d.ts.map