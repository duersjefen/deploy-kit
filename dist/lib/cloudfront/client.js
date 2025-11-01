/**
 * CloudFront API Client
 * Wrapper around AWS CloudFront SDK for common operations
 */
import { CloudFrontClient, ListDistributionsCommand, GetDistributionCommand, UpdateDistributionCommand, DeleteDistributionCommand, GetDistributionConfigCommand, } from '@aws-sdk/client-cloudfront';
import { Route53Client, ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import chalk from 'chalk';
export class CloudFrontAPIClient {
    constructor(region = 'us-east-1', profile) {
        this.awsRegion = region;
        this.awsProfile = profile;
        // Set AWS_PROFILE BEFORE creating clients so credential providers can find it
        // AWS SDK v3 credential chain reads this environment variable during client initialization
        if (profile) {
            process.env.AWS_PROFILE = profile;
        }
        // CloudFront is always in us-east-1
        this.cfClient = new CloudFrontClient({
            region: 'us-east-1',
        });
        this.route53Client = new Route53Client({
            region: this.awsRegion,
        });
    }
    /**
     * List all CloudFront distributions
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
                CreatedTime: dist.CreatedTime,
                LastModifiedTime: dist.LastModifiedTime,
                Enabled: dist.Enabled,
                AliasedDomains: dist.Aliases?.Items || [],
            }));
        }
        catch (error) {
            console.error(chalk.red('❌ Error listing CloudFront distributions:'), error);
            throw error;
        }
    }
    /**
     * Get a specific distribution details
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
            console.error(chalk.red(`❌ Error getting distribution ${distributionId}:`), error);
            throw error;
        }
    }
    /**
     * Disable a CloudFront distribution
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
            console.error(chalk.red(`❌ Error disabling distribution ${distributionId}:`), error);
            throw error;
        }
    }
    /**
     * Wait for distribution to be deployed
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
            console.error(chalk.red(`❌ Error deleting distribution ${distributionId}:`), error);
            throw error;
        }
    }
    /**
     * Get DNS records from Route 53 for a hosted zone
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
            return response.ResourceRecordSets.map((record) => ({
                Name: record.Name,
                Type: record.Type,
                AliasTarget: record.AliasTarget,
            }));
        }
        catch (error) {
            console.error(chalk.red(`❌ Error getting DNS records for zone ${hostedZoneId}:`), error);
            throw error;
        }
    }
}
