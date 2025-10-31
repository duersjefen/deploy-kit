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

export class CloudFrontAnalyzer {
  /**
   * Analyze a distribution to determine its status and issues
   */
  static analyzeDistribution(
    distribution: CloudFrontDistribution,
    config: ProjectConfig,
    dnsRecords: DNSRecord[]
  ): DistributionAnalysis {
    const analysis: DistributionAnalysis = {
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
    const inConfig =
      (config.mainDomain && config.mainDomain === distribution.DomainName) ||
      distribution.AliasedDomains.some(
        (alias) =>
          (config.mainDomain && alias.endsWith(config.mainDomain)) ||
          (config.mainDomain && alias === `staging.${config.mainDomain}`)
      );

    // Check if distribution is in DNS
    const inDns = dnsRecords.some((record) => {
      if (!record.AliasTarget) return false;
      return (
        record.AliasTarget.DNSName === `${distribution.DomainName}.` ||
        record.AliasTarget.DNSName === distribution.DomainName
      );
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
    } else if (inDns) {
      // In DNS but not in config - should not happen
      analysis.status = 'misconfigured';
      analysis.severity = 'error';
      analysis.reasons.push('In DNS but not in deployment config');
      analysis.recommendations.push('Update .deploy-config.json or remove DNS alias');
    } else if (hasPlaceholderOrigin && isStale) {
      // Classic orphan: placeholder origin, not in config/DNS, and stale
      analysis.status = 'orphaned';
      analysis.severity = 'warning';
      analysis.reasons.push('Not referenced in deployment config');
      analysis.reasons.push('Not referenced in DNS records');
      analysis.reasons.push('Uses placeholder.sst.dev origin');
      analysis.recommendations.push('Delete this distribution');
      analysis.recommendations.push('Run: npx deploy-kit cloudfront cleanup --force');
    } else {
      // Unclear state
      analysis.status = 'orphaned';
      analysis.severity = 'info';
      analysis.reasons.push('Not referenced in deployment config or DNS');
    }

    return analysis;
  }

  /**
   * Analyze all distributions and generate comprehensive audit report
   */
  static generateAuditReport(
    distributions: CloudFrontDistribution[],
    config: ProjectConfig,
    dnsRecords: DNSRecord[]
  ): InfrastructureAuditReport {
    const analyses = distributions.map((dist) =>
      this.analyzeDistribution(dist, config, dnsRecords)
    );

    const configured = analyses.filter((a) => a.status === 'configured');
    const orphaned = analyses.filter((a) => a.status === 'orphaned');
    const misconfigured = analyses.filter((a) => a.status === 'misconfigured');

    const report: InfrastructureAuditReport = {
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
   * Safe to delete if:
   * 1. Orphaned (not in config, not in DNS) with either:
   *    a) Placeholder origin (incomplete SST config), OR
   *    b) Confirmed not in DNS and not in config (truly orphaned)
   * 2. OR Misconfigured with placeholder origin (incomplete SST deployment)
   */
  static canDelete(analysis: DistributionAnalysis): boolean {
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
      const notInDnsAndConfig = analysis.reasons.some((r) =>
        r.includes('Not referenced in deployment config or DNS')
      );
      if (notInDnsAndConfig) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get human-readable description of a distribution's status
   */
  static getStatusDescription(analysis: DistributionAnalysis): string {
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
