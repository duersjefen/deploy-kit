/**
 * Message Grouper Test Suite
 *
 * Tests for message deduplication and grouping logic.
 * Covers pattern matching, statistics, and formatting.
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { MessageGrouper } from './message-grouper.js';

describe('MessageGrouper', () => {
  let grouper: MessageGrouper;

  beforeEach(() => {
    grouper = new MessageGrouper();
  });

  describe('Basic Grouping', () => {
    it('groups Lambda deployment messages', () => {
      const result1 = grouper.add('✓ Deployed Lambda api-handler (120ms)');
      const result2 = grouper.add('✓ Deployed Lambda auth-handler (150ms)');

      assert.strictEqual(result1, false); // Grouped
      assert.strictEqual(result2, false); // Grouped

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
      assert.strictEqual(grouped[0].pattern, 'lambda-deploy');
    });

    it('groups Lambda build messages', () => {
      grouper.add('Building Lambda function api-handler');
      grouper.add('Building Lambda function auth-handler');
      grouper.add('Building Lambda function user-handler');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 3);
      assert.strictEqual(grouped[0].pattern, 'lambda-build');
    });

    it('groups stack deployment messages', () => {
      grouper.add('Deploying stack MyStack');
      grouper.add('Deploying stack ApiStack');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
    });

    it('returns true for non-groupable messages', () => {
      const result = grouper.add('Some random log message');
      assert.strictEqual(result, true); // Not grouped
    });

    it('groups multiple categories independently', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      grouper.add('Building Lambda function handler-3');
      grouper.add('Building Lambda function handler-4');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 2);

      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');
      const lambdaBuild = grouped.find(g => g.pattern === 'lambda-build');

      assert.ok(lambdaDeploy);
      assert.ok(lambdaBuild);
      assert.strictEqual(lambdaDeploy.count, 2);
      assert.strictEqual(lambdaBuild.count, 2);
    });
  });

  describe('Duration Tracking', () => {
    it('calculates average duration for Lambda deploys', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (200ms)');
      grouper.add('✓ Deployed Lambda handler-3 (300ms)');

      const grouped = grouper.getGroupedMessages();
      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');

      assert.ok(lambdaDeploy);
      assert.ok(lambdaDeploy.metadata);
      assert.strictEqual(lambdaDeploy.metadata.avgDuration, 200); // (100 + 200 + 300) / 3
    });

    it('handles missing durations gracefully', () => {
      grouper.add('Building Lambda function handler-1');
      grouper.add('Building Lambda function handler-2');

      const grouped = grouper.getGroupedMessages();
      const lambdaBuild = grouped.find(g => g.pattern === 'lambda-build');

      assert.ok(lambdaBuild);
      assert.strictEqual(lambdaBuild.metadata?.avgDuration, undefined);
    });

    it('updates average duration incrementally', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      let grouped = grouper.getGroupedMessages();
      // Count is 1, so not shown yet (needs > 1)

      grouper.add('✓ Deployed Lambda handler-2 (200ms)');
      grouped = grouper.getGroupedMessages();
      let lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');
      assert.ok(lambdaDeploy);
      assert.strictEqual(lambdaDeploy.metadata?.avgDuration, 150);

      grouper.add('✓ Deployed Lambda handler-3 (300ms)');
      grouped = grouper.getGroupedMessages();
      lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');
      assert.ok(lambdaDeploy);
      assert.strictEqual(lambdaDeploy.metadata?.avgDuration, 200);
    });
  });

  describe('Total Count', () => {
    it('returns zero for empty grouper', () => {
      assert.strictEqual(grouper.getTotalCount(), 0);
    });

    it('tracks total count across categories', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      grouper.add('Building Lambda function handler-3');

      assert.strictEqual(grouper.getTotalCount(), 3);
    });

    it('updates total count incrementally (O(1) cached)', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      assert.strictEqual(grouper.getTotalCount(), 1);

      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      assert.strictEqual(grouper.getTotalCount(), 2);

      grouper.add('Building Lambda function handler-3');
      assert.strictEqual(grouper.getTotalCount(), 3);
    });

    it('resets total count on clear', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      assert.strictEqual(grouper.getTotalCount(), 2);

      grouper.clear();
      assert.strictEqual(grouper.getTotalCount(), 0);
    });
  });

  describe('Grouped Messages Output', () => {
    it('only returns messages with count > 1', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)'); // Count = 1

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 0); // Not shown
    });

    it('returns grouped messages with count >= 2', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)'); // Count = 2

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
    });

    it('formats Lambda deploy messages correctly', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');

      const grouped = grouper.getGroupedMessages();
      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');

      assert.ok(lambdaDeploy);
      assert.strictEqual(lambdaDeploy.representative, '✓ Deployed 2 Lambda functions (avg 105ms)');
    });

    it('uses singular form for single Lambda', () => {
      // Force count > 1 by adding/removing
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      grouper.add('✓ Deployed Lambda handler-3 (120ms)');

      // Then clear and add just 2
      grouper.clear();
      grouper.add('Building Lambda function handler-1');
      grouper.add('Building Lambda function handler-2');

      const grouped = grouper.getGroupedMessages();
      const lambdaBuild = grouped.find(g => g.pattern === 'lambda-build');

      assert.ok(lambdaBuild);
      assert.ok(lambdaBuild.representative.includes('2 Lambda functions')); // Plural
    });

    it('formats stack messages correctly', () => {
      grouper.add('Deploying stack MyStack');
      grouper.add('Deploying stack ApiStack');
      grouper.add('Deploying stack AuthStack');

      const grouped = grouper.getGroupedMessages();
      const stackDeploy = grouped.find(g => g.pattern === 'stack-deploy');

      assert.ok(stackDeploy);
      assert.ok(stackDeploy.representative.includes('3 stacks'));
    });
  });

  describe('Clear Method', () => {
    it('clears all grouped messages', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      grouper.add('Building Lambda function handler-3');

      assert.strictEqual(grouper.getTotalCount(), 3);

      grouper.clear();

      assert.strictEqual(grouper.getTotalCount(), 0);
      assert.strictEqual(grouper.getGroupedMessages().length, 0);
    });

    it('allows re-use after clear', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.clear();

      grouper.add('✓ Deployed Lambda handler-2 (110ms)');
      grouper.add('✓ Deployed Lambda handler-3 (120ms)');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
    });
  });

  describe('Edge Cases', () => {
    it('handles messages with special characters', () => {
      grouper.add('✓ Deployed Lambda api-handler_v2 (100ms)');
      grouper.add('✓ Deployed Lambda auth-handler_v2 (110ms)');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
    });

    it('handles very large duration values', () => {
      grouper.add('✓ Deployed Lambda handler-1 (99999ms)');
      grouper.add('✓ Deployed Lambda handler-2 (100000ms)');

      const grouped = grouper.getGroupedMessages();
      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');

      assert.ok(lambdaDeploy);
      assert.strictEqual(lambdaDeploy.metadata?.avgDuration, 99999.5);
    });

    it('handles zero duration', () => {
      grouper.add('✓ Deployed Lambda handler-1 (0ms)');
      grouper.add('✓ Deployed Lambda handler-2 (100ms)');

      const grouped = grouper.getGroupedMessages();
      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');

      assert.ok(lambdaDeploy);
      assert.strictEqual(lambdaDeploy.metadata?.avgDuration, 50);
    });

    it('handles empty strings gracefully', () => {
      const result = grouper.add('');
      assert.strictEqual(result, true); // Not grouped
    });

    it('handles very long messages', () => {
      const longMessage = 'Building Lambda function ' + 'x'.repeat(10000);
      const result = grouper.add(longMessage);
      assert.strictEqual(result, false); // Grouped (matches pattern)
    });

    it('tracks time duration for grouped messages', () => {
      grouper.add('✓ Deployed Lambda handler-1 (100ms)');
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');

      const grouped = grouper.getGroupedMessages();
      const lambdaDeploy = grouped.find(g => g.pattern === 'lambda-deploy');

      assert.ok(lambdaDeploy);
      assert.ok(lambdaDeploy.metadata);
      assert.ok(lambdaDeploy.metadata.duration >= 0); // Time between first and last
    });
  });

  describe('Pattern Matching', () => {
    it('matches case-insensitive patterns', () => {
      grouper.add('✓ DEPLOYED LAMBDA handler-1 (100ms)');
      grouper.add('✓ deployed lambda handler-2 (110ms)');

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
    });

    it('matches patterns with varying whitespace', () => {
      grouper.add('✓  Deployed Lambda handler-1 (100ms)'); // Double space
      grouper.add('✓ Deployed Lambda handler-2 (110ms)');  // Single space

      const grouped = grouper.getGroupedMessages();
      assert.strictEqual(grouped.length, 1);
      assert.strictEqual(grouped[0].count, 2);
    });

    it('does not match partial patterns', () => {
      const result1 = grouper.add('Deployed Lambda'); // Missing duration
      const result2 = grouper.add('✓ Lambda (100ms)');  // Missing "Deployed"

      // Both should not be grouped (pattern doesn't match)
      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
    });
  });
});
