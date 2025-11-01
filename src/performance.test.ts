/**
 * Performance Benchmarking Test Suite
 *
 * Tests performance characteristics of critical operations.
 * Run with: npm test -- --grep "Performance"
 *
 * Note: Performance requirements are informational. Tests pass regardless of speed.
 * These benchmarks help identify performance regressions and optimization opportunities.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  benchmark,
  benchmarkSync,
  compareBenchmarks,
  createMockProjectConfig,
} from './test-utils.js';
import {
  validateConfig,
  mergeConfigs,
} from './cli/utils/config-validator.js';
import { extractRootDomain, validateDomain } from './lib/domain-utils.js';
import { isReservedLambdaVar, findReservedVarsInSstConfig } from './lib/lambda-reserved-vars.js';

describe('Performance Benchmarks', () => {
  describe('Configuration Validation Performance', () => {
    it('validates config in reasonable time', async () => {
      const config = createMockProjectConfig();
      const unvalidatedConfig = { ...config } as any;

      const result = await benchmark(
        'validateConfig',
        async () => {
          validateConfig(unvalidatedConfig);
        },
        { iterations: 1000, warmup: 50, verbose: false }
      );

      assert.ok(result.opsPerSecond > 1000, `Config validation should exceed 1000 ops/sec (got ${result.opsPerSecond.toFixed(0)})`);

      console.log(
        `  validateConfig: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });

    it('merges configs efficiently', () => {
      const existing = createMockProjectConfig();
      const template = createMockProjectConfig({ projectName: 'template-project' });

      const result = benchmarkSync(
        'mergeConfigs',
        () => {
          mergeConfigs(existing as any, template as any);
        },
        { iterations: 5000, warmup: 100 }
      );

      assert.ok(result.opsPerSecond > 10000, `Merge should exceed 10000 ops/sec (got ${result.opsPerSecond.toFixed(0)})`);

      console.log(
        `  mergeConfigs: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });
  });

  describe('Domain Validation Performance', () => {
    it('validates domains efficiently', () => {
      const domains = [
        'example.com',
        'api.staging.example.com',
        'subdomain.example.co.uk',
        'api-gateway-123.example.com',
      ];

      const result = benchmarkSync(
        'domain validation',
        () => {
          for (const domain of domains) {
            validateDomain(domain);
          }
        },
        { iterations: 10000, warmup: 100 }
      );

      assert.ok(
        result.opsPerSecond > 10000,
        `Domain validation should exceed 10000 ops/sec (got ${result.opsPerSecond.toFixed(0)})`
      );

      console.log(
        `  domain validation: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });

    it('extracts root domain efficiently', () => {
      const testCases = [
        'example.com',
        'api.example.com',
        'staging.api.example.com',
        'api-v2.staging.example.co.uk',
      ];

      const result = benchmarkSync(
        'extractRootDomain',
        () => {
          for (const domain of testCases) {
            extractRootDomain(domain);
          }
        },
        { iterations: 10000, warmup: 100 }
      );

      assert.ok(
        result.opsPerSecond > 10000,
        `Should extract root domain >10000 ops/sec (got ${result.opsPerSecond.toFixed(0)})`
      );

      console.log(
        `  extractRootDomain: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });
  });

  describe('Lambda Reserved Variable Detection Performance', () => {
    it('checks reserved variables efficiently', () => {
      const variables = [
        'AWS_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_LAMBDA_FUNCTION_NAME',
        'MY_CUSTOM_VAR',
        'DATABASE_URL',
      ];

      const result = benchmarkSync(
        'isReservedLambdaVar',
        () => {
          for (const varName of variables) {
            isReservedLambdaVar(varName);
          }
        },
        { iterations: 100000, warmup: 1000 }
      );

      assert.ok(
        result.opsPerSecond > 100000,
        `Should check >100000 vars/sec (got ${result.opsPerSecond.toFixed(0)})`
      );

      console.log(
        `  isReservedLambdaVar: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });

    it('finds reserved vars in SST config efficiently', () => {
      const configContent = `
export default {
  stacks(app) {
    app.stack(function Stack1({ stack }) {
      new Function(stack, "Function1", {
        handler: "index.handler",
        environment: {
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: "key",
          MY_VAR: "value",
        },
      });
    });
    app.stack(function Stack2({ stack }) {
      new Function(stack, "Function2", {
        handler: "index.handler",
        environment: {
          DATABASE_URL: "postgres://...",
          API_KEY: "secret",
        },
      });
    });
  },
};`;

      const result = benchmarkSync(
        'findReservedVarsInSstConfig',
        () => {
          findReservedVarsInSstConfig(configContent);
        },
        { iterations: 1000, warmup: 50 }
      );

      assert.ok(
        result.opsPerSecond > 500,
        `Should find vars >500 ops/sec (got ${result.opsPerSecond.toFixed(0)})`
      );

      console.log(
        `  findReservedVarsInSstConfig: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });
  });

  describe('Comparative Performance Analysis', () => {
    it('compares domain validation methods', async () => {
      const domain = 'api.staging.example.com';
      const iterations = 50000;

      const isValidDomainResult = benchmarkSync(
        'validateDomain (regex)',
        () => {
          validateDomain(domain);
        },
        { iterations, warmup: 500 }
      );

      const extractRootDomainResult = benchmarkSync(
        'extractRootDomain',
        () => {
          extractRootDomain(domain);
        },
        { iterations, warmup: 500 }
      );

      const results = [isValidDomainResult, extractRootDomainResult];
      const report = compareBenchmarks(results);

      console.log(report);

      // Both should be reasonably fast
      assert.ok(isValidDomainResult.opsPerSecond > 100);
      assert.ok(extractRootDomainResult.opsPerSecond > 1000);
    });

    it('compares reserved variable checking methods', async () => {
      const iterations = 50000;

      const reservedVarCheckResult = benchmarkSync(
        'Direct isReservedLambdaVar check',
        () => {
          for (let i = 0; i < 10; i++) {
            isReservedLambdaVar('AWS_REGION');
          }
        },
        { iterations, warmup: 500 }
      );

      const configParsingResult = benchmarkSync(
        'Parse config for reserved vars',
        () => {
          const config = `environment: { AWS_REGION: "us-east-1", MY_VAR: "value" }`;
          findReservedVarsInSstConfig(config);
        },
        { iterations, warmup: 500 }
      );

      const results = [reservedVarCheckResult, configParsingResult];
      const report = compareBenchmarks(results);

      console.log(report);

      // Direct check should be faster than parsing
      assert.ok(
        reservedVarCheckResult.opsPerSecond > configParsingResult.opsPerSecond * 0.5
      );
    });
  });

  describe('Scaling Performance', () => {
    it('handles large config objects', () => {
      // Create a large config with many stages and health checks
      const largeConfig = createMockProjectConfig({
        healthChecks: Array.from({ length: 100 }, (_, i) => ({
          url: `https://example.com/health-${i}`,
          expectedStatus: 200,
          timeout: 5000,
        })),
      });

      const unvalidatedConfig = { ...largeConfig } as any;

      const result = benchmarkSync(
        'validate large config (100 health checks)',
        () => {
          validateConfig(unvalidatedConfig);
        },
        { iterations: 100, warmup: 10 }
      );

      assert.ok(
        result.opsPerSecond > 10,
        `Should validate large config >10 ops/sec (got ${result.opsPerSecond.toFixed(1)})`
      );

      console.log(
        `  Large config validation: ${result.opsPerSecond.toFixed(1)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });

    it('parses large SST config for reserved vars', () => {
      // Generate a large config with many functions and environment variables
      let configContent = 'export default { stacks(app) {';
      for (let i = 0; i < 50; i++) {
        configContent += `
          app.stack(function Stack${i}({ stack }) {
            new Function(stack, "Function${i}", {
              handler: "index.handler",
              environment: {
                VAR_${i}_1: "value",
                VAR_${i}_2: "value",
                AWS_REGION: "us-east-1",
              },
            });
          });`;
      }
      configContent += ' } };';

      const result = benchmarkSync(
        'parse large config (50 stacks)',
        () => {
          findReservedVarsInSstConfig(configContent);
        },
        { iterations: 100, warmup: 10 }
      );

      assert.ok(
        result.opsPerSecond > 1,
        `Should parse large config >1 ops/sec (got ${result.opsPerSecond.toFixed(2)})`
      );

      console.log(
        `  Large SST config parsing: ${result.opsPerSecond.toFixed(2)} ops/sec (${result.duration.toFixed(2)}ms for ${result.operations} ops)`
      );
    });
  });

  describe('Memory Performance', () => {
    it('config validation memory usage', async () => {
      const config = createMockProjectConfig();
      const unvalidatedConfig = { ...config } as any;

      // Only measure memory if global.gc is available
      if (typeof global.gc !== 'function') {
        console.log('  ⚠️  Skipping memory test (requires --expose-gc flag)');
        return;
      }

      const result = await benchmark(
        'validateConfig (with memory tracking)',
        async () => {
          validateConfig(unvalidatedConfig);
        },
        { iterations: 100, warmup: 10, trackMemory: true }
      );

      if (result.memoryUsed !== undefined) {
        const memoryPerOp = result.memoryUsed / result.operations;
        console.log(
          `  Memory per operation: ${memoryPerOp.toFixed(2)} bytes (total: ${(result.memoryUsed / 1024).toFixed(2)}KB)`
        );

        // Memory usage should be reasonable (less than 10KB per 100 operations)
        assert.ok(memoryPerOp < 100, `Memory per op should be <100 bytes (got ${memoryPerOp.toFixed(2)})`);
      }
    });
  });
});

describe('Performance Thresholds', () => {
  it('critical operations meet minimum performance requirements', async () => {
    const results = [];

    // Config validation
    const configResult = await benchmark(
      'Config Validation',
      async () => {
        const config = createMockProjectConfig();
        validateConfig(config as any);
      },
      { iterations: 500, warmup: 50 }
    );
    results.push(configResult);

    // Domain validation
    const domainResult = benchmarkSync(
      'Domain Validation',
      () => {
        validateDomain('example.com');
      },
      { iterations: 5000, warmup: 100 }
    );
    results.push(domainResult);

    // Reserved variable check
    const reservedVarResult = benchmarkSync(
      'Reserved Var Check',
      () => {
        isReservedLambdaVar('AWS_REGION');
      },
      { iterations: 50000, warmup: 1000 }
    );
    results.push(reservedVarResult);

    // Report all results
    const report = compareBenchmarks(results, 2.0); // Allow 2x variance
    console.log(report);

    // All critical operations should meet minimum thresholds
    assert.ok(configResult.opsPerSecond > 100, 'Config validation should exceed 100 ops/sec');
    assert.ok(domainResult.opsPerSecond > 1000, 'Domain validation should exceed 1000 ops/sec');
    assert.ok(reservedVarResult.opsPerSecond > 10000, 'Reserved var check should exceed 10000 ops/sec');
  });
});
