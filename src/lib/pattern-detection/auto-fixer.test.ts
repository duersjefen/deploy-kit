/**
 * Auto-Fixer Tests (DEP-30)
 *
 * Test suite for auto-fix engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AutoFixer } from './auto-fixer.js';
import { SSTPatternDetector } from './pattern-detector.js';
import { ALL_RULES } from './rules/index.js';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'sst-auto-fixer-tests');

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

describe('AutoFixer', () => {
  it('should fix input.stage to $app.stage (high confidence)', async () => {
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
    const configPath = setupTestFixture('fix-input-stage.ts', config);

    // Detect violations
    const detector = new SSTPatternDetector();
    detector.registerRules(ALL_RULES);
    const result = detector.detect(configPath, TEST_DIR);

    // Apply fixes
    const fixer = new AutoFixer();
    const fixResult = await fixer.fix(configPath, result.violations, {
      apply: true,
      minConfidence: 'high',
      interactive: false,
    });

    assert.ok(fixResult.applied, 'Fixes should be applied');
    assert.ok(fixResult.fixCount > 0, 'Should have applied fixes');

    // Verify fix was applied
    const fixedContent = readFileSync(configPath, 'utf-8');
    assert.ok(fixedContent.includes('$app.stage'), 'Should contain $app.stage');
    assert.ok(!fixedContent.includes('input?.stage'), 'Should not contain input?.stage');

    cleanupTestFixtures();
  });

  it('should fix CORS property typos (high confidence)', async () => {
    const config = `
export default $config({
  app() { return { name: "test" }; },
  async run() {
    new sst.aws.Bucket("MyBucket", {
      cors: {
        allowedOrigins: ["*"]
      }
    });
  }
});
`;
    const configPath = setupTestFixture('fix-cors-typo.ts', config);

    const detector = new SSTPatternDetector();
    detector.registerRules(ALL_RULES);
    const result = detector.detect(configPath, TEST_DIR);

    const fixer = new AutoFixer();
    const fixResult = await fixer.fix(configPath, result.violations, {
      apply: true,
      minConfidence: 'high',
      interactive: false,
    });

    assert.ok(fixResult.applied, 'Fixes should be applied');

    const fixedContent = readFileSync(configPath, 'utf-8');
    assert.ok(fixedContent.includes('allowOrigins'), 'Should contain allowOrigins');
    assert.ok(!fixedContent.includes('allowedOrigins'), 'Should not contain allowedOrigins');

    cleanupTestFixtures();
  });

  it('should skip medium confidence fixes when minConfidence is high', async () => {
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
    const configPath = setupTestFixture('skip-medium-confidence.ts', config);

    const detector = new SSTPatternDetector();
    detector.registerRules(ALL_RULES);
    const result = detector.detect(configPath, TEST_DIR);

    const fixer = new AutoFixer();
    const fixResult = await fixer.fix(configPath, result.violations, {
      apply: true,
      minConfidence: 'high',
      interactive: false,
    });

    // SST-VAL-011 (domain config) has medium confidence
    const mediumConfidenceSkipped = fixResult.skippedFixes.some(
      f => f.code === 'SST-VAL-011'
    );
    assert.ok(mediumConfidenceSkipped, 'Should skip medium confidence fixes');

    cleanupTestFixtures();
  });

  it('should preview fixes without applying (dry-run mode)', async () => {
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
    const configPath = setupTestFixture('preview-fixes.ts', config);
    const originalContent = readFileSync(configPath, 'utf-8');

    const detector = new SSTPatternDetector();
    detector.registerRules(ALL_RULES);
    const result = detector.detect(configPath, TEST_DIR);

    const fixer = new AutoFixer();
    const fixResult = await fixer.fix(configPath, result.violations, {
      apply: false, // Dry-run mode
      minConfidence: 'high',
      interactive: false,
    });

    assert.ok(!fixResult.applied, 'Fixes should not be applied in dry-run');
    assert.ok(fixResult.fixedCode, 'Should have fixed code preview');

    // Verify original file is unchanged
    const currentContent = readFileSync(configPath, 'utf-8');
    assert.strictEqual(currentContent, originalContent, 'File should be unchanged');

    cleanupTestFixtures();
  });

  it('should handle multiple fixes in correct order', async () => {
    const config = `
export default $config({
  app() { return { name: "test" }; },
  async run(input: any) {
    const stage = input?.stage || "dev";
    new sst.aws.Bucket("MyBucket", {
      cors: {
        allowedOrigins: ["*"],
        allowedHeaders: ["*"]
      }
    });
  }
});
`;
    const configPath = setupTestFixture('multiple-fixes.ts', config);

    const detector = new SSTPatternDetector();
    detector.registerRules(ALL_RULES);
    const result = detector.detect(configPath, TEST_DIR);

    const fixer = new AutoFixer();
    const fixResult = await fixer.fix(configPath, result.violations, {
      apply: true,
      minConfidence: 'high',
      interactive: false,
    });

    assert.ok(fixResult.fixCount >= 3, 'Should fix multiple issues');

    const fixedContent = readFileSync(configPath, 'utf-8');
    assert.ok(fixedContent.includes('$app.stage'), 'Should fix input.stage');
    assert.ok(fixedContent.includes('allowOrigins'), 'Should fix allowedOrigins');
    assert.ok(fixedContent.includes('allowHeaders'), 'Should fix allowedHeaders');

    cleanupTestFixtures();
  });

  it('should generate readable diff preview', () => {
    const fixer = new AutoFixer();
    const original = 'const stage = input?.stage || "dev";';
    const fixed = 'const stage = $app.stage;';

    const diff = fixer.generateDiff(original, fixed);

    assert.ok(diff.includes('-'), 'Diff should show removed lines');
    assert.ok(diff.includes('+'), 'Diff should show added lines');

    cleanupTestFixtures();
  });
});
