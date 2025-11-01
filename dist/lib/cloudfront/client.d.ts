/**
 * CloudFront API Client
 * Wrapper around AWS CloudFront SDK for common operations
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
export declare class CloudFrontAPIClient {
    private cfClient;
    private route53Client;
    private awsRegion;
    private awsProfile?;
    constructor(region?: string, profile?: string);
    /**
     * List all CloudFront distributions
     */
    listDistributions(): Promise<CloudFrontDistribution[]>;
    /**
     * Get a specific distribution details
     */
    getDistribution(distributionId: string): Promise<CloudFrontDistribution | null>;
    /**
     * Disable a CloudFront distribution
     */
    disableDistribution(distributionId: string): Promise<void>;
    /**
     * Wait for distribution to be deployed
     */
    waitForDistributionDeployed(distributionId: string, maxWaitTime?: number): Promise<void>;
    /**
     * Delete a CloudFront distribution (must be disabled first)
     */
    deleteDistribution(distributionId: string): Promise<void>;
    /**
     * Get DNS records from Route 53 for a hosted zone
     */
    getDNSRecords(hostedZoneId: string): Promise<DNSRecord[]>;
}
//# sourceMappingURL=client.d.ts.map