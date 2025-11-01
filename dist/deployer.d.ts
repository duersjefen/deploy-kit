import { ProjectConfig, DeploymentStage, DeploymentResult } from './types.js';
/**
 * Main deployment orchestrator
 *
 * Handles the complete deployment workflow:
 * 1. Pre-deployment safety checks (git, tests, credentials)
 * 2. Building application
 * 3. Deploying via SST or custom script
 * 4. Post-deployment verification (health checks, CloudFront validation)
 * 5. Cache invalidation
 */
export declare class DeploymentKit {
    private config;
    private projectRoot;
    private lockManager;
    private healthChecker;
    private preChecks;
    private postChecks;
    constructor(config: ProjectConfig, projectRoot?: string);
    /**
     * Detect if this is an SST project
     */
    private isSSTProject;
    /**
     * Full deployment workflow
     */
    deploy(stage: DeploymentStage): Promise<DeploymentResult>;
    /**
     * Print deployment summary on success
     */
    private printDeploymentSummary;
    /**
     * Print deployment summary on failure
     */
    private printDeploymentFailureSummary;
    /**
     * Get deployment status without deploying
     */
    getStatus(stage: DeploymentStage): Promise<void>;
    /**
     * Recover from failed deployment
     */
    recover(stage: DeploymentStage): Promise<void>;
    /**
     * Validate health after deployment
     */
    validateHealth(stage: DeploymentStage): Promise<boolean>;
    /**
     * Run build command
     */
    private runBuild;
    /**
     * Run deployment command
     */
    /**
     * Run deployment command and extract CloudFront distribution ID
     */
    /**
     * Run deployment command with real-time streaming output
     */
    private runDeploy;
    /**
     * Run SST deploy with real-time streaming output (last 5 lines with improved UI)
     */
    private runSSTDeployWithStreaming;
    /**
   * Extract CloudFront distribution ID from SST deployment output
   * Looks for patterns like:
   *   - Outputs section with domain names
   *   - CloudFront distribution references
   */
    private extractCloudFrontDistributionId;
    /**
     * Invalidate CloudFront cache
     */
    /**
     * Invalidate CloudFront cache
     */
    private invalidateCache;
    /**
     * Find CloudFront distribution ID by querying API
     * Used as fallback if distribution ID is not extracted from deployment output
     */
    private findCloudFrontDistributionId;
    /**
     * Get AWS region for the deployment stage
     * Falls back to us-east-1 if not configured
     */
    private getAwsRegion;
    /**
     * Audit CloudFront after deployment and offer to cleanup orphans
     */
    private postDeploymentCloudFrontAudit;
    /**
     * Start CloudFront cleanup in background (non-blocking)
     */
    private startBackgroundCloudFrontCleanup;
}
//# sourceMappingURL=deployer.d.ts.map