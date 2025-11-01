/**
 * Tests for pre-deployment checks
 */
import { describe, it } from 'node:test';
import { createMockProjectConfig, assertEqual, assert, } from '../test-utils.js';
describe('pre-deployment checks', () => {
    describe('configuration validation', () => {
        it('validates required project config fields', () => {
            const config = createMockProjectConfig();
            assert(config.projectName !== undefined, 'Should have projectName');
            assert(config.infrastructure !== undefined, 'Should have infrastructure');
            assert(config.stages !== undefined, 'Should have stages');
            assert(config.stageConfig !== undefined, 'Should have stageConfig');
            assert(config.mainDomain !== undefined, 'Should have mainDomain');
        });
        it('validates stage configurations', () => {
            const config = createMockProjectConfig();
            for (const stage of config.stages) {
                assert(config.stageConfig[stage] !== undefined, `Should have config for ${stage} stage`);
                assert(config.stageConfig[stage].domain !== undefined, `${stage} should have domain configured`);
            }
        });
        it('supports custom AWS profile', () => {
            const config = createMockProjectConfig({
                awsProfile: 'my-custom-profile',
            });
            assertEqual(config.awsProfile, 'my-custom-profile', 'Should use custom AWS profile');
        });
        it('supports disabling git check', () => {
            const config = createMockProjectConfig({
                requireCleanGit: false,
            });
            assertEqual(config.requireCleanGit, false, 'Should support disabling git check');
        });
        it('supports disabling test execution', () => {
            const config = createMockProjectConfig({
                runTestsBeforeDeploy: false,
            });
            assertEqual(config.runTestsBeforeDeploy, false, 'Should support disabling tests');
        });
    });
    describe('check configuration options', () => {
        it('supports per-stage health check toggle', () => {
            const config = createMockProjectConfig({
                stageConfig: {
                    staging: {
                        domain: 'staging.example.com',
                        skipHealthChecks: true,
                    },
                    production: {
                        domain: 'example.com',
                        skipHealthChecks: false,
                    },
                },
            });
            assertEqual(config.stageConfig.staging.skipHealthChecks, true, 'Staging can skip health checks');
            assertEqual(config.stageConfig.production.skipHealthChecks, false, 'Production can require health checks');
        });
        it('supports per-stage cache invalidation toggle', () => {
            const config = createMockProjectConfig({
                stageConfig: {
                    staging: {
                        domain: 'staging.example.com',
                        skipCacheInvalidation: true,
                    },
                    production: {
                        domain: 'example.com',
                        skipCacheInvalidation: false,
                    },
                },
            });
            assertEqual(config.stageConfig.staging.skipCacheInvalidation, true, 'Staging can skip cache invalidation');
            assertEqual(config.stageConfig.production.skipCacheInvalidation, false, 'Production can enable cache invalidation');
        });
        it('supports deployment confirmation requirement', () => {
            const config = createMockProjectConfig({
                stageConfig: {
                    staging: {
                        domain: 'staging.example.com',
                        requiresConfirmation: false,
                    },
                    production: {
                        domain: 'example.com',
                        requiresConfirmation: true,
                    },
                },
            });
            assertEqual(config.stageConfig.staging.requiresConfirmation, false, 'Staging should not require confirmation');
            assertEqual(config.stageConfig.production.requiresConfirmation, true, 'Production should require confirmation');
        });
    });
    describe('health check configuration', () => {
        it('supports multiple health checks', () => {
            const config = createMockProjectConfig({
                healthChecks: [
                    {
                        url: '/',
                        expectedStatus: 200,
                        timeout: 5000,
                        name: 'Homepage',
                    },
                    {
                        url: '/api/health',
                        expectedStatus: 200,
                        timeout: 5000,
                        name: 'API Health',
                    },
                    {
                        url: '/api/ready',
                        expectedStatus: 200,
                        timeout: 5000,
                        name: 'Ready Probe',
                    },
                ],
            });
            assertEqual(config.healthChecks.length, 3, 'Should have 3 health checks');
            assertEqual(config.healthChecks[0].name, 'Homepage', 'First check should be homepage');
            assertEqual(config.healthChecks[1].name, 'API Health', 'Second check should be API health');
            assertEqual(config.healthChecks[2].name, 'Ready Probe', 'Third check should be ready probe');
        });
        it('validates health check structure', () => {
            const healthCheck = {
                url: '/health',
                expectedStatus: 200,
                timeout: 5000,
                name: 'Health',
            };
            assert(healthCheck.url !== undefined, 'Health check should have URL');
            assert(healthCheck.expectedStatus !== undefined, 'Health check should have expected status');
            assert(healthCheck.timeout !== undefined, 'Health check should have timeout');
            assert(healthCheck.name !== undefined, 'Health check should have name');
        });
    });
    describe('hooks configuration', () => {
        it('supports pre-deploy hook', () => {
            const config = createMockProjectConfig({
                hooks: {
                    preDeploy: 'npm test',
                },
            });
            assertEqual(config.hooks.preDeploy, 'npm test', 'Should support preDeploy hook');
        });
        it('supports post-build hook', () => {
            const config = createMockProjectConfig({
                hooks: {
                    postBuild: 'npm run build',
                },
            });
            assertEqual(config.hooks.postBuild, 'npm run build', 'Should support postBuild hook');
        });
        it('supports custom pre-deploy script', () => {
            const config = createMockProjectConfig({
                hooks: {
                    preDeploy: 'bash ./scripts/pre-deploy.sh',
                },
            });
            assert(config.hooks.preDeploy?.includes('pre-deploy.sh'), 'Should support custom pre-deploy script');
        });
    });
    describe('AWS region configuration', () => {
        it('supports per-stage AWS region', () => {
            const config = createMockProjectConfig({
                stageConfig: {
                    staging: {
                        domain: 'staging.example.com',
                        awsRegion: 'eu-north-1',
                    },
                    production: {
                        domain: 'example.com',
                        awsRegion: 'us-east-1',
                    },
                },
            });
            assertEqual(config.stageConfig.staging.awsRegion, 'eu-north-1', 'Staging should use eu-north-1');
            assertEqual(config.stageConfig.production.awsRegion, 'us-east-1', 'Production should use us-east-1');
        });
        it('validates AWS region values', () => {
            const validRegions = ['us-east-1', 'eu-west-1', 'ap-southeast-1', 'eu-north-1'];
            for (const region of validRegions) {
                // Simple AWS region format validation
                const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
                assert(regionRegex.test(region), `${region} should be valid AWS region format`);
            }
        });
    });
    describe('deployment lock behavior', () => {
        it('respects lock acquisition', () => {
            // Test lock structure
            const lock = {
                stage: 'staging',
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 3600000), // 1 hour
            };
            assert(lock.stage !== undefined, 'Lock should have stage');
            assert(lock.timestamp !== undefined, 'Lock should have timestamp');
            assert(lock.expiresAt !== undefined, 'Lock should have expiry');
        });
        it('detects expired locks', () => {
            const now = new Date();
            const expiredLock = {
                stage: 'staging',
                timestamp: new Date(now.getTime() - 7200000), // 2 hours ago
                expiresAt: new Date(now.getTime() - 3600000), // 1 hour ago
            };
            const isExpired = expiredLock.expiresAt < now;
            assert(isExpired, 'Should detect expired lock');
        });
    });
    describe('custom deployment scripts', () => {
        it('supports custom deploy script configuration', () => {
            const config = createMockProjectConfig({
                customDeployScript: 'bash ./scripts/deploy.sh',
            });
            assert(config.customDeployScript !== undefined, 'Should support custom deploy script');
            assert(config.customDeployScript.includes('deploy.sh'), 'Custom script path should be configured');
        });
        it('validation supports both bash and shell scripts', () => {
            const scripts = ['bash ./deploy.sh', 'sh ./deploy.sh', '/bin/bash ./deploy.sh'];
            const scriptRegex = /(bash|sh)\s+\./;
            for (const script of scripts) {
                assert(scriptRegex.test(script), `${script} should be valid script format`);
            }
        });
    });
});
