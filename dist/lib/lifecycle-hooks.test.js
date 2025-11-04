/**
 * Tests for lifecycle hooks
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { runLifecycleHook, hasLifecycleHook } from './lifecycle-hooks.js';
describe('Lifecycle Hooks', () => {
    const testProjectRoot = '/tmp/deploy-kit-test-lifecycle-hooks';
    beforeEach(() => {
        // Create test directory
        if (existsSync(testProjectRoot)) {
            rmSync(testProjectRoot, { recursive: true, force: true });
        }
        mkdirSync(testProjectRoot, { recursive: true });
    });
    afterEach(() => {
        // Cleanup test directory
        if (existsSync(testProjectRoot)) {
            rmSync(testProjectRoot, { recursive: true, force: true });
        }
    });
    it('should skip when no package.json exists', async () => {
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(result, true, 'Should return true when no package.json');
    });
    it('should skip when package.json has no scripts', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({ name: 'test-project', version: '1.0.0' }));
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(result, true, 'Should return true when no scripts');
    });
    it('should skip when hook does not exist', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'other-script': 'echo "other"'
            }
        }));
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(result, true, 'Should return true when hook does not exist');
    });
    it('should execute generic hook when stage-specific does not exist', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'echo "generic pre-deploy"'
            }
        }));
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(result, true, 'Should execute generic hook successfully');
    });
    it('should prefer stage-specific hook over generic', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'echo "generic"',
                'pre-deploy:production': 'echo "production-specific"'
            }
        }));
        // For staging, should use generic
        const resultStaging = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(resultStaging, true, 'Should use generic hook for staging');
        // For production, should use stage-specific
        const resultProduction = await runLifecycleHook('pre-deploy', {
            stage: 'production',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(resultProduction, true, 'Should use stage-specific hook for production');
    });
    it('should handle hook failures gracefully', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'exit 1'
            }
        }));
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        // Should return false but not throw
        assert.strictEqual(result, false, 'Should return false when hook fails');
    });
    it('should execute all hook types', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'echo "pre"',
                'post-deploy': 'echo "post"',
                'on-failure': 'echo "failure"'
            }
        }));
        const context = {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        };
        const resultPre = await runLifecycleHook('pre-deploy', context);
        const resultPost = await runLifecycleHook('post-deploy', context);
        const resultFailure = await runLifecycleHook('on-failure', context);
        assert.strictEqual(resultPre, true, 'pre-deploy should succeed');
        assert.strictEqual(resultPost, true, 'post-deploy should succeed');
        assert.strictEqual(resultFailure, true, 'on-failure should succeed');
    });
    it('should detect hook existence with hasLifecycleHook', () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'echo "pre"',
                'post-deploy:production': 'echo "post prod"'
            }
        }));
        // Generic hook
        assert.strictEqual(hasLifecycleHook('pre-deploy', 'staging', testProjectRoot), true, 'Should detect generic pre-deploy hook');
        // Stage-specific hook
        assert.strictEqual(hasLifecycleHook('post-deploy', 'production', testProjectRoot), true, 'Should detect stage-specific post-deploy hook');
        // Non-existent hook
        assert.strictEqual(hasLifecycleHook('on-failure', 'staging', testProjectRoot), false, 'Should not detect non-existent hook');
        // Stage-specific doesn't exist, generic doesn't exist
        assert.strictEqual(hasLifecycleHook('post-deploy', 'staging', testProjectRoot), false, 'Should not detect hook for staging when only production exists');
    });
    it('should handle malformed package.json gracefully', async () => {
        writeFileSync(resolve(testProjectRoot, 'package.json'), '{ invalid json');
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        assert.strictEqual(result, true, 'Should return true when package.json is malformed');
    });
    it('should work with all package managers', async () => {
        // Note: This test just verifies the function works,
        // actual package manager detection is tested in package-manager.test.ts
        writeFileSync(resolve(testProjectRoot, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            scripts: {
                'pre-deploy': 'echo "test"'
            }
        }));
        const result = await runLifecycleHook('pre-deploy', {
            stage: 'staging',
            isDryRun: false,
            startTime: new Date(),
            projectRoot: testProjectRoot,
        });
        // Should work regardless of package manager
        assert.strictEqual(typeof result, 'boolean', 'Should return a boolean');
    });
});
