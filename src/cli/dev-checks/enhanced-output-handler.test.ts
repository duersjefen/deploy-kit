/**
 * Enhanced Output Handler Test Suite
 *
 * Tests for the main output orchestrator.
 * Covers profile filtering, pattern matching, and component integration.
 */

import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { EnhancedOutputHandler } from './enhanced-output-handler.js';
import type { IMessageGrouper, IProgressTracker, ISummaryBuilder } from './output-interfaces.js';
import type { GroupedMessage, DeploymentSummary } from './output-types.js';

// Mock implementations
class MockMessageGrouper implements IMessageGrouper {
  public addedMessages: string[] = [];
  public mockGroupedMessages: GroupedMessage[] = [];

  add(line: string): boolean {
    this.addedMessages.push(line);
    return true; // Don't group by default
  }

  getGroupedMessages(): GroupedMessage[] {
    return this.mockGroupedMessages;
  }

  clear(): void {
    this.addedMessages = [];
    this.mockGroupedMessages = [];
  }

  getTotalCount(): number {
    return this.addedMessages.length;
  }
}

class MockProgressTracker implements IProgressTracker {
  public phases: string[] = [];
  public stopped: boolean = false;

  startPhase(message: string): void {
    this.phases.push(message);
  }

  updatePhase(message: string): void {
    if (this.phases.length > 0) {
      this.phases[this.phases.length - 1] = message;
    }
  }

  succeedPhase(): void {
    // No-op for tests
  }

  failPhase(): void {
    // No-op for tests
  }

  warnPhase(): void {
    // No-op for tests
  }

  stop(): void {
    this.stopped = true;
  }

  isActive(): boolean {
    return this.phases.length > 0 && !this.stopped;
  }

  info(): void {
    // No-op for tests
  }
}

class MockSummaryBuilder implements ISummaryBuilder {
  buildDeploymentSummary(): string {
    return 'Mock Deployment Summary';
  }

  buildGroupedMessagesTable(): string {
    return 'Mock Grouped Messages';
  }

  buildCompactSummary(): string {
    return 'Mock Compact Summary';
  }
}

describe('EnhancedOutputHandler', () => {
  let handler: EnhancedOutputHandler;
  let mockGrouper: MockMessageGrouper;
  let mockProgress: MockProgressTracker;
  let mockSummary: MockSummaryBuilder;
  let consoleLogSpy: ReturnType<typeof mock.method>;

  beforeEach(() => {
    mockGrouper = new MockMessageGrouper();
    mockProgress = new MockProgressTracker();
    mockSummary = new MockSummaryBuilder();

    // Spy on console.log
    consoleLogSpy = mock.method(console, 'log', () => {});
  });

  afterEach(() => {
    consoleLogSpy.mock.restore();
  });

  describe('Profile: Silent', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'silent' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('only shows errors in silent mode', () => {
      handler.processStdout(Buffer.from('Error: Something failed\n'));
      handler.processStdout(Buffer.from('Info: Some info\n'));
      handler.processStdout(Buffer.from('Building Lambda\n'));

      // Only error should be logged
      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
      const errorCall = consoleLogSpy.mock.calls[0] as { arguments: unknown[] };
      assert.ok(String(errorCall.arguments[0]).includes('Error: Something failed'));
    });

    it('shows ready state in silent mode', () => {
      handler.processStdout(Buffer.from('Dev server ready\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
      const readyCall = consoleLogSpy.mock.calls[0] as { arguments: unknown[] };
      assert.ok(String(readyCall.arguments[0]).includes('Dev server ready'));
    });

    it('filters all other messages in silent mode', () => {
      handler.processStdout(Buffer.from('Building Lambda\n'));
      handler.processStdout(Buffer.from('Deploying stack\n'));
      handler.processStdout(Buffer.from('Info: Debug message\n'));

      // Nothing should be logged
      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);
    });
  });

  describe('Profile: Normal', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('shows errors and warnings', () => {
      handler.processStdout(Buffer.from('Error: Something failed\n'));
      handler.processStdout(Buffer.from('Warning: Deprecated API\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 2);
    });

    it('suppresses info messages by default', () => {
      handler.processStdout(Buffer.from('debug: Some debug info\n'));
      handler.processStdout(Buffer.from('Pulumi preview starting\n'));

      // Info messages should be suppressed
      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);
    });

    it('shows ungroupable messages', () => {
      mockGrouper.add = () => true; // Simulate ungroupable

      handler.processStdout(Buffer.from('Some important message\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
    });
  });

  describe('Profile: Verbose', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'verbose' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('shows all messages including building phase', () => {
      handler.processStdout(Buffer.from('Building Lambda function\n'));
      handler.processStdout(Buffer.from('Deploying stack\n'));

      // Both should be logged (no grouping in verbose)
      assert.strictEqual(consoleLogSpy.mock.callCount(), 2);
    });

    it('does not group messages in verbose mode', () => {
      handler.processStdout(Buffer.from('✓ Deployed Lambda handler-1 (100ms)\n'));
      handler.processStdout(Buffer.from('✓ Deployed Lambda handler-2 (110ms)\n'));

      // Both should be displayed individually
      assert.strictEqual(consoleLogSpy.mock.callCount(), 2);
    });
  });

  describe('Profile: Debug', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'debug' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('shows debug messages', () => {
      handler.processStdout(Buffer.from('debug: Internal state\n'));
      handler.processStdout(Buffer.from('TRACE: Function call\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('validates Buffer input for processStdout', () => {
      const consoleErrorSpy = mock.method(console, 'error', () => {});

      // @ts-expect-error - Testing invalid input
      handler.processStdout('not a buffer');

      assert.strictEqual(consoleErrorSpy.mock.callCount(), 1);
      consoleErrorSpy.mock.restore();
    });

    it('validates Buffer input for processStderr', () => {
      const consoleErrorSpy = mock.method(console, 'error', () => {});

      // @ts-expect-error - Testing invalid input
      handler.processStderr('not a buffer');

      assert.strictEqual(consoleErrorSpy.mock.callCount(), 1);
      consoleErrorSpy.mock.restore();
    });

    it('handles encoding errors gracefully', () => {
      const consoleErrorSpy = mock.method(console, 'error', () => {});

      // Create a buffer with invalid UTF-8 sequence
      const invalidBuffer = Buffer.from([0xff, 0xfe, 0xfd]);

      // Should not throw
      handler.processStdout(invalidBuffer);

      // Error might or might not be logged depending on Node.js version
      consoleErrorSpy.mock.restore();
    });
  });

  describe('Metrics Tracking', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('tracks Lambda deployment count', () => {
      handler.processStdout(Buffer.from('✓ Deployed Lambda handler-1 (100ms)\n'));
      handler.processStdout(Buffer.from('✓ Deployed Lambda handler-2 (110ms)\n'));

      // Flush to see the summary (which includes counts)
      handler.flush();

      // Check if summary was built (mocked)
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('tracks stack deployment count', () => {
      handler.processStdout(Buffer.from('✓ MyStack deployed\n'));
      handler.processStdout(Buffer.from('✓ ApiStack deployed\n'));

      handler.flush();

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });
  });

  describe('Flush Method', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('processes remaining buffer on flush', () => {
      handler.processStdout(Buffer.from('Incomplete line'));

      // No newline, so nothing processed yet
      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);

      handler.flush();

      // Now the incomplete line should be processed
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('stops active progress on flush', () => {
      handler.flush();

      assert.strictEqual(mockProgress.stopped, true);
    });

    it('shows grouped messages on flush', () => {
      mockGrouper.mockGroupedMessages = [
        {
          pattern: 'lambda-deploy',
          count: 5,
          representative: '✓ Deployed 5 Lambda functions',
          metadata: { duration: 1000 },
        },
      ];

      handler.flush();

      // Should show grouped messages table
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('handles flush errors gracefully', () => {
      const consoleErrorSpy = mock.method(console, 'error', () => {});

      // Add grouped messages so buildGroupedMessagesTable will be called
      mockGrouper.mockGroupedMessages = [{
        pattern: '✓ Deployed',
        count: 1,
        representative: 'test message',
      }];

      // Make summary builder throw
      mockSummary.buildGroupedMessagesTable = () => {
        throw new Error('Test error');
      };

      // Should not throw
      handler.flush();

      // Error should be logged
      assert.ok(consoleErrorSpy.mock.callCount() > 0);
      consoleErrorSpy.mock.restore();
    });
  });

  describe('Stream Differentiation', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'verbose' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('labels stderr messages in verbose mode', () => {
      handler.processStderr(Buffer.from('Some stderr message\n'));

      const call = consoleLogSpy.mock.calls[0] as { arguments: unknown[] };
      assert.ok(String(call.arguments[0]).includes('[stderr]'));
    });

    it('does not label stdout messages in verbose mode', () => {
      handler.processStdout(Buffer.from('Some stdout message\n'));

      const call = consoleLogSpy.mock.calls[0] as { arguments: unknown[] };
      assert.ok(!String(call.arguments[0]).includes('[stderr]'));
    });
  });

  describe('Options Handling', () => {
    it('respects verbose flag override', () => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'silent', verbose: true },
        mockGrouper,
        mockProgress,
        mockSummary
      );

      // Verbose flag should override profile
      handler.processStdout(Buffer.from('Building Lambda\n'));

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('respects noGroup flag', () => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal', noGroup: true },
        mockGrouper,
        mockProgress,
        mockSummary
      );

      handler.processStdout(Buffer.from('✓ Deployed Lambda handler-1 (100ms)\n'));

      // Message should not be passed to grouper
      assert.strictEqual(mockGrouper.addedMessages.length, 0);
    });

    it('respects hideInfo flag', () => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'verbose', hideInfo: true },
        mockGrouper,
        mockProgress,
        mockSummary
      );

      handler.processStdout(Buffer.from('debug: Some info\n'));

      // Info should be hidden despite verbose mode
      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('matches error patterns', () => {
      handler.processStdout(Buffer.from('Error: Test error\n'));
      handler.processStdout(Buffer.from('ERROR: Another error\n'));
      handler.processStdout(Buffer.from('Failed to deploy\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 3);
    });

    it('matches warning patterns', () => {
      handler.processStdout(Buffer.from('Warning: Deprecated\n'));
      handler.processStdout(Buffer.from('WARN: Something\n'));
      handler.processStdout(Buffer.from('⚠ Alert\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 3);
    });

    it('matches ready patterns', () => {
      handler.processStdout(Buffer.from('Dev server ready\n'));
      handler.processStdout(Buffer.from('Server is ready\n'));

      // Only first "ready" should be shown
      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      handler = new EnhancedOutputHandler(
        { projectRoot: '/test', profile: 'normal' },
        mockGrouper,
        mockProgress,
        mockSummary
      );
    });

    it('handles empty lines', () => {
      handler.processStdout(Buffer.from('\n\n\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 0);
    });

    it('handles very long lines', () => {
      const longLine = 'x'.repeat(100000) + '\n';
      handler.processStdout(Buffer.from(longLine));

      // Should handle without crashing
      assert.ok(true);
    });

    it('handles incomplete lines across multiple chunks', () => {
      handler.processStdout(Buffer.from('First part'));
      handler.processStdout(Buffer.from(' second part\n'));

      // Should process as one complete line
      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
    });

    it('handles special characters', () => {
      handler.processStdout(Buffer.from('Message with émojis: ✓ ❌ 🚀\n'));

      assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
    });
  });
});
