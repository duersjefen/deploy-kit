/**
 * AWS State Management
 *
 * Handles extraction and discovery of AWS resources deployed by SST.
 * Focuses on discovering CloudFront distribution IDs from deployment output.
 */
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
export function extractCloudFrontDistributionId(output) {
    // Pattern 1: CloudFront URLs - https://d1234abcd.cloudfront.net
    // Extract the distribution ID (the part before .cloudfront.net)
    const cloudFrontMatch = output.match(/https:\/\/([a-z0-9]+)\.cloudfront\.net/i);
    if (cloudFrontMatch && cloudFrontMatch[1]) {
        return cloudFrontMatch[1];
    }
    // Pattern 2: JSON output with distributionId field
    // Some SST versions output JSON with distribution info
    try {
        const jsonMatch = output.match(/\{[\s\S]*?"distributionId"[\s\S]*?\}/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[0]);
            if (json.distributionId) {
                return json.distributionId;
            }
        }
    }
    catch {
        // JSON parsing failed, continue to next method
    }
    // No distribution ID found
    return null;
}
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
export function isValidDistributionId(distributionId) {
    // CloudFront distribution IDs: 14 chars, start with 'd', alphanumeric
    return /^d[a-z0-9]{13}$/i.test(distributionId);
}
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
export function getAwsRegion(stage, config, serviceType = 'default') {
    // CloudFront API is always in us-east-1
    if (serviceType === 'cloudfront') {
        return 'us-east-1';
    }
    // Check if stage-specific region is configured
    const stageConfig = config.stageConfig[stage];
    if (stageConfig && 'awsRegion' in stageConfig && stageConfig.awsRegion) {
        return stageConfig.awsRegion;
    }
    // Default fallback
    return 'us-east-1';
}
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
export function extractInfrastructureDetails(output) {
    const cloudFrontId = extractCloudFrontDistributionId(output);
    // Extract CloudFront URL if ID found
    const cloudFrontUrlMatch = output.match(/https:\/\/d[a-z0-9]+\.cloudfront\.net/i);
    const cloudFrontUrl = cloudFrontUrlMatch ? cloudFrontUrlMatch[0] : null;
    // Extract API endpoint if present
    const apiMatch = output.match(/https:\/\/[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com/i);
    const apiEndpoint = apiMatch ? apiMatch[0] : null;
    return {
        cloudFrontId,
        cloudFrontUrl,
        apiEndpoint,
    };
}
