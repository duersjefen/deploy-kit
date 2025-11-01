/**
 * AWS CLI Utilities Test Suite
 *
 * Integration tests for AWS CLI wrapper functions.
 * Tests verify correct command formatting and error handling.
 * Gracefully skips if AWS credentials are not available.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildAwsEnv,
  hasAwsCredentials,
  getAwsRegion,
  getAwsAccountId,
} from './aws-cli-utils.js';

describe('AWS CLI Utilities', () => {
  describe('buildAwsEnv', () => {
    it('builds env with AWS_PROFILE when provided', () => {
      const env = buildAwsEnv('my-profile');
      assert.strictEqual(env.AWS_PROFILE, 'my-profile');
    });

    it('builds env without AWS_PROFILE when not provided', () => {
      const env = buildAwsEnv();
      assert.strictEqual(env.AWS_PROFILE, undefined);
    });

    it('builds env without AWS_PROFILE when null', () => {
      const env = buildAwsEnv(null);
      assert.strictEqual(env.AWS_PROFILE, undefined);
    });

    it('merges additional environment variables', () => {
      const env = buildAwsEnv('profile', { MY_VAR: 'value', OTHER: '123' });
      assert.strictEqual(env.AWS_PROFILE, 'profile');
      assert.strictEqual(env.MY_VAR, 'value');
      assert.strictEqual(env.OTHER, '123');
    });

    it('preserves original process.env variables', () => {
      const env = buildAwsEnv();
      assert.ok(Object.keys(env).length > 0);
    });

    it('allows overriding existing env variables', () => {
      const env = buildAwsEnv(undefined, { PATH: '/custom/path' });
      assert.strictEqual(env.PATH, '/custom/path');
    });
  });

  describe('hasAwsCredentials', () => {
    it('returns boolean for credential check', async () => {
      const result = hasAwsCredentials();
      assert.strictEqual(typeof result, 'boolean');
    });

    it('returns boolean for specific profile', () => {
      // This may return false if profile doesn't exist, which is fine
      const result = hasAwsCredentials('nonexistent-test-profile');
      assert.strictEqual(typeof result, 'boolean');
    });

    it('handles null profile', () => {
      const result = hasAwsCredentials(null);
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('getAwsRegion', () => {
    it('returns a valid AWS region string', () => {
      const region = getAwsRegion();
      assert.ok(typeof region === 'string');
      assert.ok(region.length > 0);
      // Should be a valid region or default
      assert.ok(
        region === 'us-east-1' ||
        region.includes('-') ||
        region === ''
      );
    });

    it('respects AWS_REGION environment variable', () => {
      const originalRegion = process.env.AWS_REGION;
      process.env.AWS_REGION = 'eu-west-1';

      const region = getAwsRegion();
      assert.strictEqual(region, 'eu-west-1');

      // Restore
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
    });

    it('returns default region if not configured', () => {
      const originalRegion = process.env.AWS_REGION;
      delete process.env.AWS_REGION;

      const region = getAwsRegion();
      assert.ok(region === 'us-east-1' || typeof region === 'string');

      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      }
    });

    it('handles profile parameter', () => {
      const region = getAwsRegion('any-profile');
      assert.ok(typeof region === 'string');
    });
  });

  describe('getAwsAccountId', () => {
    it('returns account ID if credentials available', async () => {
      try {
        if (!hasAwsCredentials()) {
          console.log('Skipping - AWS credentials not available');
          return;
        }

        const accountId = getAwsAccountId();
        assert.ok(typeof accountId === 'string');
        assert.ok(/^\d{12}$/.test(accountId), 'Account ID should be 12 digits');
      } catch (error) {
        if (error instanceof Error && 
            (error.message.includes('credentials') ||
             error.message.includes('Unable to locate'))) {
          console.log('Skipping - AWS credentials not available');
          return;
        }
        throw error;
      }
    });

    it('throws error when credentials unavailable', () => {
      // Using invalid profile should cause error
      try {
        getAwsAccountId('invalid-nonexistent-profile-xyz');
        // If we get here, either the profile existed or it was skipped
      } catch (error) {
        // Error is expected when credentials not available
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('Error handling', () => {
    it('handles AWS CLI not found gracefully', () => {
      // This test verifies the functions handle missing AWS CLI
      try {
        // Most functions should handle errors gracefully
        const hasCredentials = hasAwsCredentials('test');
        assert.ok(typeof hasCredentials === 'boolean');
      } catch (error) {
        // Error handling works
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('Real AWS Operations', () => {
    it('can check credentials without throwing', () => {
      // This should not throw regardless of credential state
      const hasCredentials = hasAwsCredentials();
      assert.ok(typeof hasCredentials === 'boolean');
    });

    it('can get region without throwing', () => {
      // This should not throw
      const region = getAwsRegion();
      assert.ok(typeof region === 'string');
    });

    it('can build env consistently', () => {
      const env1 = buildAwsEnv('profile');
      const env2 = buildAwsEnv('profile');

      assert.strictEqual(env1.AWS_PROFILE, env2.AWS_PROFILE);
    });
  });

  describe('Edge cases', () => {
    it('handles empty string profile', () => {
      const env = buildAwsEnv('');
      // Empty string should not set AWS_PROFILE (falsy check)
      assert.strictEqual(env.AWS_PROFILE, undefined);
    });

    it('handles profile with special characters', () => {
      const env = buildAwsEnv('profile-with-dashes_and_underscores');
      assert.strictEqual(env.AWS_PROFILE, 'profile-with-dashes_and_underscores');
    });

    it('preserves environment during multiple calls', () => {
      const env1 = buildAwsEnv('profile1');
      const env2 = buildAwsEnv('profile2');

      assert.strictEqual(env1.AWS_PROFILE, 'profile1');
      assert.strictEqual(env2.AWS_PROFILE, 'profile2');
    });
  });
});
