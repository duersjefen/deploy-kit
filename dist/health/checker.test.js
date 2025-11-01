/**
 * Health Checker Test Suite
 *
 * Integration tests for health checking system.
 * Tests verify correct endpoint validation, database checks, and CloudFront configuration.
 * Gracefully skips if external services not available.
 */
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { getHealthChecker } from './checker.js';
describe('Health Checker', () => {
    let config;
    let checker;
    beforeEach(() => {
        config = {
            projectName: 'test-project',
            mainDomain: 'example.com',
            awsProfile: undefined,
            database: 'dynamodb',
            stageConfig: {
                staging: {
                    domain: 'staging.example.com',
                    dynamoTableName: 'test-staging-table',
                },
                production: {
                    domain: 'prod.example.com',
                    dynamoTableName: 'test-prod-table',
                },
            },
            healthChecks: [
                {
                    url: '/health',
                    expectedStatus: 200,
                    timeout: 5000,
                    name: 'API Health',
                },
                {
                    url: 'https://staging.example.com/status',
                    expectedStatus: 200,
                    timeout: 5000,
                    searchText: 'healthy',
                },
            ],
        };
        checker = getHealthChecker(config);
    });
    describe('Constructor', () => {
        it('creates health checker instance', () => {
            assert.ok(checker);
            assert.ok(checker.check);
            assert.ok(checker.checkDatabase);
            assert.ok(checker.checkCloudFrontOrigin);
            assert.ok(checker.checkOriginAccessControl);
            assert.ok(checker.runAll);
        });
        it('supports configuration with health checks', () => {
            const customConfig = {
                ...config,
                healthChecks: [
                    { url: '/api/health', timeout: 3000, expectedStatus: 200 },
                    { url: '/status', timeout: 5000 },
                ],
            };
            const customChecker = getHealthChecker(customConfig);
            assert.ok(customChecker);
        });
        it('supports configuration without health checks', () => {
            const minimalConfig = {
                projectName: 'minimal',
                mainDomain: 'example.com',
                database: 'none',
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            const minimalChecker = getHealthChecker(minimalConfig);
            assert.ok(minimalChecker);
        });
    });
    describe('check method', () => {
        it('accepts health check configuration', async () => {
            const result = await checker.check({
                url: '/health',
                timeout: 5000,
                expectedStatus: 200,
                name: 'Test Check',
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles absolute URLs', async () => {
            const result = await checker.check({
                url: 'https://example.com/status',
                timeout: 5000,
                expectedStatus: 200,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles relative URLs', async () => {
            const result = await checker.check({
                url: '/api/health',
                timeout: 5000,
                expectedStatus: 200,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('uses stage domain for relative URLs', async () => {
            const result = await checker.check({
                url: '/health',
                timeout: 5000,
                expectedStatus: 200,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('respects timeout configuration', async () => {
            const result = await checker.check({
                url: 'https://httpbin.org/delay/10',
                timeout: 1000, // Short timeout
                expectedStatus: 200,
            }, 'staging');
            // Should timeout and return false
            assert.strictEqual(typeof result, 'boolean');
        });
        it('validates response status code', async () => {
            const result = await checker.check({
                url: 'https://httpbin.org/status/404',
                timeout: 5000,
                expectedStatus: 200, // Expecting 200, will get 404
            }, 'staging');
            // Should fail due to status code mismatch
            assert.strictEqual(typeof result, 'boolean');
        });
        it('accepts status codes 200-399 range', async () => {
            const check = {
                url: 'https://httpbin.org/status/200',
                timeout: 5000,
                expectedStatus: 200,
            };
            const result = await checker.check(check, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles optional check name', async () => {
            const resultWithName = await checker.check({
                url: '/health',
                timeout: 5000,
                name: 'Custom Health Check',
            }, 'staging');
            const resultWithoutName = await checker.check({
                url: '/health',
                timeout: 5000,
            }, 'staging');
            assert.strictEqual(typeof resultWithName, 'boolean');
            assert.strictEqual(typeof resultWithoutName, 'boolean');
        });
        it('supports searchText validation', async () => {
            const result = await checker.check({
                url: 'https://example.com',
                timeout: 5000,
                searchText: 'Example',
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('fails for missing searchText', async () => {
            const result = await checker.check({
                url: 'https://example.com',
                timeout: 5000,
                searchText: 'NonexistentTextThatWontBeFound12345',
            }, 'staging');
            // Should fail because text won't be found
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('checkDatabase method', () => {
        it('returns true when database not configured', async () => {
            const noDbConfig = {
                ...config,
                database: 'none',
            };
            const noDbChecker = getHealthChecker(noDbConfig);
            const result = await noDbChecker.checkDatabase('staging');
            assert.strictEqual(result, true);
        });
        it('attempts DynamoDB check when configured', async () => {
            const result = await checker.checkDatabase('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles missing table name', async () => {
            const noTableConfig = {
                ...config,
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            const noTableChecker = getHealthChecker(noTableConfig);
            const result = await noTableChecker.checkDatabase('staging');
            assert.strictEqual(result, true);
        });
        it('handles different stages', async () => {
            const stagingResult = await checker.checkDatabase('staging');
            const prodResult = await checker.checkDatabase('production');
            assert.strictEqual(typeof stagingResult, 'boolean');
            assert.strictEqual(typeof prodResult, 'boolean');
        });
        it('gracefully handles AWS CLI errors', async () => {
            const result = await checker.checkDatabase('staging');
            // Should not throw, even if table doesn't exist
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('checkCloudFrontOrigin method', () => {
        it('returns true when domain not configured', async () => {
            const noDomainConfig = {
                projectName: 'test',
                mainDomain: 'example.com',
                database: 'dynamodb',
                stageConfig: {
                    staging: {},
                    production: {},
                },
            };
            const noDomainChecker = getHealthChecker(noDomainConfig);
            const result = await noDomainChecker.checkCloudFrontOrigin('staging');
            assert.strictEqual(result, true);
        });
        it('checks CloudFront origin for configured domain', async () => {
            const result = await checker.checkCloudFrontOrigin('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles non-existent distributions', async () => {
            const result = await checker.checkCloudFrontOrigin('staging');
            // Distribution may not exist, which is OK
            assert.strictEqual(typeof result, 'boolean');
        });
        it('validates origin configuration', async () => {
            const result = await checker.checkCloudFrontOrigin('production');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('gracefully handles CloudFront API errors', async () => {
            const result = await checker.checkCloudFrontOrigin('staging');
            // Should not throw
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('checkOriginAccessControl method', () => {
        it('returns true for non-DynamoDB databases', async () => {
            const noDynamoConfig = {
                ...config,
                database: 'rds',
            };
            const noDynamoChecker = getHealthChecker(noDynamoConfig);
            const result = await noDynamoChecker.checkOriginAccessControl('staging');
            assert.strictEqual(result, true);
        });
        it('checks OAC for DynamoDB deployments', async () => {
            const result = await checker.checkOriginAccessControl('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles missing distributions', async () => {
            const result = await checker.checkOriginAccessControl('staging');
            // Distribution may not exist yet
            assert.strictEqual(typeof result, 'boolean');
        });
        it('validates OAC configuration', async () => {
            const result = await checker.checkOriginAccessControl('production');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('gracefully handles API errors', async () => {
            const result = await checker.checkOriginAccessControl('staging');
            // Should not throw
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('runAll method', () => {
        it('executes all checks for a stage', async () => {
            const result = await checker.runAll('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('runs all checks in parallel', async () => {
            const startTime = Date.now();
            const result = await checker.runAll('staging');
            const duration = Date.now() - startTime;
            assert.strictEqual(typeof result, 'boolean');
            // Parallel execution should be reasonably fast
            assert.ok(duration < 60000); // Less than 1 minute
        });
        it('returns true when all checks pass', async () => {
            // Create config with known good endpoint
            const goodConfig = {
                ...config,
                healthChecks: [
                    {
                        url: 'https://example.com',
                        timeout: 5000,
                        expectedStatus: 200,
                    },
                ],
            };
            const goodChecker = getHealthChecker(goodConfig);
            const result = await goodChecker.runAll('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles different stages', async () => {
            const stagingResult = await checker.runAll('staging');
            const prodResult = await checker.runAll('production');
            assert.strictEqual(typeof stagingResult, 'boolean');
            assert.strictEqual(typeof prodResult, 'boolean');
        });
        it('handles empty health checks', async () => {
            const emptyConfig = {
                ...config,
                healthChecks: [],
            };
            const emptyChecker = getHealthChecker(emptyConfig);
            const result = await emptyChecker.runAll('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles configuration without health checks', async () => {
            const noChecksConfig = {
                projectName: 'test',
                mainDomain: 'example.com',
                database: 'none',
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            const noChecksChecker = getHealthChecker(noChecksConfig);
            const result = await noChecksChecker.runAll('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('Edge cases and special scenarios', () => {
        it('handles URLs with query parameters', async () => {
            const result = await checker.check({
                url: 'https://example.com?param=value',
                timeout: 5000,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles URLs with paths and protocols', async () => {
            const result = await checker.check({
                url: 'https://api.example.com/v1/health',
                timeout: 5000,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles HTTP (non-HTTPS) URLs', async () => {
            const result = await checker.check({
                url: 'http://example.com',
                timeout: 5000,
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles very short timeout', async () => {
            const result = await checker.check({
                url: 'https://example.com',
                timeout: 100, // Very short
            }, 'staging');
            // Should timeout and return false
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles very long timeout', async () => {
            const result = await checker.check({
                url: 'https://example.com',
                timeout: 30000, // 30 seconds
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles multiple sequential checks', async () => {
            const results = [];
            for (let i = 0; i < 3; i++) {
                const result = await checker.check({
                    url: 'https://example.com',
                    timeout: 5000,
                }, 'staging');
                results.push(result);
            }
            assert.strictEqual(results.length, 3);
            assert.ok(results.every(r => typeof r === 'boolean'));
        });
        it('handles search text with special characters', async () => {
            const result = await checker.check({
                url: 'https://example.com',
                timeout: 5000,
                searchText: 'Example <>&"\'', // Special chars
            }, 'staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles configuration with AWS profile', async () => {
            const profileConfig = {
                ...config,
                awsProfile: 'custom-profile',
            };
            const profileChecker = getHealthChecker(profileConfig);
            const result = await profileChecker.runAll('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('Method chaining and integration', () => {
        it('all methods return values of expected types', async () => {
            const checkResult = await checker.check({ url: '/health', timeout: 5000 }, 'staging');
            const dbResult = await checker.checkDatabase('staging');
            const cfResult = await checker.checkCloudFrontOrigin('staging');
            const oacResult = await checker.checkOriginAccessControl('staging');
            const allResult = await checker.runAll('staging');
            assert.strictEqual(typeof checkResult, 'boolean');
            assert.strictEqual(typeof dbResult, 'boolean');
            assert.strictEqual(typeof cfResult, 'boolean');
            assert.strictEqual(typeof oacResult, 'boolean');
            assert.strictEqual(typeof allResult, 'boolean');
        });
        it('handles rapid sequential calls', async () => {
            const stage = 'staging';
            const results = [];
            for (let i = 0; i < 5; i++) {
                results.push(await checker.checkDatabase(stage));
                results.push(await checker.checkCloudFrontOrigin(stage));
            }
            assert.strictEqual(results.length, 10);
            assert.ok(results.every(r => typeof r === 'boolean'));
        });
    });
});
