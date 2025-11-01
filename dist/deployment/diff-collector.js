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
import { CloudFrontClient, GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { ACMClient, DescribeCertificateCommand, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { Route53Client, ListHostedZonesCommand, ListResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { createDiff } from '../lib/diff-utils.js';
/**
 * Collects deployment diff by fetching current AWS state and comparing with desired config
 */
export class DeploymentDiffCollector {
    constructor(config, stage) {
        this.config = config;
        this.stage = stage;
        const region = config.stageConfig[stage].awsRegion || 'us-east-1';
        this.cfClient = new CloudFrontClient({ region: 'us-east-1' }); // CloudFront is global
        this.acmClient = new ACMClient({ region: 'us-east-1' }); // ACM certificates for CloudFront must be in us-east-1
        this.r53Client = new Route53Client({ region: 'us-east-1' }); // Route53 is global
    }
    /**
     * Collect complete deployment diff
     */
    async collectDiff() {
        const [cloudfront, ssl, dns] = await Promise.all([
            this.collectCloudFrontDiff(),
            this.collectSSLDiff(),
            this.collectDNSDiff(),
        ]);
        const infrastructure = this.collectInfrastructureDiff();
        const hasChanges = (cloudfront && !cloudfront.changes.identical) ||
            (ssl && ssl.status !== 'no_change') ||
            (dns && dns.changes.length > 0) ||
            false;
        return {
            stage: this.stage,
            timestamp: new Date(),
            cloudfront,
            ssl,
            dns,
            infrastructure,
            hasChanges,
        };
    }
    /**
     * Collect CloudFront distribution diff
     */
    async collectCloudFrontDiff() {
        const domain = this.config.stageConfig[this.stage].domain;
        if (!domain) {
            return undefined;
        }
        try {
            // List distributions to find one matching the domain
            const listResult = await this.cfClient.send(new ListDistributionsCommand({}));
            const existingDist = listResult.DistributionList?.Items?.find((dist) => dist.Aliases?.Items?.includes(domain));
            if (!existingDist || !existingDist.Id) {
                // No existing distribution - will be created
                return {
                    exists: false,
                    changes: createDiff({}, this.getDesiredCloudFrontConfig()),
                    summary: {
                        domain,
                        enabled: true,
                        origins: 1,
                        cacheBehaviors: 1,
                        customErrorResponses: 0,
                        sslEnabled: true,
                    },
                };
            }
            // Fetch full distribution config
            const getResult = await this.cfClient.send(new GetDistributionCommand({ Id: existingDist.Id }));
            const currentConfig = this.extractCloudFrontConfig(getResult.Distribution);
            const desiredConfig = this.getDesiredCloudFrontConfig();
            const changes = createDiff(currentConfig, desiredConfig);
            const distConfig = getResult.Distribution?.DistributionConfig;
            return {
                distributionId: existingDist.Id,
                exists: true,
                changes,
                summary: {
                    domain,
                    enabled: distConfig?.Enabled ?? true,
                    priceClass: distConfig?.PriceClass,
                    origins: distConfig?.Origins?.Quantity ?? 0,
                    cacheBehaviors: (distConfig?.DefaultCacheBehavior ? 1 : 0) +
                        (distConfig?.CacheBehaviors?.Quantity ?? 0),
                    customErrorResponses: distConfig?.CustomErrorResponses?.Quantity ?? 0,
                    sslEnabled: distConfig?.ViewerCertificate?.ACMCertificateArn !== undefined,
                },
            };
        }
        catch (error) {
            console.warn('Could not fetch CloudFront state:', error);
            return undefined;
        }
    }
    /**
     * Extract relevant CloudFront config for comparison
     */
    extractCloudFrontConfig(distribution) {
        const config = distribution?.DistributionConfig;
        if (!config)
            return {};
        return {
            enabled: config.Enabled ?? false,
            priceClass: config.PriceClass,
            aliases: config.Aliases?.Items || [],
            origins: config.Origins?.Items?.map((o) => ({
                id: o.Id,
                domain: o.DomainName,
                customHeaders: o.CustomHeaders?.Items?.length || 0,
            })) || [],
            defaultCacheBehavior: {
                viewerProtocolPolicy: config.DefaultCacheBehavior?.ViewerProtocolPolicy,
                allowedMethods: config.DefaultCacheBehavior?.AllowedMethods?.Items || [],
                cachePolicyId: config.DefaultCacheBehavior?.CachePolicyId,
                compress: config.DefaultCacheBehavior?.Compress ?? false,
            },
            customErrorResponses: config.CustomErrorResponses?.Items?.map((e) => ({
                errorCode: e.ErrorCode,
                responseCode: e.ResponseCode,
            })) || [],
            viewerCertificate: {
                acmCertificateArn: config.ViewerCertificate?.ACMCertificateArn,
                sslSupportMethod: config.ViewerCertificate?.SSLSupportMethod,
                minimumProtocolVersion: config.ViewerCertificate?.MinimumProtocolVersion,
            },
        };
    }
    /**
     * Get desired CloudFront config from project config
     */
    getDesiredCloudFrontConfig() {
        const domain = this.config.stageConfig[this.stage].domain;
        return {
            enabled: true,
            priceClass: 'PriceClass_All',
            aliases: domain ? [domain] : [],
            origins: [
                {
                    id: 'primary',
                    domain: `${this.config.projectName}-${this.stage}.execute-api.${this.config.stageConfig[this.stage].awsRegion}.amazonaws.com`,
                    customHeaders: 0,
                },
            ],
            defaultCacheBehavior: {
                viewerProtocolPolicy: 'redirect-to-https',
                allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
                compress: true,
            },
            customErrorResponses: [],
            viewerCertificate: {
                sslSupportMethod: 'sni-only',
                minimumProtocolVersion: 'TLSv1.2_2021',
            },
        };
    }
    /**
     * Collect SSL certificate diff
     */
    async collectSSLDiff() {
        const domain = this.config.stageConfig[this.stage].domain;
        if (!domain) {
            return undefined;
        }
        try {
            // List certificates and find matching one
            const result = await this.acmClient.send(new ListCertificatesCommand({
                CertificateStatuses: ['ISSUED', 'PENDING_VALIDATION'],
            }));
            const desiredDomains = this.getDesiredCertificateDomains(domain);
            let currentCert = result.CertificateSummaryList?.find((cert) => desiredDomains.some((d) => cert.DomainName === d));
            if (!currentCert) {
                // No existing certificate
                return {
                    status: 'new_cert',
                    currentDomains: [],
                    desiredDomains,
                    domainsAdded: desiredDomains,
                    domainsRemoved: [],
                };
            }
            // Fetch full certificate details
            const certDetails = await this.acmClient.send(new DescribeCertificateCommand({
                CertificateArn: currentCert.CertificateArn,
            }));
            const currentDomains = [
                certDetails.Certificate?.DomainName,
                ...(certDetails.Certificate?.SubjectAlternativeNames || []),
            ].filter((d) => d !== undefined);
            const domainsAdded = desiredDomains.filter((d) => !currentDomains.includes(d));
            const domainsRemoved = currentDomains.filter((d) => !desiredDomains.includes(d));
            const status = domainsAdded.length > 0 || domainsRemoved.length > 0
                ? 'domain_changed'
                : 'no_change';
            return {
                certificateArn: currentCert.CertificateArn,
                status,
                currentDomains,
                desiredDomains,
                domainsAdded,
                domainsRemoved,
                validationMethod: certDetails.Certificate?.DomainValidationOptions?.[0]?.ValidationMethod,
            };
        }
        catch (error) {
            console.warn('Could not fetch SSL certificate state:', error);
            return {
                status: 'not_found',
                currentDomains: [],
                desiredDomains: this.getDesiredCertificateDomains(domain),
                domainsAdded: this.getDesiredCertificateDomains(domain),
                domainsRemoved: [],
            };
        }
    }
    /**
     * Get desired certificate domains based on main domain
     */
    getDesiredCertificateDomains(domain) {
        // For example.com, return [example.com, *.example.com]
        const parts = domain.split('.');
        if (parts.length >= 2) {
            const rootDomain = parts.slice(-2).join('.');
            return [rootDomain, `*.${rootDomain}`];
        }
        return [domain];
    }
    /**
     * Collect DNS records diff
     */
    async collectDNSDiff() {
        const domain = this.config.stageConfig[this.stage].domain;
        if (!domain) {
            return undefined;
        }
        try {
            // Find hosted zone for domain
            const zonesResult = await this.r53Client.send(new ListHostedZonesCommand({}));
            const hostedZone = zonesResult.HostedZones?.find((zone) => {
                const zoneName = zone.Name?.replace(/\.$/, '');
                const rootDomain = domain.split('.').slice(-2).join('.');
                return zoneName === rootDomain;
            });
            if (!hostedZone || !hostedZone.Id) {
                return {
                    hostedZoneName: domain.split('.').slice(-2).join('.'),
                    changes: [
                        {
                            type: 'added',
                            name: domain,
                            recordType: 'CNAME',
                            newValue: '<CloudFront-distribution>.cloudfront.net',
                        },
                    ],
                    summary: { added: 1, removed: 0, modified: 0 },
                };
            }
            // Fetch current DNS records
            const recordsResult = await this.r53Client.send(new ListResourceRecordSetsCommand({
                HostedZoneId: hostedZone.Id,
            }));
            const currentRecords = recordsResult.ResourceRecordSets || [];
            const changes = [];
            // Check if CNAME for domain exists
            const existingCNAME = currentRecords.find((record) => record.Name === `${domain}.` && record.Type === 'CNAME');
            if (!existingCNAME) {
                changes.push({
                    type: 'added',
                    name: domain,
                    recordType: 'CNAME',
                    ttl: 300,
                    newValue: '<CloudFront-distribution>.cloudfront.net',
                });
            }
            else {
                const currentValue = existingCNAME.ResourceRecords?.[0]?.Value;
                const currentTTL = existingCNAME.TTL;
                if (currentValue && !currentValue.includes('cloudfront.net')) {
                    changes.push({
                        type: 'modified',
                        name: domain,
                        recordType: 'CNAME',
                        ttl: currentTTL,
                        oldValue: currentValue,
                        newValue: '<CloudFront-distribution>.cloudfront.net',
                    });
                }
            }
            return {
                hostedZoneId: hostedZone.Id,
                hostedZoneName: hostedZone.Name,
                changes,
                summary: {
                    added: changes.filter((c) => c.type === 'added').length,
                    removed: changes.filter((c) => c.type === 'removed').length,
                    modified: changes.filter((c) => c.type === 'modified').length,
                },
            };
        }
        catch (error) {
            console.warn('Could not fetch DNS records:', error);
            return undefined;
        }
    }
    /**
     * Collect infrastructure diff (from config, no AWS API calls needed)
     */
    collectInfrastructureDiff() {
        return {
            type: this.config.infrastructure,
            region: this.config.stageConfig[this.stage].awsRegion || 'us-east-1',
            database: this.config.database
                ? {
                    type: this.config.database,
                    tables: 0, // Tables count not available from config
                }
                : undefined,
            functions: 0, // Functions count not available from config
            healthChecks: this.config.healthChecks?.length,
            cacheInvalidation: !this.config.stageConfig[this.stage].skipCacheInvalidation,
        };
    }
}
/**
 * Format deployment diff for terminal display
 */
export async function formatDeploymentDiff(diff) {
    const lines = [];
    const chalk = (await import('chalk')).default;
    // Header
    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(80)));
    lines.push(chalk.bold.cyan(`📋 Deployment Preview: ${diff.stage}`));
    lines.push(chalk.bold.cyan('═'.repeat(80)));
    lines.push('');
    if (!diff.hasChanges) {
        lines.push(chalk.green('✅ No changes detected - infrastructure is up to date'));
        lines.push('');
        return lines.join('\n');
    }
    // CloudFront section
    if (diff.cloudfront) {
        lines.push(chalk.bold.white('🌐 CloudFront Distribution'));
        lines.push(chalk.gray('─'.repeat(80)));
        if (!diff.cloudfront.exists) {
            lines.push(chalk.green('  ✨ New distribution will be created'));
        }
        else {
            lines.push(chalk.blue(`  Distribution ID: ${diff.cloudfront.distributionId}`));
        }
        lines.push(`  Domain:              ${diff.cloudfront.summary.domain}`);
        lines.push(`  Status:              ${diff.cloudfront.summary.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
        lines.push(`  Origins:             ${diff.cloudfront.summary.origins}`);
        lines.push(`  Cache Behaviors:     ${diff.cloudfront.summary.cacheBehaviors}`);
        lines.push(`  SSL/TLS:             ${diff.cloudfront.summary.sslEnabled ? chalk.green('✓ Enabled') : chalk.yellow('✗ Disabled')}`);
        if (!diff.cloudfront.changes.identical) {
            lines.push('');
            lines.push(chalk.yellow(`  Changes detected: ${diff.cloudfront.changes.changes.length}`));
            lines.push(chalk.yellow(`    ${diff.cloudfront.changes.added} added, ${diff.cloudfront.changes.modified} modified, ${diff.cloudfront.changes.removed} removed`));
        }
        lines.push('');
    }
    // SSL section
    if (diff.ssl) {
        lines.push(chalk.bold.white('🔐 SSL/TLS Certificate'));
        lines.push(chalk.gray('─'.repeat(80)));
        switch (diff.ssl.status) {
            case 'new_cert':
                lines.push(chalk.green('  ✨ New certificate will be created'));
                break;
            case 'domain_changed':
                lines.push(chalk.yellow('  ⚠️  Certificate domains will be updated'));
                if (diff.ssl.domainsAdded.length > 0) {
                    lines.push(chalk.green(`    + Adding: ${diff.ssl.domainsAdded.join(', ')}`));
                }
                if (diff.ssl.domainsRemoved.length > 0) {
                    lines.push(chalk.red(`    - Removing: ${diff.ssl.domainsRemoved.join(', ')}`));
                }
                break;
            case 'no_change':
                lines.push(chalk.green('  ✓ No changes (certificate is up to date)'));
                break;
            case 'not_found':
                lines.push(chalk.yellow('  ⚠️  Certificate not found (may need creation)'));
                break;
        }
        if (diff.ssl.certificateArn) {
            lines.push(chalk.dim(`  ARN: ${diff.ssl.certificateArn.substring(0, 60)}...`));
        }
        lines.push(`  Domains:             ${diff.ssl.desiredDomains.join(', ')}`);
        if (diff.ssl.validationMethod) {
            lines.push(`  Validation:          ${diff.ssl.validationMethod}`);
        }
        lines.push('');
    }
    // DNS section
    if (diff.dns && diff.dns.changes.length > 0) {
        lines.push(chalk.bold.white('📡 DNS Records'));
        lines.push(chalk.gray('─'.repeat(80)));
        if (diff.dns.hostedZoneName) {
            lines.push(`  Hosted Zone:         ${diff.dns.hostedZoneName}`);
        }
        lines.push(`  Changes:             ${diff.dns.summary.added} added, ${diff.dns.summary.modified} modified, ${diff.dns.summary.removed} removed`);
        lines.push('');
        for (const change of diff.dns.changes) {
            if (change.type === 'added') {
                lines.push(chalk.green(`  + ${change.name} (${change.recordType}) → ${change.newValue}`));
            }
            else if (change.type === 'removed') {
                lines.push(chalk.red(`  - ${change.name} (${change.recordType}) → ${change.oldValue}`));
            }
            else if (change.type === 'modified') {
                lines.push(chalk.yellow(`  ~ ${change.name} (${change.recordType}): ${change.oldValue} → ${change.newValue}`));
            }
        }
        lines.push('');
    }
    // Infrastructure section
    lines.push(chalk.bold.white('🗄️  Infrastructure'));
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(`  Type:                ${diff.infrastructure.type}`);
    lines.push(`  Region:              ${diff.infrastructure.region}`);
    if (diff.infrastructure.database) {
        lines.push(`  Database:            ${diff.infrastructure.database.type}${diff.infrastructure.database.tables ? ` (${diff.infrastructure.database.tables} tables)` : ''}`);
    }
    if (diff.infrastructure.functions) {
        lines.push(`  Lambda Functions:    ${diff.infrastructure.functions}`);
    }
    if (diff.infrastructure.healthChecks) {
        lines.push(`  Health Checks:       ${diff.infrastructure.healthChecks}`);
    }
    lines.push(`  Cache Invalidation:  ${diff.infrastructure.cacheInvalidation ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    lines.push('');
    lines.push(chalk.bold.cyan('═'.repeat(80)));
    lines.push('');
    return lines.join('\n');
}
