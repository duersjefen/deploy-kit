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
/**
 * CloudFront analyzer using static methods
 */
export class CloudFrontAnalyzer {
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
    static analyzeDistribution(distribution, config, dnsRecords) {
        const analysis = {
            id: distribution.Id,
            domain: distribution.DomainName,
            originDomain: distribution.OriginDomain,
            status: 'orphaned',
            severity: 'info',
            reasons: [],
            recommendations: [],
            dnsAliases: distribution.AliasedDomains,
            createdTime: distribution.CreatedTime,
            lastModifiedTime: distribution.LastModifiedTime,
        };
        // Check if distribution is in config
        const inConfig = (config.mainDomain && config.mainDomain === distribution.DomainName) ||
            distribution.AliasedDomains.some((alias) => (config.mainDomain && alias.endsWith(config.mainDomain)) ||
                (config.mainDomain && alias === `staging.${config.mainDomain}`));
        // Check if distribution is in DNS
        const inDns = dnsRecords.some((record) => {
            // Check if DNS record value matches the CloudFront distribution domain
            const normalizedValue = record.value.replace(/\.$/, '');
            const normalizedDistDomain = distribution.DomainName.replace(/\.$/, '');
            return normalizedValue === normalizedDistDomain;
        });
        // Check for placeholder origin (incomplete configuration)
        const hasPlaceholderOrigin = distribution.OriginDomain.includes('placeholder.sst.dev');
        // Check if distribution is stale (created > 1 hour ago)
        const isStale = distribution.CreatedTime
            ? Date.now() - distribution.CreatedTime.getTime() > 3600000
            : false;
        // Determine status
        if (inConfig) {
            analysis.status = 'configured';
            analysis.severity = 'info';
            if (hasPlaceholderOrigin) {
                analysis.status = 'misconfigured';
                analysis.severity = 'warning';
                analysis.reasons.push('Uses placeholder.sst.dev origin (incomplete configuration)');
                analysis.recommendations.push('Redeploy with fresh SST configuration');
                analysis.recommendations.push('Run: make deploy-staging or make deploy-production');
            }
        }
        else if (inDns) {
            // In DNS but not in config - should not happen
            analysis.status = 'misconfigured';
            analysis.severity = 'error';
            analysis.reasons.push('In DNS but not in deployment config');
            analysis.recommendations.push('Update .deploy-config.json or remove DNS alias');
        }
        else if (hasPlaceholderOrigin && isStale) {
            // Classic orphan: placeholder origin, not in config/DNS, and stale
            analysis.status = 'orphaned';
            analysis.severity = 'warning';
            analysis.reasons.push('Not referenced in deployment config');
            analysis.reasons.push('Not referenced in DNS records');
            analysis.reasons.push('Uses placeholder.sst.dev origin');
            analysis.recommendations.push('Delete this distribution');
            analysis.recommendations.push('Run: npx deploy-kit cloudfront cleanup --force');
        }
        else {
            // Unclear state
            analysis.status = 'orphaned';
            analysis.severity = 'info';
            analysis.reasons.push('Not referenced in deployment config or DNS');
        }
        return analysis;
    }
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
    static generateAuditReport(distributions, config, dnsRecords) {
        const analyses = distributions.map((dist) => this.analyzeDistribution(dist, config, dnsRecords));
        const configured = analyses.filter((a) => a.status === 'configured');
        const orphaned = analyses.filter((a) => a.status === 'orphaned');
        const misconfigured = analyses.filter((a) => a.status === 'misconfigured');
        const report = {
            timestamp: new Date(),
            totalDistributions: distributions.length,
            configuredDistributions: configured,
            orphanedDistributions: orphaned,
            misconfiguredDistributions: misconfigured,
            issues: [],
            recommendations: [],
        };
        // Generate summary issues and recommendations
        if (orphaned.length > 0) {
            report.issues.push(`${orphaned.length} orphaned distribution(s) detected`);
            report.recommendations.push('Run: npx deploy-kit cloudfront cleanup --dry-run');
            report.recommendations.push('Then: npx deploy-kit cloudfront cleanup --force');
        }
        if (misconfigured.length > 0) {
            report.issues.push(`${misconfigured.length} misconfigured distribution(s) detected`);
            if (misconfigured.some((a) => a.reasons.some((r) => r.includes('placeholder')))) {
                report.recommendations.push('Redeploy to fix placeholder origins');
                report.recommendations.push('Run: make deploy-staging && make deploy-production');
            }
        }
        if (report.totalDistributions > config.stages.length) {
            const extra = report.totalDistributions - config.stages.length;
            report.issues.push(`${extra} extra distribution(s) beyond configured stages`);
        }
        if (report.issues.length === 0) {
            report.issues.push('All distributions properly configured');
        }
        return report;
    }
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
    static canDelete(analysis) {
        // Check for placeholder origin (sign of incomplete/failed SST deployment)
        const hasPlaceholderOrigin = analysis.reasons.some((r) => r.includes('placeholder.sst.dev'));
        // Misconfigured distributions with placeholder origins are safe to delete
        // They're incomplete deployments that were never fully configured
        if (analysis.status === 'misconfigured' && hasPlaceholderOrigin) {
            return true;
        }
        // Orphaned distributions are safe to delete
        if (analysis.status === 'orphaned') {
            // Safe if has placeholder origin (classic orphan from interrupted SST)
            if (hasPlaceholderOrigin) {
                return true;
            }
            // Safe if confirmed not in DNS and not in config (truly orphaned)
            // The analyzer uses a combined reason string for orphans not in config or DNS
            const notInDnsAndConfig = analysis.reasons.some((r) => r.includes('Not referenced in deployment config or DNS'));
            if (notInDnsAndConfig) {
                return true;
            }
        }
        return false;
    }
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
    static getStatusDescription(analysis) {
        switch (analysis.status) {
            case 'configured':
                return `✅ Configured (${analysis.severity === 'warning' ? 'warning' : 'healthy'})`;
            case 'orphaned':
                return '🔴 Orphaned (unused)';
            case 'misconfigured':
                return '⚠️  Misconfigured';
            default:
                return '❓ Unknown';
        }
    }
}
