/**
 * Configuration Validator Tests
 *
 * Tests for validateConfig (fast sync version) and validateConfigAsync (with AWS profile checks)
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  validateConfig,
  validateConfigAsync,
  mergeConfigs,
  type DeployConfig,
  type UnvalidatedConfig,
} from './config-validator.js';

describe('Config Validator - Synchronous Validation', () => {
  describe('Required Fields Validation', () => {
    it('rejects config missing projectName', () => {
      const config: UnvalidatedConfig = {
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('projectName')));
    });

    it('rejects config with invalid projectName format', () => {
      const config: UnvalidatedConfig = {
        projectName: 'Invalid_Name',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('projectName')));
    });

    it('accepts valid projectName (lowercase with hyphens)', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app-123',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' } },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
      assert.ok(!result.errors.some((e) => e.includes('projectName')));
    });

    it('rejects config missing infrastructure', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        stages: ['staging'],
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('infrastructure')));
    });

    it('rejects invalid infrastructure type', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'invalid-type',
        stages: ['staging'],
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('infrastructure')));
    });

    it('accepts all valid infrastructure types', () => {
      for (const infrastructure of ['sst-serverless', 'ec2-docker', 'custom']) {
        const config: UnvalidatedConfig = {
          projectName: 'my-app',
          infrastructure,
          stages: ['staging'],
          stageConfig: { staging: { domain: 'example.com' } },
        };

        const result = validateConfig(config);

        assert.strictEqual(result.valid, true);
        assert.ok(!result.errors.some((e) => e.includes('infrastructure')));
      }
    });

    it('rejects config missing stages', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('stages')));
    });

    it('rejects config with empty stages array', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: [],
        stageConfig: {},
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('stages')));
    });

    it('rejects config missing stageConfig', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('stageConfig')));
    });

    it('rejects stages not in stageConfig', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: { staging: { domain: 'staging.example.com' } },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('production')));
    });
  });

  describe('Domain Validation', () => {
    it('validates stage domain formats', () => {
      const validDomains = [
        'example.com',
        'staging.example.com',
        'api-v2.staging.example.com',
        'example.co.uk',
        'api.example.co.uk',
      ];

      for (const domain of validDomains) {
        const config: UnvalidatedConfig = {
          projectName: 'my-app',
          infrastructure: 'sst-serverless',
          stages: ['staging'],
          stageConfig: { staging: { domain } },
        };

        const result = validateConfig(config);

        assert.strictEqual(result.valid, true, `Domain ${domain} should be valid`);
      }
    });

    it('rejects invalid stage domain formats', () => {
      const invalidDomains = [
        'example',
        '.example.com',
        'example.c',
        '-example.com',
        'example-.com',
        'exam ple.com',
      ];

      for (const domain of invalidDomains) {
        const config: UnvalidatedConfig = {
          projectName: 'my-app',
          infrastructure: 'sst-serverless',
          stages: ['staging'],
          stageConfig: { staging: { domain } },
        };

        const result = validateConfig(config);

        assert.strictEqual(result.valid, false, `Domain ${domain} should be invalid`);
        assert.ok(result.errors.some((e) => e.includes('Invalid domain')));
      }
    });

    it('validates mainDomain', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'staging.example.com' } },
        mainDomain: 'invalid-domain',
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('mainDomain')));
    });

    it('warns when stage missing domain', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: {} },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some((w) => w.includes('domain')));
    });
  });

  describe('Health Checks Validation', () => {
    it('validates health check structure', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
        healthChecks: [
          { url: 'https://example.com/health', expectedStatus: 200 },
          { url: 'https://api.example.com/health', expectedStatus: 200 },
        ],
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
    });

    it('rejects health check missing url', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
        healthChecks: [{ expectedStatus: 200 }],
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('missing url')));
    });

    it('rejects health check with non-numeric expectedStatus', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
        healthChecks: [{ url: 'https://example.com', expectedStatus: '200' }],
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('expectedStatus')));
    });
  });

  describe('Reserved Stages Validation', () => {
    it('rejects reserved stage names', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['local', 'staging'],
        stageConfig: { local: {}, staging: {} },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('reserved names')));
    });
  });

  describe('AWS Profile Validation', () => {
    it('warns when awsProfile specified (sync version skips AWS CLI check)', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'ec2-docker',
        awsProfile: 'my-profile',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
      // Sync version should mention to run with --validate-aws
      assert.ok(result.warnings.some((w) => w.includes('--validate-aws')));
    });

    it('warns when non-SST project missing awsProfile', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'ec2-docker',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some((w) => w.includes('awsProfile not specified')));
    });

    it('does not warn about awsProfile for SST projects', () => {
      const config: UnvalidatedConfig = {
        projectName: 'my-app',
        infrastructure: 'sst-serverless',
        stages: ['staging'],
        stageConfig: { staging: { domain: 'example.com' } },
      };

      const result = validateConfig(config);

      assert.strictEqual(result.valid, true);
      assert.ok(!result.warnings.some((w) => w.includes('awsProfile not specified')));
    });
  });
});

describe('Config Validator - Async Validation', () => {
  it('validates config asynchronously', async () => {
    const config: UnvalidatedConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'example.com' } },
    };

    const result = await validateConfigAsync(config);

    assert.strictEqual(result.valid, true);
  });

  it('returns same result as sync for invalid config', async () => {
    const config: UnvalidatedConfig = {
      projectName: 'Invalid_Name',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: {},
    };

    const syncResult = validateConfig(config);
    const asyncResult = await validateConfigAsync(config);

    assert.strictEqual(syncResult.valid, asyncResult.valid);
    assert.strictEqual(syncResult.errors.length, asyncResult.errors.length);
  });
});

describe('Config Merge', () => {
  it('preserves existing config values', () => {
    const existing: DeployConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: { domain: 'staging.example.com' },
        production: { domain: 'example.com' },
      },
    };

    const template: DeployConfig = {
      projectName: 'template',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: {
        staging: { domain: 'template.example.com' },
        dev: { domain: 'dev.example.com' },
      },
    };

    const merged = mergeConfigs(existing, template);

    assert.strictEqual(merged.projectName, 'my-app');
    assert.deepStrictEqual(merged.stages, ['staging', 'production']);
    assert.strictEqual(merged.stageConfig.staging.domain, 'staging.example.com');
  });

  it('adds new stages from template', () => {
    const existing: DeployConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'staging.example.com' } },
    };

    const template: DeployConfig = {
      projectName: 'template',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'qa', 'production'],
      stageConfig: {
        staging: { domain: 'template.example.com' },
        qa: { domain: 'qa.example.com' },
        production: { domain: 'prod.example.com' },
      },
    };

    const merged = mergeConfigs(existing, template);

    assert.ok(merged.stageConfig.qa);
    assert.ok(merged.stageConfig.production);
    assert.strictEqual(merged.stageConfig.qa.domain, 'qa.example.com');
  });

  it('deduplicates health checks by URL', () => {
    const existing: DeployConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'staging.example.com' } },
      healthChecks: [
        { url: 'https://example.com/health', expectedStatus: 200 },
        { url: 'https://api.example.com/health', expectedStatus: 200 },
      ],
    };

    const template: DeployConfig = {
      projectName: 'template',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'example.com' } },
      healthChecks: [
        { url: 'https://example.com/health', expectedStatus: 200 }, // Duplicate
        { url: 'https://db.example.com/health', expectedStatus: 200 }, // New
      ],
    };

    const merged = mergeConfigs(existing, template);

    assert.strictEqual(merged.healthChecks?.length, 3);
    const urls = merged.healthChecks?.map((h) => h.url) ?? [];
    assert.strictEqual(urls.filter((u) => u === 'https://example.com/health').length, 1);
  });

  it('adds missing fields from template', () => {
    const existing: DeployConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'example.com' } },
    };

    const template: DeployConfig = {
      projectName: 'template',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'example.com' } },
      displayName: 'My Application',
      hooks: { 'post-deploy': 'echo "deployed"' },
    };

    const merged = mergeConfigs(existing, template);

    assert.strictEqual(merged.displayName, 'My Application');
    assert.ok(merged.hooks);
  });
});

describe('Performance - Config Validation', () => {
  it('validates config efficiently (>1000 ops/sec)', () => {
    const config: UnvalidatedConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production', 'qa'],
      stageConfig: {
        staging: { domain: 'staging.example.com' },
        production: { domain: 'example.com' },
        qa: { domain: 'qa.example.com' },
      },
      mainDomain: 'example.com',
      healthChecks: [
        { url: 'https://example.com/health', expectedStatus: 200 },
        { url: 'https://api.example.com/health', expectedStatus: 200 },
      ],
    };

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      validateConfig(config);
    }

    const duration = performance.now() - start;
    const opsPerSecond = (iterations / duration) * 1000;

    assert.ok(
      opsPerSecond > 1000,
      `Should validate >1000 ops/sec, got ${opsPerSecond.toFixed(0)} ops/sec`
    );

    console.log(`  validateConfig: ${opsPerSecond.toFixed(0)} ops/sec (${duration.toFixed(2)}ms)`);
  });

  it('performs merge efficiently (>10000 ops/sec)', () => {
    const existing: DeployConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'staging.example.com' } },
    };

    const template: DeployConfig = {
      projectName: 'template',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: { staging: { domain: 'example.com' } },
    };

    const iterations = 5000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      mergeConfigs(existing, template);
    }

    const duration = performance.now() - start;
    const opsPerSecond = (iterations / duration) * 1000;

    assert.ok(
      opsPerSecond > 10000,
      `Should merge >10000 ops/sec, got ${opsPerSecond.toFixed(0)} ops/sec`
    );

    console.log(`  mergeConfigs: ${opsPerSecond.toFixed(0)} ops/sec (${duration.toFixed(2)}ms)`);
  });
});
