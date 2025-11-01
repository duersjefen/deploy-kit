/**
 * CloudFront API Client
 * Wrapper around AWS CloudFront and Route53 SDKs providing convenient methods
 * for managing CloudFront distributions and validating DNS configurations.
 *
 * All CloudFront operations are performed in us-east-1 (CloudFront global API region).
 * Route53 operations use the specified region for hosted zone queries.
 *
 * @example
 * ```typescript
 * const client = new CloudFrontAPIClient('us-east-1', 'my-profile');
 * const distributions = await client.listDistributions();
 * console.log(`Found ${distributions.length} distributions`);
 * ```
 */
import type { DNSRecord } from '../../types.js';
export interface CloudFrontDistribution {
    Id: string;
    DomainName: string;
    OriginDomain: string;
    Status: string;
    Comment?: string;
    CreatedTime?: Date;
    LastModifiedTime?: Date;
    Enabled: boolean;
    AliasedDomains: string[];
}
/**
 * CloudFront API Client for managing distributions and DNS records
 */
export declare class CloudFrontAPIClient {
    /**
     * Initialize CloudFront and Route53 clients
     *
     * @param region - AWS region for Route53 (CloudFront always uses us-east-1)
     * @param profile - Optional AWS profile name for credentials
     *
     * @example
     * ```typescript
     * const client = new CloudFrontAPIClient('eu-north-1', 'my-aws-profile');
     * ```
     */
    private cfClient;
    private route53Client;
    private awsRegion;
    private awsProfile?;
    constructor(region?: string, profile?: string);
    /**
     * List all CloudFront distributions in the AWS account
     *
     * Retrieves a comprehensive list of all CloudFront distributions with their
     * current configuration and status.
     *
     * @returns Promise resolving to array of CloudFrontDistribution objects
     * @throws {Error} If AWS API call fails
     *
     * @example
     * ```typescript
     * const distributions = await client.listDistributions();
     * distributions.forEach(dist => {
     *   console.log(`${dist.DomainName} (${dist.Status})`);
     * });
     * ```
     */
    listDistributions(): Promise<CloudFrontDistribution[]>;
    /**
     * Get detailed information about a specific CloudFront distribution
     *
     * Retrieves full configuration and status for a distribution by ID.
     * Returns null if distribution doesn't exist.
     *
     * @param distributionId - CloudFront distribution ID (starts with 'E')
     * @returns Promise resolving to CloudFrontDistribution or null if not found
     * @throws {Error} If AWS API call fails
     *
     * @example
     * ```typescript
     * const dist = await client.getDistribution('E123ABC456');
     * if (dist) {
     *   console.log(`Status: ${dist.Status}`);
     * }
     * ```
     */
    getDistribution(distributionId: string): Promise<CloudFrontDistribution | null>;
    /**
     * Disable a CloudFront distribution (required before deletion)
     *
     * Disables the distribution without deleting it. A distribution must be
     * disabled before it can be deleted. Does not affect existing cached content.
     *
     * @param distributionId - CloudFront distribution ID
     * @returns Promise that resolves when distribution is disabled
     * @throws {Error} If update fails or distribution doesn't exist
     *
     * @example
     * ```typescript
     * await client.disableDistribution('E123ABC456');
     * console.log('Distribution disabled');
     * ```
     */
    disableDistribution(distributionId: string): Promise<void>;
    /**
     * Wait for CloudFront distribution to reach deployed status
     *
     * Polls the distribution status until it reaches 'Deployed' or timeout.
     * Useful after creating or updating a distribution.
     *
     * @param distributionId - CloudFront distribution ID
     * @param maxWaitTime - Maximum wait time in milliseconds (default: 1200000 = 20 min)
     * @returns Promise that resolves when distribution is deployed
     * @throws {Error} If timeout is exceeded without reaching Deployed status
     *
     * @example
     * ```typescript
     * await client.waitForDistributionDeployed('E123ABC456', 600000);
     * console.log('Distribution is now deployed');
     * ```
     */
    waitForDistributionDeployed(distributionId: string, maxWaitTime?: number): Promise<void>;
    /**
     * Delete a CloudFront distribution (must be disabled first)
     *
     * Removes a distribution permanently. Distribution must be disabled before deletion.
     * This is irreversible. Ensure you have backups if needed.
     *
     * @param distributionId - CloudFront distribution ID
     * @returns Promise that resolves when distribution is deleted
     * @throws {Error} If distribution is not disabled or deletion fails
     *
     * @example
     * ```typescript
     * await client.disableDistribution('E123ABC456');
     * await client.waitForDistributionDeployed('E123ABC456');
     * await client.deleteDistribution('E123ABC456');
     * console.log('Distribution deleted');
     * ```
     */
    deleteDistribution(distributionId: string): Promise<void>;
    /**
     * Get DNS records from Route53 for a hosted zone
     *
     * Lists all resource record sets in a Route53 hosted zone.
     * Maps AWS Route53 format to standardized DNSRecord format.
     *
     * @param hostedZoneId - Route53 hosted zone ID (with or without /hostedzone/ prefix)
     * @returns Promise resolving to array of DNSRecord objects
     * @throws {Error} If AWS API call fails
     *
     * @example
     * ```typescript
     * const records = await client.getDNSRecords('Z123ABC456');
     * records.forEach(record => {
     *   console.log(`${record.name} (${record.type}): ${record.value}`);
     * });
     * ```
     */
    getDNSRecords(hostedZoneId: string): Promise<DNSRecord[]>;
}
//# sourceMappingURL=client.d.ts.map