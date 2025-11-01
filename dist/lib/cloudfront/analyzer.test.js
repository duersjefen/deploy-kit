/**
 * Tests for CloudFront Distribution Analyzer
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CloudFrontAnalyzer } from './analyzer.js';
// Mock config
const mockConfig = {
    projectName: 'test-project',
    mainDomain: 'example.com',
    awsProfile: 'test',
    infrastructure: 'sst-serverless',
    database: 'dynamodb',
    stages: ['staging', 'production'],
    stageConfig: {
        staging: { domain: 'staging.example.com', skipHealthChecks: false, skipCacheInvalidation: false },
        production: { domain: 'example.com', skipHealthChecks: false, skipCacheInvalidation: false },
    },
};
describe('CloudFrontAnalyzer', () => {
    describe('analyzeDistribution', () => {
        it('should mark distribution as configured when in config', () => {
            const dist = {
                Id: 'E123',
                DomainName: 'd123.cloudfront.net',
                OriginDomain: 'bucket.s3.amazonaws.com',
                AliasedDomains: ['example.com'],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [
                { name: 'example.com', type: 'A', value: 'd123.cloudfront.net' },
            ];
            const analysis = CloudFrontAnalyzer.analyzeDistribution(dist, mockConfig, dnsRecords);
            assert.strictEqual(analysis.status, 'configured');
        });
        it('should mark distribution as orphaned when not in config', () => {
            const dist = {
                Id: 'E456',
                DomainName: 'd456.cloudfront.net',
                OriginDomain: 'bucket.s3.amazonaws.com',
                AliasedDomains: ['unknown.com'],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [];
            const analysis = CloudFrontAnalyzer.analyzeDistribution(dist, mockConfig, dnsRecords);
            assert.strictEqual(analysis.status, 'orphaned');
        });
        it('should detect placeholder origins', () => {
            const dist = {
                Id: 'E789',
                DomainName: 'd789.cloudfront.net',
                OriginDomain: 'placeholder.sst.dev',
                AliasedDomains: ['example.com'],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [];
            const analysis = CloudFrontAnalyzer.analyzeDistribution(dist, mockConfig, dnsRecords);
            assert.ok(analysis.reasons.some(r => r.includes('placeholder.sst.dev')));
        });
        it('should identify DNS discrepancy (in DNS but not in config)', () => {
            const dist = {
                Id: 'E999',
                DomainName: 'd999.cloudfront.net',
                OriginDomain: 'bucket.s3.amazonaws.com',
                AliasedDomains: [],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [
                { name: 'example.com', type: 'A', value: 'd999.cloudfront.net' },
            ];
            const analysis = CloudFrontAnalyzer.analyzeDistribution(dist, mockConfig, dnsRecords);
            assert.strictEqual(analysis.status, 'misconfigured');
            assert.ok(analysis.reasons.some(r => r.includes('In DNS but not in deployment config')));
        });
    });
    describe('generateAuditReport', () => {
        it('should generate summary with counts', () => {
            const dist1 = {
                Id: 'E1',
                DomainName: 'd1.cloudfront.net',
                OriginDomain: 'bucket.s3.amazonaws.com',
                AliasedDomains: ['example.com'],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dist2 = {
                Id: 'E2',
                DomainName: 'd2.cloudfront.net',
                OriginDomain: 'placeholder.sst.dev',
                AliasedDomains: [],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [
                { name: 'example.com', type: 'A', value: 'd1.cloudfront.net' },
            ];
            const distributions = [dist1, dist2];
            const report = CloudFrontAnalyzer.generateAuditReport(distributions, mockConfig, dnsRecords);
            assert.strictEqual(report.totalDistributions, 2);
            assert.ok(report.configuredDistributions.length > 0);
            assert.ok(report.orphanedDistributions.length > 0);
            assert.ok(report.timestamp instanceof Date);
        });
        it('should list deletable distributions', () => {
            const dist = {
                Id: 'E1',
                DomainName: 'd1.cloudfront.net',
                OriginDomain: 'placeholder.sst.dev',
                AliasedDomains: [],
                Status: 'Deployed',
                Enabled: true,
                CreatedTime: new Date(),
                LastModifiedTime: new Date(),
            };
            const dnsRecords = [];
            const distributions = [dist];
            const report = CloudFrontAnalyzer.generateAuditReport(distributions, mockConfig, dnsRecords);
            assert.ok(report.orphanedDistributions.length > 0);
            const orphaned = report.orphanedDistributions[0];
            assert.strictEqual(orphaned.id, 'E1');
            assert.ok(orphaned.originDomain.includes('placeholder'));
        });
    });
    describe('canDelete', () => {
        it('should allow deletion of orphaned distributions with placeholder', () => {
            const analysis = {
                id: 'E1',
                domain: 'd1.cloudfront.net',
                originDomain: 'placeholder.sst.dev',
                status: 'orphaned',
                severity: 'warning',
                reasons: ['Uses placeholder.sst.dev origin', 'Not referenced in deployment config or DNS'],
                recommendations: ['Delete this distribution'],
                dnsAliases: [],
            };
            const canDelete = CloudFrontAnalyzer.canDelete(analysis);
            assert.strictEqual(canDelete, true);
        });
        it('should prevent deletion of configured distributions', () => {
            const analysis = {
                id: 'E1',
                domain: 'd1.cloudfront.net',
                originDomain: 'bucket.s3.amazonaws.com',
                status: 'configured',
                severity: 'info',
                reasons: [],
                recommendations: [],
                dnsAliases: ['example.com'],
            };
            const canDelete = CloudFrontAnalyzer.canDelete(analysis);
            assert.strictEqual(canDelete, false);
        });
        it('should prevent deletion of distributions with DNS aliases', () => {
            const analysis = {
                id: 'E1',
                domain: 'd1.cloudfront.net',
                originDomain: 'placeholder.sst.dev',
                status: 'orphaned',
                severity: 'warning',
                reasons: ['Has DNS aliases'],
                recommendations: [],
                dnsAliases: ['staging.example.com'],
            };
            const canDelete = CloudFrontAnalyzer.canDelete(analysis);
            assert.strictEqual(canDelete, false);
        });
    });
});
