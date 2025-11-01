/**
 * Tests for Health Checker
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getHealthChecker } from './checker.js';
const mockConfig = {
    projectName: 'test-project',
    mainDomain: 'example.com',
    awsProfile: 'test-profile',
    infrastructure: "sst-serverless",
    database: 'dynamodb',
    stages: ['dev', 'staging', 'production'],
    healthChecks: [],
    stageConfig: {
        dev: { domain: 'dev.example.com', skipHealthChecks: false, skipCacheInvalidation: false },
        staging: { domain: 'staging.example.com', dynamoTableName: 'test-staging', skipHealthChecks: false, skipCacheInvalidation: false },
        production: { domain: 'example.com', dynamoTableName: 'test-prod', skipHealthChecks: false, skipCacheInvalidation: false },
    },
};
describe('HealthChecker', () => {
    it('should pass when endpoint returns 200', async () => {
        const checker = getHealthChecker(mockConfig);
        const healthCheck = {
            name: 'Homepage',
            url: 'https://httpbin.org/status/200',
            timeout: 5000,
        };
        const result = await checker.check(healthCheck, 'staging');
        assert.strictEqual(result, true);
    });
    it('should fail when endpoint returns 500', async () => {
        const checker = getHealthChecker(mockConfig);
        const healthCheck = {
            name: 'Broken',
            url: 'https://httpbin.org/status/500',
            timeout: 5000,
        };
        const result = await checker.check(healthCheck, 'staging');
        assert.strictEqual(result, false);
    });
    it('should return true when database not configured', async () => {
        const config = { ...mockConfig, database: undefined };
        const checker = getHealthChecker(config);
        const result = await checker.checkDatabase('staging');
        assert.strictEqual(result, true);
    });
});
