import { ProjectConfig, DeploymentStage } from '../../types.js';
/**
 * CloudFront operations manager
 *
 * Handles:
 * - Cache invalidation
 * - Distribution ID discovery
 * - Post-deployment audits
 * - Orphaned distribution cleanup
 *
 * @example
 * ```typescript
 * const cfOps = new CloudFrontOperations(config, 'my-aws-profile');
 * await cfOps.invalidateCache('staging', 'E1234567890ABC');
 * await cfOps.auditAndCleanup('production');
 * ```
 */
export declare class CloudFrontOperations {
    private config;
    private awsProfile?;
    /**
     * Create a new CloudFront operations manager
     *
     * @param config - Project configuration
     * @param awsProfile - Optional AWS profile name for authentication
     */
    constructor(config: ProjectConfig, awsProfile?: string);
    /**
     * Invalidate CloudFront cache
     *
     * Attempts to find distribution ID using multiple strategies:
     * 1. Use provided distributionId parameter
     * 2. Check environment variable (CLOUDFRONT_DIST_ID_{STAGE})
     * 3. Query CloudFront API for recent distributions
     *
     * @param stage - Deployment stage
     * @param distributionId - Optional distribution ID (auto-detected if not provided)
     *
     * @example
     * ```typescript
     * // With known distribution ID
     * await cfOps.invalidateCache('staging', 'E1234567890ABC');
     *
     * // Auto-detect distribution ID
     * await cfOps.invalidateCache('staging');
     * ```
     */
    invalidateCache(stage: DeploymentStage, distributionId: string | null): Promise<void>;
    /**
     * Find CloudFront distribution ID by querying API
     *
     * Used as fallback if distribution ID is not extracted from deployment output.
     * Searches for distributions matching the stage's domain configuration.
     *
     * @param stage - Deployment stage
     * @returns Distribution ID or null if not found
     *
     * @example
     * ```typescript
     * const distId = await cfOps.findDistributionId('staging');
     * // Returns: "E1234567890ABC" or null
     * ```
     */
    findDistributionId(stage: DeploymentStage): Promise<string | null>;
    /**
     * Audit CloudFront after deployment and offer to cleanup orphans
     *
     * Runs a comprehensive audit that:
     * - Lists all CloudFront distributions
     * - Identifies orphaned distributions (not in config)
     * - Calculates estimated cost savings
     * - Offers interactive cleanup option
     *
     * @param stage - Deployment stage (for context, not required)
     *
     * @example
     * ```typescript
     * await cfOps.auditAndCleanup('production');
     * // Prompts user if orphans found:
     * // "Found 3 orphaned distributions (~$7.50/month). Cleanup? (y/n)"
     * ```
     */
    auditAndCleanup(stage: DeploymentStage): Promise<void>;
    /**
     * Fetch all relevant DNS records from Route53 for configured domains
     *
     * @param dnsClient - Route53 DNS client instance
     * @returns Array of DNS records for all configured domains
     * @private
     */
    private fetchAllRelevantDNSRecords;
    /**
     * Start CloudFront cleanup in background (non-blocking)
     *
     * Disables and deletes orphaned distributions that are safe to remove.
     * This operation can take several minutes as CloudFront requires waiting
     * for distributions to fully deploy before deletion.
     *
     * @param stage - Deployment stage (for context)
     * @private
     */
    private startBackgroundCleanup;
}
//# sourceMappingURL=operations.d.ts.map