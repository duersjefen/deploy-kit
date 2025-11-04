/**
 * Pre-Deployment Checks Orchestrator Tests
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getChecksForStage, loadChecksConfig } from './orchestrator.js';
describe('Pre-Deployment Checks', () => {
    describe('getChecksForStage', () => {
        test('should return empty array when no checks configured', () => {
            const config = {};
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 0);
        });
        test('should include typecheck when configured', () => {
            const config = {
                typecheck: true,
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 1);
            assert.equal(checks[0].name, 'Type Check');
            assert.equal(checks[0].command, 'npm run typecheck');
        });
        test('should include test when configured', () => {
            const config = {
                test: {
                    command: 'npm test',
                    timeout: 60000,
                },
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 1);
            assert.equal(checks[0].name, 'Unit Tests');
            assert.equal(checks[0].command, 'npm test');
            assert.equal(checks[0].timeout, 60000);
        });
        test('should include build when configured', () => {
            const config = {
                build: true,
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 1);
            assert.equal(checks[0].name, 'Build');
            assert.equal(checks[0].command, 'npm run build');
        });
        test('should filter checks by stage', () => {
            const config = {
                typecheck: true,
                e2e: {
                    command: 'npm run test:e2e',
                    stages: ['staging', 'production'],
                },
            };
            // E2E should run on staging
            const stagingChecks = getChecksForStage(config, 'staging');
            assert.equal(stagingChecks.length, 2);
            assert.ok(stagingChecks.some(c => c.name === 'Type Check'));
            assert.ok(stagingChecks.some(c => c.name === 'E2E Tests'));
            // E2E should not run on dev
            const devChecks = getChecksForStage(config, 'dev');
            assert.equal(devChecks.length, 1);
            assert.equal(devChecks[0].name, 'Type Check');
        });
        test('should respect enabled flag', () => {
            const config = {
                typecheck: {
                    command: 'npm run typecheck',
                    enabled: false,
                },
                test: true,
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 1);
            assert.equal(checks[0].name, 'Unit Tests');
        });
        test('should include custom checks', () => {
            const config = {
                custom: [
                    {
                        name: 'Lint',
                        command: 'npm run lint',
                        timeout: 30000,
                    },
                    {
                        name: 'Security Audit',
                        command: 'npm audit',
                        timeout: 30000,
                    },
                ],
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 2);
            assert.equal(checks[0].name, 'Lint');
            assert.equal(checks[1].name, 'Security Audit');
        });
        test('should filter custom checks by stage', () => {
            const config = {
                custom: [
                    {
                        name: 'Quick Check',
                        command: 'npm run quick',
                    },
                    {
                        name: 'Production Check',
                        command: 'npm run prod-check',
                        stages: ['production'],
                    },
                ],
            };
            const stagingChecks = getChecksForStage(config, 'staging');
            assert.equal(stagingChecks.length, 1);
            assert.equal(stagingChecks[0].name, 'Quick Check');
            const productionChecks = getChecksForStage(config, 'production');
            assert.equal(productionChecks.length, 2);
        });
        test('should handle mixed configuration types', () => {
            const config = {
                typecheck: true, // Boolean
                test: {
                    // Object
                    command: 'npm test -- --coverage',
                    timeout: 90000,
                },
                build: false, // Explicitly disabled
                lint: true,
            };
            const checks = getChecksForStage(config, 'staging');
            assert.equal(checks.length, 3); // typecheck, test, lint
            assert.ok(checks.some(c => c.name === 'Type Check'));
            assert.ok(checks.some(c => c.name === 'Unit Tests'));
            assert.ok(checks.some(c => c.name === 'Lint'));
            assert.ok(!checks.some(c => c.name === 'Build')); // Should not include disabled
        });
    });
    describe('loadChecksConfig', () => {
        test('should return empty config for non-existent directory', () => {
            const config = loadChecksConfig('/nonexistent/directory/path');
            // Should return empty config without crashing
            assert.ok(typeof config === 'object');
        });
    });
});
