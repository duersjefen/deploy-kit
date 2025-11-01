/**
 * Deployment Diff Collector
 *
 * Orchestrates fetching current AWS state and comparing with desired deployment state.
 * Provides comprehensive diff preview before deployment execution.
 *
 * @example
 * ```typescript
 * const collector = new DeploymentDiffCollector(config, stage);
 * const diff = await collector.collectDiff();
 * console.log(formatDeploymentDiff(diff));
 * ```
 */
import { ProjectConfig, DeploymentStage } from '../types.js';
import { DiffResult } from '../lib/diff-utils.js';
/**
 * Complete deployment diff including all AWS resources
 */
export interface DeploymentDiff {
    stage: DeploymentStage;
    timestamp: Date;
    cloudfront?: CloudFrontDiff;
    ssl?: SSLCertificateDiff;
    dns?: DNSRecordsDiff;
    infrastructure: InfrastructureDiff;
    hasChanges: boolean;
}
/**
 * CloudFront distribution diff
 */
export interface CloudFrontDiff {
    distributionId?: string;
    exists: boolean;
    changes: DiffResult;
    summary: {
        domain?: string;
        enabled: boolean;
        priceClass?: string;
        origins: number;
        cacheBehaviors: number;
        customErrorResponses: number;
        sslEnabled: boolean;
    };
}
/**
 * SSL certificate diff
 */
export interface SSLCertificateDiff {
    certificateArn?: string;
    status: 'no_change' | 'new_cert' | 'renewed' | 'domain_changed' | 'not_found';
    currentDomains: string[];
    desiredDomains: string[];
    domainsAdded: string[];
    domainsRemoved: string[];
    validationMethod?: 'DNS' | 'EMAIL';
}
/**
 * DNS records diff
 */
export interface DNSRecordsDiff {
    hostedZoneId?: string;
    hostedZoneName?: string;
    changes: DNSRecordChange[];
    summary: {
        added: number;
        removed: number;
        modified: number;
    };
}
/**
 * Single DNS record change
 */
export interface DNSRecordChange {
    type: 'added' | 'removed' | 'modified';
    name: string;
    recordType: string;
    ttl?: number;
    oldValue?: string;
    newValue?: string;
}
/**
 * Infrastructure configuration diff
 */
export interface InfrastructureDiff {
    type: string;
    region: string;
    database?: {
        type: string;
        tables?: number;
    };
    functions?: number;
    healthChecks?: number;
    cacheInvalidation: boolean;
}
/**
 * Collects deployment diff by fetching current AWS state and comparing with desired config
 */
export declare class DeploymentDiffCollector {
    private config;
    private stage;
    private cfClient;
    private acmClient;
    private r53Client;
    constructor(config: ProjectConfig, stage: DeploymentStage);
    /**
     * Collect complete deployment diff
     */
    collectDiff(): Promise<DeploymentDiff>;
    /**
     * Collect CloudFront distribution diff
     */
    private collectCloudFrontDiff;
    /**
     * Extract relevant CloudFront config for comparison
     */
    private extractCloudFrontConfig;
    /**
     * Get desired CloudFront config from project config
     */
    private getDesiredCloudFrontConfig;
    /**
     * Collect SSL certificate diff
     */
    private collectSSLDiff;
    /**
     * Get desired certificate domains based on main domain
     */
    private getDesiredCertificateDomains;
    /**
     * Collect DNS records diff
     */
    private collectDNSDiff;
    /**
     * Collect infrastructure diff (from config, no AWS API calls needed)
     */
    private collectInfrastructureDiff;
}
/**
 * Format deployment diff for terminal display
 */
export declare function formatDeploymentDiff(diff: DeploymentDiff): Promise<string>;
//# sourceMappingURL=diff-collector.d.ts.map