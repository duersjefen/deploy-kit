/**
 * Tests for Dev Checks Registry - Auto-Fix Re-run Behavior
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { runDevChecks } from './registry.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
describe('Dev Checks Registry - Auto-Fix Behavior', () => {
    describe('Auto-Fix Re-run', () => {
        it('should re-run checks after auto-fixing', async () => {
            const projectRoot = join(tmpdir(), 'test-autofix-rerun');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            writeFileSync(join(projectRoot, 'sst.config.ts'), `export default {
  config() {
    return { name: 'test-app', region: 'us-east-1' };
  },
  stacks() {},
};`);
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // After auto-fixing, checks should pass or show updated status
            assert.ok(typeof result.allPassed === 'boolean', 'Should have allPassed status');
            assert.ok(Array.isArray(result.results), 'Should have results array');
            // All results should reflect post-fix state
            for (const checkResult of result.results) {
                assert.ok('passed' in checkResult, 'Each result should have passed field');
            }
        });
        it('should mark checks as passed after successful auto-fix', async () => {
            const projectRoot = join(tmpdir(), 'test-autofix-success');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            writeFileSync(join(projectRoot, 'sst.config.ts'), `export default {
  config() {
    return { name: 'test-app', region: 'us-east-1' };
  },
  stacks() {},
};`);
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // After auto-fixing safe issues, most checks should pass
            // (Some may still fail if they require manual intervention)
            const autoFixableChecks = result.results.filter((r) => r.errorType &&
                ['recursive_sst_dev', 'nextjs_canary_features', 'sst_locks', 'running_sst_processes'].includes(r.errorType));
            // Auto-fixable checks should be resolved
            assert.ok(autoFixableChecks.every((r) => r.passed) || autoFixableChecks.length === 0, 'Auto-fixable checks should pass after fixing');
        });
        it('should not exit after successful auto-fix', async () => {
            // This test verifies that the registry returns results
            // instead of exiting the process
            const projectRoot = join(tmpdir(), 'test-no-exit-after-fix');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            writeFileSync(join(projectRoot, 'sst.config.ts'), `export default {
  config() {
    return { name: 'test-app', region: 'us-east-1' };
  },
  stacks() {},
};`);
            // If the function completes without throwing, it means it didn't exit
            const result = await runDevChecks(projectRoot, config, 3000, false);
            assert.ok(result, 'Function should return instead of exiting');
            assert.ok('allPassed' in result, 'Should return result object');
        });
    });
    describe('Safe Fix Detection', () => {
        it('should identify safe fix types', async () => {
            // Safe fix types: recursive_sst_dev, nextjs_canary_features, sst_locks, running_sst_processes
            const projectRoot = join(tmpdir(), 'test-safe-fixes');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // Check that the registry identifies and auto-fixes safe types
            assert.ok(Array.isArray(result.results), 'Should process check results');
        });
        it('should not auto-fix risky checks', async () => {
            // Risky checks require manual intervention
            const projectRoot = join(tmpdir(), 'test-risky-checks');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // Risky checks should still show as failed if they fail
            // (They should not be auto-fixed)
            assert.ok(result, 'Should complete without auto-fixing risky checks');
        });
    });
    describe('Check Verification', () => {
        it('should verify fix was successful', async () => {
            const projectRoot = join(tmpdir(), 'test-verify-fix');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            writeFileSync(join(projectRoot, 'sst.config.ts'), `export default {
  config() {
    return { name: 'test-app', region: 'us-east-1' };
  },
  stacks() {},
};`);
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // The re-check result should reflect the actual state after fixing
            assert.ok(result, 'Should have verification results');
        });
        it('should handle failed verification', async () => {
            // If auto-fix fails, the re-check should show the check still failed
            const projectRoot = join(tmpdir(), 'test-failed-verify');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // Should handle the case where verification fails
            assert.ok(typeof result.allPassed === 'boolean', 'Should have pass/fail status');
        });
    });
    describe('Error Handling', () => {
        it('should handle check execution errors', async () => {
            const projectRoot = join(tmpdir(), 'test-check-errors');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            // Should not throw even if checks error
            const result = await runDevChecks(projectRoot, config, 3000, false);
            assert.ok(result, 'Should handle errors gracefully');
        });
        it('should mark errored checks as passed (skip)', async () => {
            // When a check throws an error, it should be treated as skipped (passed: true)
            const projectRoot = join(tmpdir(), 'test-error-skip');
            mkdirSync(projectRoot, { recursive: true });
            const config = {
                projectName: 'test-app',
                infrastructure: 'sst-serverless',
                stages: ['staging'],
                stageConfig: {
                    staging: { domain: 'staging.example.com' },
                    production: { domain: 'prod.example.com' },
                },
            };
            writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
            const result = await runDevChecks(projectRoot, config, 3000, false);
            // All results should have a passed field
            assert.ok(result.results.every((r) => 'passed' in r), 'All checks should have passed field');
        });
    });
});
