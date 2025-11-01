import { ProjectConfig, DeploymentStage, DeploymentResult } from '../types.js';
/**
 * Deployment orchestrator - manages the high-level deployment workflow
 *
 * Responsible for:
 * - Coordinating deployment stages
 * - Running build commands
 * - Executing SST deployments with real-time output
 * - Extracting deployment artifacts (CloudFront IDs, etc.)
 *
 * @example
 * ```typescript
 * const orchestrator = new DeploymentOrchestrator(config, '/path/to/project');
 * const result = await orchestrator.executeDeploy(stage, {
 *   onStart: () => console.log('Starting...'),
 *   onComplete: (distId) => console.log('Done!', distId),
 * });
 * ```
 */
export declare class DeploymentOrchestrator {
    private config;
    private projectRoot;
    constructor(config: ProjectConfig, projectRoot?: string);
    /**
     * Detect if this is an SST project by checking for sst.config file
     *
     * @returns True if sst.config.ts or sst.config.js exists
     */
    isSSTProject(): boolean;
    /**
     * Run build command (for non-SST projects)
     * SST projects handle building internally during deployment
     *
     * @throws {Error} If build command fails
     */
    runBuild(): Promise<void>;
    /**
     * Execute deployment command and extract CloudFront distribution ID
     *
     * @param stage - Deployment stage (development, staging, production)
     * @returns CloudFront distribution ID if found, null otherwise
     * @throws {Error} If deployment fails
     */
    executeDeploy(stage: DeploymentStage): Promise<string | null>;
    /**
     * Run SST deploy with real-time streaming output
     *
     * Shows the last 4 lines of deployment output with smart formatting:
     * - Blue for building/bundling operations
     * - Green for resource creation
     * - Red for errors
     * - Yellow for applying/installing
     * - Cyan for waiting states
     *
     * @param stage - Deployment stage name
     * @param sstStage - SST-specific stage name
     * @param spinner - Ora spinner instance for status updates
     * @returns Complete stdout from SST deployment
     * @throws {Error} If SST deploy exits with non-zero code
     *
     * @private
     */
    private runSSTDeployWithStreaming;
    /**
     * Extract CloudFront distribution ID from SST deployment output
     *
     * Looks for patterns like:
     * - CloudFront URLs: https://d1234abcd.cloudfront.net
     * - JSON output with distributionId field
     *
     * @param output - Complete stdout from SST deployment
     * @returns Distribution ID (e.g., "d1234abcd") or null if not found
     *
     * @example
     * ```typescript
     * const distId = extractCloudFrontDistributionId(sstOutput);
     * // Returns: "d1muqpyoeowt1o"
     * ```
     */
    extractCloudFrontDistributionId(output: string): string | null;
    /**
     * Print deployment summary on success
     *
     * @param result - Deployment result object
     * @param stageTimings - Array of stage timing information
     */
    printDeploymentSummary(result: DeploymentResult, stageTimings: {
        name: string;
        duration: number;
    }[]): void;
    /**
     * Print deployment summary on failure
     *
     * @param result - Deployment result object
     * @param stageTimings - Array of stage timing information
     */
    printDeploymentFailureSummary(result: DeploymentResult, stageTimings: {
        name: string;
        duration: number;
    }[]): void;
}
//# sourceMappingURL=orchestrator.d.ts.map