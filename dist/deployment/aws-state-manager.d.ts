/**
 * AWS State Management
 *
 * Handles extraction and discovery of AWS resources deployed by SST.
 * Focuses on discovering CloudFront distribution IDs from deployment output.
 */
import type { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Extract CloudFront distribution ID from SST deployment output
 *
 * SST outputs CloudFront URLs in format: https://d1234abcd.cloudfront.net
 * This function extracts the distribution ID (e.g., "d1234abcd")
 *
 * @param output - Complete stdout from SST deployment
 * @returns Distribution ID (e.g., "d1muqpyoeowt1o") or null if not found
 *
 * @example
 * ```typescript
 * const output = "Frontend URL: https://d1muqpyoeowt1o.cloudfront.net";
 * const distId = extractCloudFrontDistributionId(output);
 * // Returns: "d1muqpyoeowt1o"
 * ```
 */
export declare function extractCloudFrontDistributionId(output: string): string | null;
/**
 * Validate CloudFront distribution ID format
 *
 * CloudFront distribution IDs follow a specific format:
 * - Start with 'd' (lowercase)
 * - Followed by 13 alphanumeric characters
 * - Total: 14 characters
 *
 * @param distributionId - The ID to validate
 * @returns True if valid CloudFront distribution ID format
 *
 * @example
 * ```typescript
 * isValidDistributionId('d1muqpyoeowt1o'); // true
 * isValidDistributionId('E1234567890ABC'); // false (wrong prefix)
 * ```
 */
export declare function isValidDistributionId(distributionId: string): boolean;
/**
 * Determine the correct AWS region for a stage
 *
 * CloudFront is always in us-east-1, but other services may vary.
 * This helper returns the appropriate region for different service types.
 *
 * @param stage - Deployment stage
 * @param config - Project configuration
 * @param serviceType - Type of AWS service ('cloudfront' | 'lambda' | 'default')
 * @returns AWS region string
 *
 * @example
 * ```typescript
 * getAwsRegion('production', config, 'cloudfront');
 * // Returns: "us-east-1"
 *
 * getAwsRegion('staging', config, 'lambda');
 * // Returns: Configured region or "us-east-1"
 * ```
 */
export declare function getAwsRegion(stage: DeploymentStage, config: ProjectConfig, serviceType?: 'cloudfront' | 'lambda' | 'default'): string;
/**
 * Extract infrastructure details from deployment output
 *
 * Parses SST output to extract useful information about deployed resources.
 *
 * @param output - Deployment output from SST
 * @returns Object with extracted infrastructure details
 *
 * @example
 * ```typescript
 * const details = extractInfrastructureDetails(sstOutput);
 * console.log(details.cloudFrontUrl);
 * // https://d1muqpyoeowt1o.cloudfront.net
 * ```
 */
export declare function extractInfrastructureDetails(output: string): {
    cloudFrontId: string | null;
    cloudFrontUrl: string | null;
    apiEndpoint: string | null;
};
//# sourceMappingURL=aws-state-manager.d.ts.map