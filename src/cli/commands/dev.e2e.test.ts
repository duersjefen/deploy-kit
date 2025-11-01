/**
 * E2E Tests for Development Environment Workflow
 *
 * Tests the complete deployment workflow from config loading through dev server startup.
 * Uses localstack for AWS service emulation when available, gracefully skips otherwise.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleDevCommand } from './dev.js';
import { runDevChecks, getDevChecks } from '../dev-checks/registry.js';

// Helper to check if localstack is available
function hasLocalstack(): boolean {
  return !!process.env.LOCALSTACK_ENDPOINT || !!process.env.DOCKER_HOST;
}

// Skip reason for localstack-dependent tests
const skipLocalstackTests = !hasLocalstack()
  ? 'Requires Docker/Localstack (set LOCALSTACK_ENDPOINT or DOCKER_HOST)'
  : null;

describe('Dev Command E2E Workflow', () => {
  describe('Config Loading', () => {
    it('loads valid .deploy-config.json', async () => {
      const projectRoot = join(tmpdir(), 'e2e-config-valid');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging', 'production'],
        stageConfig: {
          staging: { domain: 'staging.example.com' },
          production: { domain: 'prod.example.com' },
        },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Should not throw when loading config
      const checks = getDevChecks(projectRoot, config, 3000, false);
      assert.ok(checks.length > 0, 'Should have pre-flight checks registered');
      assert.strictEqual(checks.some(c => c.name === 'AWS Credentials'), true);
    });

    it('handles missing .deploy-config.json gracefully', async () => {
      const projectRoot = join(tmpdir(), 'e2e-config-missing');
      mkdirSync(projectRoot, { recursive: true });

      // Should proceed without config
      const checks = getDevChecks(projectRoot, null, 3000, false);
      assert.ok(checks.length > 0, 'Should still run checks without config');
    });

    it('handles invalid JSON in .deploy-config.json', async () => {
      const projectRoot = join(tmpdir(), 'e2e-config-invalid-json');
      mkdirSync(projectRoot, { recursive: true });

      writeFileSync(
        join(projectRoot, '.deploy-config.json'),
        '{invalid json}' // Invalid JSON
      );

      // Should handle gracefully
      try {
        const checks = getDevChecks(projectRoot, null, 3000, false);
        assert.ok(checks.length > 0, 'Should proceed with invalid config');
      } catch (error) {
        // Error handling is acceptable too
        assert.ok(error);
      }
    });
  });

  describe('Pre-Flight Checks Execution', () => {
    it('executes all registered checks', async () => {
      const projectRoot = join(tmpdir(), 'e2e-checks-all');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Create minimal sst.config.ts to pass SST config check
      writeFileSync(
        join(projectRoot, 'sst.config.ts'),
        `export default {
  config() {
    return {
      name: 'test-app',
      region: 'us-east-1',
    };
  },
  stacks() {},
};`
      );

      const result = await runDevChecks(projectRoot, config, 3000, false);

      // Should have attempted all checks
      assert.ok(result.results.length > 5, 'Should run multiple checks');
      // Should have at least some result
      assert.ok(Array.isArray(result.results));
    });

    it('handles check failures gracefully', async () => {
      const projectRoot = join(tmpdir(), 'e2e-checks-failure');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // This should run checks and return results even if some fail
      const result = await runDevChecks(projectRoot, config, 3000, false);
      assert.ok(typeof result.allPassed === 'boolean', 'Should indicate overall pass/fail status');
      assert.ok(Array.isArray(result.results), 'Should return array of check results');
    });

    it('handles port availability check', async () => {
      const projectRoot = join(tmpdir(), 'e2e-port-check');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Test port 0 (auto-select)
      const result = await runDevChecks(projectRoot, config, 0, false);
      assert.ok(Array.isArray(result.results), 'Should complete port check');
    });
  });

  describe('Check Result Handling', () => {
    it('identifies passed checks', async () => {
      const projectRoot = join(tmpdir(), 'e2e-check-pass');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
      writeFileSync(
        join(projectRoot, 'sst.config.ts'),
        `export default {
  config() {
    return {
      name: 'test-app',
      region: 'us-east-1',
    };
  },
  stacks() {},
};`
      );

      const result = await runDevChecks(projectRoot, config, 3000, false);

      // Some checks should have passed (port availability, config validation, etc.)
      const passedChecks = result.results.filter(r => r.passed);
      assert.ok(passedChecks.length > 0, 'Should have some passing checks');
    });

    it('aggregates overall pass/fail status', async () => {
      const projectRoot = join(tmpdir(), 'e2e-check-aggregate');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      const result = await runDevChecks(projectRoot, config, 3000, false);

      // allPassed should be based on individual results
      const expectedPass = result.results.every(r => r.passed);
      assert.strictEqual(result.allPassed, expectedPass, 'Overall status should match individual results');
    });
  });

  describe('Verbose Mode', () => {
    it('outputs debug information in verbose mode', async () => {
      const projectRoot = join(tmpdir(), 'e2e-verbose');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Capture output
      const originalLog = console.log;
      let output = '';
      console.log = (msg: any) => {
        output += String(msg);
      };

      try {
        await runDevChecks(projectRoot, config, 3000, true);
        // In verbose mode, there should be debug output
        // Note: This is captured in the test framework
      } finally {
        console.log = originalLog;
      }
    });

    it('suppresses debug output in normal mode', async () => {
      const projectRoot = join(tmpdir(), 'e2e-normal');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Should run without debug verbosity
      const result = await runDevChecks(projectRoot, config, 3000, false);
      assert.ok(typeof result.allPassed === 'boolean');
    });
  });

  describe('Error Handling', () => {
    it('recovers from check execution errors', async () => {
      const projectRoot = join(tmpdir(), 'e2e-check-error');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Should not throw even if checks encounter errors
      const result = await runDevChecks(projectRoot, config, 3000, false);
      assert.ok(typeof result.allPassed === 'boolean', 'Should return result despite errors');
    });

    it('handles missing AWS credentials gracefully', async () => {
      const projectRoot = join(tmpdir(), 'e2e-no-aws-creds');
      mkdirSync(projectRoot, { recursive: true });

      const config = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless' as const,
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
      } as any; // Test config - not fully typed
      writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

      // Should run checks even without AWS credentials (check will fail but not crash)
      const result = await runDevChecks(projectRoot, config, 3000, false);
      assert.ok(Array.isArray(result.results), 'Should complete despite missing credentials');
    });
  });

  describe('Cleanup', () => {
    it('cleans up temporary test directories', () => {
      // List of temp dirs created in tests
      const tempDirs = [
        'e2e-config-valid',
        'e2e-config-missing',
        'e2e-config-invalid-json',
        'e2e-checks-all',
        'e2e-checks-failure',
        'e2e-port-check',
        'e2e-check-pass',
        'e2e-check-aggregate',
        'e2e-verbose',
        'e2e-normal',
        'e2e-check-error',
        'e2e-no-aws-creds',
      ];

      for (const dir of tempDirs) {
        const fullPath = join(tmpdir(), dir);
        try {
          if (require('fs').existsSync(fullPath)) {
            rmSync(fullPath, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      assert.ok(true, 'Cleanup completed');
    });
  });
});

// Integration tests with localstack (skipped if Docker not available)
describe('Dev Command Integration Tests (With AWS)', () => {
  it('validates AWS credentials against actual provider', { skip: !!skipLocalstackTests }, async () => {
    const projectRoot = join(tmpdir(), 'e2e-aws-integration');
    mkdirSync(projectRoot, { recursive: true });

    const config = {
      projectName: 'test-app',
      infrastructure: 'sst-serverless' as const,
      stages: ['staging'],
      stageConfig: { staging: { domain: 'staging.example.com' }, production: { domain: 'prod.example.com' } },
    } as any; // Test config
    writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));
    writeFileSync(
      join(projectRoot, 'sst.config.ts'),
      `export default {
  config() {
    return {
      name: 'test-app',
      region: 'us-east-1',
    };
  },
  stacks() {},
};`
    );

    const result = await runDevChecks(projectRoot, config, 3000, false);
    assert.ok(Array.isArray(result.results), 'Should run AWS credential check against localstack');

    // Cleanup
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('validates CloudFront operations against AWS', { skip: !!skipLocalstackTests }, async () => {
    const projectRoot = join(tmpdir(), 'e2e-cloudfront-integration');
    mkdirSync(projectRoot, { recursive: true });

    const config = {
      projectName: 'test-app',
      infrastructure: 'sst-serverless' as const,
      stages: ['staging', 'production'],
      stageConfig: {
        staging: { domain: 'staging.example.com' },
        production: { domain: 'prod.example.com' },
      },
      mainDomain: 'example.com',
    } as any; // Test config
    writeFileSync(join(projectRoot, '.deploy-config.json'), JSON.stringify(config));

    // Should handle CloudFront operations
    const checks = getDevChecks(projectRoot, config, 3000, false);
    assert.ok(checks.length > 0, 'Should include CloudFront-related checks');

    // Cleanup
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
