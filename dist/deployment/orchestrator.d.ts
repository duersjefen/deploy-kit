/**
 * Deployment Orchestrator - Main Entry Point
 *
 * Thin wrapper that coordinates the deployment workflow using specialized modules.
 *
 * Architecture:
 * - orchestration-coordinator: High-level workflow (build, deploy, extract)
 * - aws-state-manager: AWS resource state tracking and extraction
 * - deployment-printer: Result formatting and output
 *
 * This class provides the public API while delegating to focused modules.
 */
import type { ProjectConfig, DeploymentStage, DeploymentResult } from '../types.js';
import { type StageTiming } from './deployment-printer.js';
/**
 * Main deployment orchestrator class
 *
 * Coordinates the complete deployment workflow:
 * 1. Build the application
 * 2. Deploy to stage (SST or custom script)
 * 3. Extract deployment artifacts (CloudFront ID, etc.)
 * 4. Print results
 *
 * @example
 * ```typescript
 * const orchestrator = new DeploymentOrchestrator(config, '/path/to/project');
 * if (orchestrator.isSSTProject()) {
 *   const distId = await orchestrator.executeDeploy('staging');
 *   orchestrator.printDeploymentSummary(result, timings);
 * }
 * ```
 */
export declare class DeploymentOrchestrator {
    private config;
    private projectRoot;
    /**
     * Create a new deployment orchestrator
     *
     * @param config - Project configuration
     * @param projectRoot - Root directory of the project (defaults to cwd)
     */
    constructor(config: ProjectConfig, projectRoot?: string);
    /**
     * Detect if this is an SST project
     *
     * @returns True if sst.config.ts or sst.config.js exists
     */
    isSSTProject(): boolean;
    /**
     * Run build command (for non-SST projects)
     *
     * @throws {Error} If build command fails
     */
    runBuild(): Promise<void>;
    /**
     * Execute deployment and extract CloudFront distribution ID
     *
     * @param stage - Deployment stage
     * @returns CloudFront distribution ID if found, null otherwise
     * @throws {Error} If deployment fails
     */
    executeDeploy(stage: DeploymentStage, options?: {
        isDryRun?: boolean;
    }): Promise<string | null>;
    /**
     * Extract CloudFront distribution ID from deployment output
     *
     * @param output - Deployment output text
     * @returns Distribution ID or null
     */
    extractCloudFrontDistributionId(output: string): string | null;
    /**
     * Print deployment success summary
     *
     * @param result - Deployment result
     * @param stageTimings - Timing information for each stage
     */
    printDeploymentSummary(result: DeploymentResult, stageTimings: StageTiming[]): void;
    /**
     * Print deployment failure summary with recovery suggestions
     *
     * @param result - Deployment result
     * @param stageTimings - Timing information for each stage
     */
    printDeploymentFailureSummary(result: DeploymentResult, stageTimings: StageTiming[]): void;
}
//# sourceMappingURL=orchestrator.d.ts.map