/**
 * Summary Builder Test Suite
 *
 * Tests for deployment summary table generation.
 * Covers table formatting, compact summaries, and edge cases.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { SummaryBuilder } from './summary-builder.js';
import type { DeploymentSummary, GroupedMessage } from './output-types.js';

describe('SummaryBuilder', () => {
  let builder: SummaryBuilder;

  beforeEach(() => {
    builder = new SummaryBuilder();
  });

  describe('Deployment Summary Table', () => {
    it('builds table for Lambda functions', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Lambda Functions'));
      assert.ok(table.includes('5'));
      assert.ok(table.includes('120ms'));
    });

    it('builds table for stacks', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 0,
        stackCount: 3,
        avgLambdaDuration: 0,
        totalDuration: 3000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Stacks'));
      assert.ok(table.includes('3'));
      assert.ok(table.includes('Deployed'));
    });

    it('includes errors in table', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 3,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Errors'));
      assert.ok(table.includes('3'));
    });

    it('includes warnings in table', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 2,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Warnings'));
      assert.ok(table.includes('2'));
    });

    it('includes suppressed info messages', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 10,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Info Messages'));
      assert.ok(table.includes('10'));
      assert.ok(table.includes('Suppressed'));
    });

    it('shows total duration in seconds', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5432, // 5.432 seconds
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('Total Duration'));
      assert.ok(table.includes('5.4s'));
    });

    it('handles zero values correctly', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 0,
        stackCount: 0,
        avgLambdaDuration: 0,
        totalDuration: 0,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      // Table should be minimal when all zero
      assert.ok(typeof table === 'string');
      assert.ok(table.length > 0); // Some content exists
    });

    it('rounds average duration to nearest ms', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 3,
        stackCount: 0,
        avgLambdaDuration: 123.456, // Should round to 123
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const table = builder.buildDeploymentSummary(summary);

      assert.ok(table.includes('123ms'));
    });
  });

  describe('Grouped Messages Table', () => {
    it('builds table for grouped messages', () => {
      const messages: GroupedMessage[] = [
        {
          pattern: 'lambda-deploy',
          count: 10,
          representative: '✓ Deployed 10 Lambda functions (avg 120ms)',
          metadata: {
            avgDuration: 120,
            duration: 5000,
          },
        },
        {
          pattern: 'stack-deploy',
          count: 3,
          representative: '🚀 Deploying 3 stacks',
          metadata: {
            duration: 2000,
          },
        },
      ];

      const table = builder.buildGroupedMessagesTable(messages);

      assert.ok(table.includes('10'));
      assert.ok(table.includes('120ms'));
      assert.ok(table.includes('3'));
    });

    it('returns empty string for no messages', () => {
      const messages: GroupedMessage[] = [];
      const table = builder.buildGroupedMessagesTable(messages);

      assert.strictEqual(table, '');
    });

    it('handles messages without duration', () => {
      const messages: GroupedMessage[] = [
        {
          pattern: 'stack-build',
          count: 5,
          representative: '🔨 Built 5 components',
          metadata: {
            duration: 3000,
          },
        },
      ];

      const table = builder.buildGroupedMessagesTable(messages);

      assert.ok(table.includes('5'));
      assert.ok(table.includes('N/A')); // No avg duration
    });

    it('rounds average durations to whole numbers', () => {
      const messages: GroupedMessage[] = [
        {
          pattern: 'lambda-deploy',
          count: 10,
          representative: '✓ Deployed 10 Lambda functions',
          metadata: {
            avgDuration: 123.789, // Should round to 124
            duration: 5000,
          },
        },
      ];

      const table = builder.buildGroupedMessagesTable(messages);

      assert.ok(table.includes('124ms'));
    });
  });

  describe('Compact Summary', () => {
    it('builds compact summary for Lambda functions', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('5 Lambda function'));
      assert.ok(compact.includes('deployed'));
    });

    it('uses plural form for multiple Lambda functions', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 10,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('10 Lambda functions')); // Plural
    });

    it('uses singular form for single Lambda function', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 1,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('1 Lambda function')); // Singular
    });

    it('includes stacks in compact summary', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 0,
        stackCount: 2,
        avgLambdaDuration: 0,
        totalDuration: 3000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('2 stacks'));
    });

    it('includes errors in compact summary', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 3,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('3 error'));
    });

    it('includes warnings in compact summary', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 2,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('2 warning'));
    });

    it('includes suppressed info messages', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 15,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('15 info messages'));
      assert.ok(compact.includes('suppressed'));
    });

    it('shows total duration in seconds', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 2,
        avgLambdaDuration: 120,
        totalDuration: 12345, // 12.345 seconds
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('12.3s'));
    });

    it('includes header with emoji', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 5000,
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('✨ Deployment Complete!'));
    });
  });

  describe('Edge Cases', () => {
    it('handles very large numbers', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 999,
        stackCount: 999,
        avgLambdaDuration: 9999,
        totalDuration: 999999,
        errors: 999,
        warnings: 999,
        infoMessagesSuppressed: 9999,
      };

      const table = builder.buildDeploymentSummary(summary);
      const compact = builder.buildCompactSummary(summary);

      assert.ok(table.includes('999'));
      assert.ok(compact.includes('999'));
    });

    it('handles fractional seconds correctly', () => {
      const summary: DeploymentSummary = {
        lambdaCount: 5,
        stackCount: 0,
        avgLambdaDuration: 120,
        totalDuration: 1234, // 1.234 seconds
        errors: 0,
        warnings: 0,
        infoMessagesSuppressed: 0,
      };

      const compact = builder.buildCompactSummary(summary);

      assert.ok(compact.includes('1.2s'));
    });

    it('handles grouped messages with missing metadata', () => {
      const messages: GroupedMessage[] = [
        {
          pattern: 'custom',
          count: 5,
          representative: 'Custom message',
          // No metadata
        },
      ];

      const table = builder.buildGroupedMessagesTable(messages);

      assert.ok(table.includes('5'));
      assert.ok(table.includes('N/A'));
    });
  });
});

function beforeEach(callback: () => void): void {
  // Re-create builder before each test
  callback();
}
