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
import { CloudFrontClient, ListDistributionsCommand, GetDistributionCommand, UpdateDistributionCommand, DeleteDistributionCommand, GetDistributionConfigCommand, } from '@aws-sdk/client-cloudfront';
import { Route53Client, ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { ExternalServiceError, ERROR_CODES } from '../errors.js';
/**
 * CloudFront API Client for managing distributions and DNS records
 */
export class CloudFrontAPIClient {
    constructor(region = 'us-east-1', profile) {
        this.awsRegion = region;
        this.awsProfile = profile;
        // Set AWS_PROFILE BEFORE creating clients so credential providers can find it
        // AWS SDK v3 credential chain reads this environment variable during client initialization
        if (profile) {
            process.env.AWS_PROFILE = profile;
        }
        // Configure connection pooling for better performance
        // keepAlive reuses TCP connections across API calls (10-20% faster)
        const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 50 });
        const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 50 });
        const requestHandler = new NodeHttpHandler({
            httpAgent,
            httpsAgent,
        });
        // CloudFront is always in us-east-1
        this.cfClient = new CloudFrontClient({
            region: 'us-east-1',
            requestHandler,
        });
        this.route53Client = new Route53Client({
            region: this.awsRegion,
            requestHandler,
        });
    }
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
    async listDistributions() {
        try {
            const command = new ListDistributionsCommand({});
            const response = await this.cfClient.send(command);
            if (!response.DistributionList || !response.DistributionList.Items) {
                return [];
            }
            return response.DistributionList.Items.map((dist) => ({
                Id: dist.Id,
                DomainName: dist.DomainName,
                OriginDomain: dist.Origins?.Items?.[0]?.DomainName || 'unknown',
                Status: dist.Status,
                Comment: dist.Comment,
                CreatedTime: dist.LastModifiedTime,
                LastModifiedTime: dist.LastModifiedTime,
                Enabled: dist.Enabled,
                AliasedDomains: dist.Aliases?.Items || [],
            }));
        }
        catch (error) {
            throw new ExternalServiceError('Failed to list CloudFront distributions', ERROR_CODES.CLOUDFRONT_OPERATION_FAILED, error);
        }
    }
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
    async getDistribution(distributionId) {
        try {
            const command = new GetDistributionCommand({
                Id: distributionId,
            });
            const response = await this.cfClient.send(command);
            if (!response.Distribution) {
                return null;
            }
            const dist = response.Distribution;
            return {
                Id: dist.Id || 'unknown',
                DomainName: dist.DomainName || 'unknown',
                OriginDomain: dist.DistributionConfig?.Origins?.Items?.[0]?.DomainName || 'unknown',
                Status: dist.Status || 'Unknown',
                Comment: dist.DistributionConfig?.Comment,
                CreatedTime: dist.LastModifiedTime, // Closest to creation time available
                LastModifiedTime: dist.LastModifiedTime,
                Enabled: dist.DistributionConfig?.Enabled || false,
                AliasedDomains: dist.DistributionConfig?.Aliases?.Items || [],
            };
        }
        catch (error) {
            throw new ExternalServiceError(`Failed to get CloudFront distribution ${distributionId}`, ERROR_CODES.CLOUDFRONT_NOT_FOUND, error);
        }
    }
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
    async disableDistribution(distributionId) {
        try {
            const configCommand = new GetDistributionConfigCommand({
                Id: distributionId,
            });
            const configResponse = await this.cfClient.send(configCommand);
            if (!configResponse.DistributionConfig || !configResponse.ETag) {
                throw new Error(`Could not get config for distribution ${distributionId}`);
            }
            const config = configResponse.DistributionConfig;
            config.Enabled = false;
            const updateCommand = new UpdateDistributionCommand({
                Id: distributionId,
                DistributionConfig: config,
                IfMatch: configResponse.ETag,
            });
            await this.cfClient.send(updateCommand);
        }
        catch (error) {
            throw new ExternalServiceError(`Failed to disable CloudFront distribution ${distributionId}`, ERROR_CODES.CLOUDFRONT_OPERATION_FAILED, error);
        }
    }
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
    async waitForDistributionDeployed(distributionId, maxWaitTime = 1200000 // 20 minutes
    ) {
        const startTime = Date.now();
        const checkInterval = 30000; // Check every 30 seconds
        while (Date.now() - startTime < maxWaitTime) {
            const dist = await this.getDistribution(distributionId);
            if (dist && dist.Status === 'Deployed') {
                return;
            }
            // Wait before next check
            await new Promise((resolve) => setTimeout(resolve, checkInterval));
        }
        throw new Error(`Distribution ${distributionId} did not reach Deployed status within ${maxWaitTime / 1000} seconds`);
    }
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
    async deleteDistribution(distributionId) {
        try {
            // Get current ETag
            const command = new GetDistributionCommand({
                Id: distributionId,
            });
            const response = await this.cfClient.send(command);
            if (!response.ETag) {
                throw new Error(`Could not get ETag for distribution ${distributionId}`);
            }
            const deleteCommand = new DeleteDistributionCommand({
                Id: distributionId,
                IfMatch: response.ETag,
            });
            await this.cfClient.send(deleteCommand);
        }
        catch (error) {
            throw new ExternalServiceError(`Failed to delete CloudFront distribution ${distributionId}`, ERROR_CODES.CLOUDFRONT_OPERATION_FAILED, error);
        }
    }
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
    async getDNSRecords(hostedZoneId) {
        try {
            const command = new ListResourceRecordSetsCommand({
                HostedZoneId: hostedZoneId,
            });
            const response = await this.route53Client.send(command);
            if (!response.ResourceRecordSets) {
                return [];
            }
            // Map Route53 records to standardized DNSRecord format
            return response.ResourceRecordSets.map((record) => ({
                name: (record.Name || '').replace(/\.$/, ''), // Remove trailing dot
                type: record.Type || '',
                value: record.AliasTarget?.DNSName || record.ResourceRecords?.[0]?.Value || '',
                ttl: record.TTL,
            }));
        }
        catch (error) {
            throw new ExternalServiceError(`Failed to get DNS records for hosted zone ${hostedZoneId}`, ERROR_CODES.DNS_OPERATION_FAILED, error);
        }
    }
}
