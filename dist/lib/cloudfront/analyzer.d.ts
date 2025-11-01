/**
 * CloudFront Infrastructure Analyzer
 * Detects orphaned, misconfigured, and problematic distributions
 *
 * Analyzes CloudFront distributions to detect:
 * - Orphaned distributions (not referenced in config or DNS)
 * - Misconfigured distributions (placeholder origins, DNS mismatches)
 * - Stale incomplete deployments (SST deployment failures)
 *
 * Generates comprehensive audit reports and determines which distributions
 * are safe to delete. Critical for cleanup after failed deployments.
 */
import type { CloudFrontDistribution } from './client.js';
import type { ProjectConfig, DNSRecord } from '../../types.js';
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
/**
 * CloudFront analyzer using static methods
 */
export declare class CloudFrontAnalyzer {
    /**
     * Analyze a distribution to determine its status and issues
     *
     * Evaluates whether a distribution is configured, orphaned, or misconfigured by:
     * 1. Checking if it's referenced in deployment config
     * 2. Checking if it's referenced in DNS records
     * 3. Checking for placeholder origins (incomplete SST config)
     * 4. Checking if distribution is stale (>1 hour old)
     *
     * @param distribution - CloudFront distribution to analyze
     * @param config - Project deployment configuration
     * @param dnsRecords - Route53 DNS records for the hosted zone
     * @returns DistributionAnalysis with status, severity, reasons, and recommendations
     *
     * @example
     * ```typescript
     * const analysis = CloudFrontAnalyzer.analyzeDistribution(
     *   distribution,
     *   config,
     *   dnsRecords
     * );
     * console.log(`Status: ${analysis.status} (${analysis.severity})`);
     * ```
     */
    static analyzeDistribution(distribution: CloudFrontDistribution, config: ProjectConfig, dnsRecords: DNSRecord[]): DistributionAnalysis;
    /**
     * Analyze all distributions and generate comprehensive audit report
     *
     * Scans all distributions and categorizes them:
     * - Configured: properly set up and in use
     * - Orphaned: not referenced anywhere
     * - Misconfigured: referenced but with issues
     *
     * Generates summary issues and actionable recommendations.
     *
     * @param distributions - List of CloudFront distributions
     * @param config - Project configuration
     * @param dnsRecords - Route53 DNS records
     * @returns InfrastructureAuditReport with categorized distributions and recommendations
     *
     * @example
     * ```typescript
     * const report = CloudFrontAnalyzer.generateAuditReport(
     *   distributions,
     *   config,
     *   dnsRecords
     * );
     * console.log(`Orphaned: ${report.orphanedDistributions.length}`);
     * ```
     */
    static generateAuditReport(distributions: CloudFrontDistribution[], config: ProjectConfig, dnsRecords: DNSRecord[]): InfrastructureAuditReport;
    /**
     * Check if a distribution can be safely deleted
     *
     * A distribution is safe to delete if:
     * 1. Misconfigured with placeholder origin (incomplete SST deployment)
     * 2. Orphaned and has placeholder origin (failed SST run)
     * 3. Orphaned and truly not in config/DNS (verified cleanup candidate)
     *
     * @param analysis - DistributionAnalysis object from analyzeDistribution()
     * @returns true if distribution is safe to delete, false otherwise
     *
     * @example
     * ```typescript
     * if (CloudFrontAnalyzer.canDelete(analysis)) {
     *   await client.disableDistribution(analysis.id);
     *   await client.deleteDistribution(analysis.id);
     * }
     * ```
     */
    static canDelete(analysis: DistributionAnalysis): boolean;
    /**
     * Get human-readable description of a distribution's status
     *
     * Converts status and severity into user-friendly emoji + text format
     * suitable for CLI output and reports.
     *
     * @param analysis - DistributionAnalysis object
     * @returns Formatted status string with emoji (e.g., "✅ Configured (healthy)")
     *
     * @example
     * ```typescript
     * console.log(CloudFrontAnalyzer.getStatusDescription(analysis));
     * // Output: "🔴 Orphaned (unused)"
     * ```
     */
    static getStatusDescription(analysis: DistributionAnalysis): string;
}
//# sourceMappingURL=analyzer.d.ts.map