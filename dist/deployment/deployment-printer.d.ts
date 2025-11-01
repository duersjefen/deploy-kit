/**
 * Deployment Result Formatting
 *
 * Handles printing deployment summaries and failure reports.
 * Pure functions for formatting deployment results.
 */
import type { DeploymentResult } from '../types.js';
export interface StageTiming {
    name: string;
    duration: number;
}
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
export declare function printDeploymentSummary(result: DeploymentResult, stageTimings: StageTiming[]): void;
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
export declare function printDeploymentFailureSummary(result: DeploymentResult, stageTimings: StageTiming[]): void;
//# sourceMappingURL=deployment-printer.d.ts.map