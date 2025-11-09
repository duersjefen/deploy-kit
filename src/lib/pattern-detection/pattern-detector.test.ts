/**
 * Pattern Detector Tests (DEP-30)
 *
 * Comprehensive test suite for SST pattern detection system
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SSTPatternDetector } from './pattern-detector.js';
import { ALL_RULES } from './rules/index.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create temp directory for test fixtures
const TEST_DIR = join(tmpdir(), 'sst-pattern-detector-tests');

function setupTestFixture(filename: string, content: string): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function cleanupTestFixtures() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('SSTPatternDetector', () => {
  describe('Stage Variable Patterns', () => {
    it('should detect input.stage usage (SST-VAL-001)', () => {
      const config = `
export default $config({
  app() {
    return { name: "test" };
  },
  async run() {
    const stage = input?.stage || "dev";
    return {};
  }
});
`;
      const configPath = setupTestFixture('test-input-stage.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      assert.ok(result.violations.length > 0, 'Should detect input.stage usage');
      const violation = result.violations.find(v => v.code === 'SST-VAL-001');
      assert.ok(violation, 'Should have SST-VAL-001 violation');
      assert.strictEqual(violation?.severity, 'error');
      assert.ok(violation?.fix, 'Should have auto-fix');
      assert.strictEqual(violation?.fix?.confidence, 'high');

      cleanupTestFixtures();
    });

    it('should detect run() with parameters (SST-VAL-002)', () => {
      const config = `
export default $config({
  app() {
    return { name: "test" };
  },
  async run(input: any) {
    return {};
  }
});
`;
      const configPath = setupTestFixture('test-run-params.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-002');
      assert.ok(violation, 'Should detect run() with parameters');
      assert.strictEqual(violation?.severity, 'error');
      assert.ok(violation?.fix, 'Should have auto-fix');

      cleanupTestFixtures();
    });

    it('should detect hardcoded stage values (SST-VAL-003)', () => {
      const config = `
export default $config({
  app() {
    return { name: "test" };
  },
  async run() {
    const stage = "dev";
    return {};
  }
});
`;
      const configPath = setupTestFixture('test-hardcoded-stage.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-003');
      assert.ok(violation, 'Should detect hardcoded stage');
      assert.strictEqual(violation?.severity, 'error');

      cleanupTestFixtures();
    });

    it('should NOT flag correct $app.stage usage', () => {
      const config = `
export default $config({
  app() {
    return { name: "test" };
  },
  async run() {
    const stage = $app.stage;
    return {};
  }
});
`;
      const configPath = setupTestFixture('test-correct-stage.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const stageViolations = result.violations.filter(v =>
        v.code === 'SST-VAL-001' || v.code === 'SST-VAL-002' || v.code === 'SST-VAL-003'
      );
      assert.strictEqual(stageViolations.length, 0, 'Should not flag correct usage');

      cleanupTestFixtures();
    });
  });

  describe('Domain Configuration Patterns', () => {
    it('should detect stage !== "dev" pattern (SST-VAL-011)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    const stage = $app.stage;
    new sst.aws.Nextjs("Site", {
      domain: stage !== "dev" ? { name: "example.com" } : undefined
    });
  }
});
`;
      const configPath = setupTestFixture('test-domain-inequality.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-011');
      assert.ok(violation, 'Should detect stage !== "dev" pattern');
      assert.strictEqual(violation?.severity, 'error');

      cleanupTestFixtures();
    });

    it('should error about missing dns property (SST-VAL-012) - Issue #220', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Nextjs("Site", {
      domain: {
        name: "example.com"
      }
    });
  }
});
`;
      const configPath = setupTestFixture('test-missing-dns.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-012');
      assert.ok(violation, 'Should error about missing dns');
      // CHANGED: severity is now 'error' instead of 'warning' (Issue #220)
      // Missing dns property WILL cause deployment failure with CloudFront CNAME conflicts
      assert.strictEqual(violation?.severity, 'error');

      cleanupTestFixtures();
    });
  });

  describe('CORS Configuration Patterns', () => {
    it('should detect CORS property typos (SST-VAL-021, 022, 023)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Bucket("MyBucket", {
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: ["GET", "POST"],
        allowedHeaders: ["*"]
      }
    });
  }
});
`;
      const configPath = setupTestFixture('test-cors-typos.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const corsViolations = result.violations.filter(v =>
        v.code === 'SST-VAL-021' || v.code === 'SST-VAL-022' || v.code === 'SST-VAL-023'
      );
      assert.strictEqual(corsViolations.length, 3, 'Should detect all 3 CORS typos');
      assert.ok(corsViolations.every(v => v.fix), 'All should have auto-fixes');

      cleanupTestFixtures();
    });

    it('should detect CORS as array (SST-VAL-024)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Bucket("MyBucket", {
      cors: [{ allowOrigins: ["*"] }]
    });
  }
});
`;
      const configPath = setupTestFixture('test-cors-array.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-024');
      assert.ok(violation, 'Should detect CORS as array');
      assert.strictEqual(violation?.severity, 'error');

      cleanupTestFixtures();
    });
  });

  describe('Environment Variable Patterns', () => {
    it('should detect reserved AWS variables (SST-VAL-041)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Function("MyFn", {
      handler: "index.handler",
      environment: {
        AWS_ACCESS_KEY_ID: "test",
        AWS_SECRET_ACCESS_KEY: "test"
      }
    });
  }
});
`;
      const configPath = setupTestFixture('test-reserved-aws.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const awsViolations = result.violations.filter(v => v.code === 'SST-VAL-041');
      assert.ok(awsViolations.length >= 2, 'Should detect both AWS credentials');

      cleanupTestFixtures();
    });

    it('should detect underscore-prefixed variables (SST-VAL-042)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Function("MyFn", {
      handler: "index.handler",
      environment: {
        _HANDLER: "test"
      }
    });
  }
});
`;
      const configPath = setupTestFixture('test-underscore-var.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-042');
      assert.ok(violation, 'Should detect underscore-prefixed variable');

      cleanupTestFixtures();
    });

    it('should detect LAMBDA_ prefixed variables (SST-VAL-043)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Function("MyFn", {
      handler: "index.handler",
      environment: {
        LAMBDA_TASK_ROOT: "/test"
      }
    });
  }
});
`;
      const configPath = setupTestFixture('test-lambda-prefix.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-043');
      assert.ok(violation, 'Should detect LAMBDA_ prefixed variable');

      cleanupTestFixtures();
    });
  });

  describe('Pulumi Output Patterns', () => {
    it('should detect unnecessary $interpolate (SST-VAL-031)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    const bucket = new sst.aws.Bucket("Bucket");
    new sst.aws.Function("Fn", {
      handler: "index.handler",
      link: [$interpolate\`\${bucket.arn}\`]
    });
  }
});
`;
      const configPath = setupTestFixture('test-unnecessary-interpolate.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-031');
      assert.ok(violation, 'Should detect unnecessary $interpolate');
      assert.strictEqual(violation?.severity, 'warning');

      cleanupTestFixtures();
    });
  });

  describe('Resource Dependency Patterns', () => {
    it('should detect circular dependencies (SST-VAL-051)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    const fnA = new sst.aws.Function("A", {
      handler: "a.handler",
      link: [fnB]
    });
    const fnB = new sst.aws.Function("B", {
      handler: "b.handler",
      link: [fnA]
    });
  }
});
`;
      const configPath = setupTestFixture('test-circular-dep.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-051');
      assert.ok(violation, 'Should detect circular dependency');

      cleanupTestFixtures();
    });

    it('should detect usage before declaration (SST-VAL-052)', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    const api = new sst.aws.Function("Api", {
      handler: "api.handler",
      link: [myFunction]
    });
    const myFunction = new sst.aws.Function("MyFn", {
      handler: "fn.handler"
    });
  }
});
`;
      const configPath = setupTestFixture('test-usage-before-decl.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      const violation = result.violations.find(v => v.code === 'SST-VAL-052');
      assert.ok(violation, 'Should detect usage before declaration');

      cleanupTestFixtures();
    });
  });

  describe('Performance', () => {
    it('should complete detection in < 1 second for typical config', () => {
      const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    const stage = $app.stage;
    const bucket = new sst.aws.Bucket("Bucket", {
      cors: { allowOrigins: ["*"] }
    });
    new sst.aws.Function("Fn", {
      handler: "index.handler",
      link: [bucket]
    });
  }
});
`;
      const configPath = setupTestFixture('test-performance.ts', config);
      const detector = new SSTPatternDetector();
      detector.registerRules(ALL_RULES);

      const result = detector.detect(configPath, TEST_DIR);

      assert.ok(result.duration < 1000, `Detection should be < 1s, was ${result.duration}ms`);

      cleanupTestFixtures();
    });
  });
});
