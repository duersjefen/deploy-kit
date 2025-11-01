/**
 * CloudFront Infrastructure Analyzer
 * Detects orphaned, misconfigured, and problematic distributions
 */
import type { CloudFrontDistribution, DNSRecord } from './client.js';
import type { ProjectConfig } from '../../types.js';
export interface DistributionAnalysis {
    id: string;
    domain: string;
    originDomain: string;
    status: 'configured' | 'orphaned' | 'misconfigured';
    severity: 'info' | 'warning' | 'error';
    reasons: string[];
    recommendations: string[];
    dnsAliases: string[];
    createdTime?: Date;
    lastModifiedTime?: Date;
}
export interface InfrastructureAuditReport {
    timestamp: Date;
    totalDistributions: number;
    configuredDistributions: DistributionAnalysis[];
    orphanedDistributions: DistributionAnalysis[];
    misconfiguredDistributions: DistributionAnalysis[];
    issues: string[];
    recommendations: string[];
}
export declare class CloudFrontAnalyzer {
    /**
     * Analyze a distribution to determine its status and issues
     */
    static analyzeDistribution(distribution: CloudFrontDistribution, config: ProjectConfig, dnsRecords: DNSRecord[]): DistributionAnalysis;
    /**
     * Analyze all distributions and generate comprehensive audit report
     */
    static generateAuditReport(distributions: CloudFrontDistribution[], config: ProjectConfig, dnsRecords: DNSRecord[]): InfrastructureAuditReport;
    /**
     * Check if a distribution can be safely deleted
     * Safe to delete if:
     * 1. Orphaned (not in config, not in DNS) with either:
     *    a) Placeholder origin (incomplete SST config), OR
     *    b) Confirmed not in DNS and not in config (truly orphaned)
     * 2. OR Misconfigured with placeholder origin (incomplete SST deployment)
     */
    static canDelete(analysis: DistributionAnalysis): boolean;
    /**
     * Get human-readable description of a distribution's status
     */
    static getStatusDescription(analysis: DistributionAnalysis): string;
}
//# sourceMappingURL=analyzer.d.ts.map