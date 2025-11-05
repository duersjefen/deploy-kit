/**
 * SST Config Validator Tests
 *
 * Tests for DEP-27 SST config validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'path';
import { SSTConfigValidator } from './sst-config-validator.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'sst-configs');

describe('SSTConfigValidator', () => {
  describe('S3 Bucket CORS validation', () => {
    it('should detect CORS configured as array instead of object', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-cors-array.ts'));

      const corsArrayIssue = issues.find(
        i => i.property === 'cors' && i.message.includes('array')
      );

      assert.ok(corsArrayIssue, 'Should detect CORS array issue');
      assert.strictEqual(corsArrayIssue.severity, 'error');
      assert.strictEqual(corsArrayIssue.resource, 'Bucket("MawaveBucket")');
    });

    it('should detect wrong CORS property names', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-cors-properties.ts'));

      // Should detect allowedHeaders (should be allowHeaders)
      const headersIssue = issues.find(i => i.property === 'cors.allowedHeaders');
      assert.ok(headersIssue, 'Should detect allowedHeaders issue');
      assert.strictEqual(headersIssue.severity, 'error');

      // Should detect allowedMethods (should be allowMethods)
      const methodsIssue = issues.find(i => i.property === 'cors.allowedMethods');
      assert.ok(methodsIssue, 'Should detect allowedMethods issue');

      // Should detect allowedOrigins (should be allowOrigins)
      const originsIssue = issues.find(i => i.property === 'cors.allowedOrigins');
      assert.ok(originsIssue, 'Should detect allowedOrigins issue');
    });

    it('should detect maxAge as number instead of string', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-cors-properties.ts'));

      const maxAgeIssue = issues.find(i => i.property === 'cors.maxAge');
      assert.ok(maxAgeIssue, 'Should detect maxAge format issue');
      assert.strictEqual(maxAgeIssue.severity, 'error');
      assert.ok(maxAgeIssue.message.includes('string with units'));
    });
  });

  describe('Lambda Function validation', () => {
    it('should detect timeout as number instead of string', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-function-timeout.ts'));

      const timeoutIssue = issues.find(i => i.property === 'timeout');
      assert.ok(timeoutIssue, 'Should detect timeout format issue');
      assert.strictEqual(timeoutIssue.severity, 'error');
      assert.ok(timeoutIssue.message.includes('string with units'));
    });

    it('should detect memory as number instead of string', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-function-timeout.ts'));

      const memoryIssue = issues.find(i => i.property === 'memory');
      assert.ok(memoryIssue, 'Should detect memory format issue');
      assert.strictEqual(memoryIssue.severity, 'error');
      assert.ok(memoryIssue.message.includes('string with units'));
    });
  });

  describe('DynamoDB TTL validation', () => {
    it('should detect TTL configured as object instead of string', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'invalid-dynamo-ttl.ts'));

      const ttlIssue = issues.find(i => i.property === 'ttl');
      assert.ok(ttlIssue, 'Should detect TTL format issue');
      assert.strictEqual(ttlIssue.severity, 'error');
      assert.ok(ttlIssue.message.includes('string field name'));
    });
  });

  describe('Valid configuration', () => {
    it('should pass validation for correct configuration', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate(join(fixturesDir, 'valid-complete.ts'));

      // Should have no errors
      const errors = issues.filter(i => i.severity === 'error');
      assert.strictEqual(errors.length, 0, 'Should have no errors for valid config');
    });
  });

  describe('Edge cases', () => {
    it('should handle missing file gracefully', () => {
      const validator = new SSTConfigValidator();
      const issues = validator.validate('nonexistent.ts');

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].severity, 'error');
      assert.ok(issues[0].message.includes('not found'));
    });
  });
});
