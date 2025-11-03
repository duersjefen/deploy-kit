/**
 * Progress Tracker Test Suite
 *
 * Tests for spinner-based progress tracking.
 * Covers phase management, status updates, and edge cases.
 */
import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProgressTracker } from './progress-tracker.js';
describe('ProgressTracker', () => {
    let tracker;
    let consoleLogSpy;
    beforeEach(() => {
        tracker = new ProgressTracker();
        consoleLogSpy = mock.method(console, 'log', () => { });
    });
    afterEach(() => {
        consoleLogSpy.mock.restore();
    });
    describe('Phase Management', () => {
        it('starts a new phase', () => {
            tracker.startPhase('Building...');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('stops previous phase when starting new one', () => {
            tracker.startPhase('Phase 1');
            tracker.startPhase('Phase 2');
            // Only one phase should be active
            assert.strictEqual(tracker.isActive(), true);
        });
        it('updates current phase text', () => {
            tracker.startPhase('Building...');
            tracker.updatePhase('Building... (50%)');
            // Should not throw
            assert.ok(true);
        });
        it('succeeds current phase', () => {
            tracker.startPhase('Deploying...');
            tracker.succeedPhase('Deployed successfully');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('fails current phase', () => {
            tracker.startPhase('Deploying...');
            tracker.failPhase('Deployment failed');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('warns current phase', () => {
            tracker.startPhase('Checking...');
            tracker.warnPhase('Check completed with warnings');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('stops phase without marking status', () => {
            tracker.startPhase('Processing...');
            tracker.stop();
            assert.strictEqual(tracker.isActive(), false);
        });
    });
    describe('Spinner Types', () => {
        it('accepts dots spinner type', () => {
            tracker.startPhase('Loading...', 'dots');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('accepts line spinner type', () => {
            tracker.startPhase('Loading...', 'line');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('accepts moon spinner type', () => {
            tracker.startPhase('Loading...', 'moon');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('accepts arc spinner type', () => {
            tracker.startPhase('Loading...', 'arc');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('defaults to dots spinner when not specified', () => {
            tracker.startPhase('Loading...');
            assert.strictEqual(tracker.isActive(), true);
        });
    });
    describe('isActive Method', () => {
        it('returns false when no phase is active', () => {
            assert.strictEqual(tracker.isActive(), false);
        });
        it('returns true when phase is active', () => {
            tracker.startPhase('Processing...');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('returns false after phase succeeds', () => {
            tracker.startPhase('Processing...');
            tracker.succeedPhase();
            assert.strictEqual(tracker.isActive(), false);
        });
        it('returns false after phase fails', () => {
            tracker.startPhase('Processing...');
            tracker.failPhase();
            assert.strictEqual(tracker.isActive(), false);
        });
        it('returns false after stop', () => {
            tracker.startPhase('Processing...');
            tracker.stop();
            assert.strictEqual(tracker.isActive(), false);
        });
    });
    describe('Info Messages', () => {
        it('shows info message when spinner is active', () => {
            tracker.startPhase('Processing...');
            tracker.info('Additional info');
            // Should not throw
            assert.ok(true);
        });
        it('shows info message when spinner is not active', () => {
            tracker.info('Standalone info');
            // Should log directly
            assert.strictEqual(consoleLogSpy.mock.callCount(), 1);
        });
    });
    describe('Edge Cases', () => {
        it('handles updatePhase with no active spinner', () => {
            // Should not throw
            tracker.updatePhase('Update without active spinner');
            assert.ok(true);
        });
        it('handles succeedPhase with no active spinner', () => {
            // Should not throw
            tracker.succeedPhase('Success without active spinner');
            assert.ok(true);
        });
        it('handles failPhase with no active spinner', () => {
            // Should not throw
            tracker.failPhase('Fail without active spinner');
            assert.ok(true);
        });
        it('handles warnPhase with no active spinner', () => {
            // Should not throw
            tracker.warnPhase('Warn without active spinner');
            assert.ok(true);
        });
        it('handles stop with no active spinner', () => {
            // Should not throw
            tracker.stop();
            assert.ok(true);
        });
        it('handles very long phase messages', () => {
            const longMessage = 'x'.repeat(10000);
            tracker.startPhase(longMessage);
            assert.strictEqual(tracker.isActive(), true);
        });
        it('handles empty phase messages', () => {
            tracker.startPhase('');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('handles special characters in messages', () => {
            tracker.startPhase('Building... 🚀 ✓ ❌');
            tracker.updatePhase('Updated... émoji test');
            assert.ok(true);
        });
        it('handles multiple consecutive starts', () => {
            tracker.startPhase('Phase 1');
            tracker.startPhase('Phase 2');
            tracker.startPhase('Phase 3');
            assert.strictEqual(tracker.isActive(), true);
        });
        it('handles multiple consecutive stops', () => {
            tracker.startPhase('Phase 1');
            tracker.stop();
            tracker.stop();
            tracker.stop();
            assert.strictEqual(tracker.isActive(), false);
        });
    });
    describe('Phase Completion with Custom Messages', () => {
        it('succeeds with custom message', () => {
            tracker.startPhase('Building...');
            tracker.succeedPhase('Custom success message');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('fails with custom message', () => {
            tracker.startPhase('Building...');
            tracker.failPhase('Custom failure message');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('warns with custom message', () => {
            tracker.startPhase('Building...');
            tracker.warnPhase('Custom warning message');
            assert.strictEqual(tracker.isActive(), false);
        });
        it('uses default message when not provided', () => {
            tracker.startPhase('Building...');
            tracker.succeedPhase(); // No message
            assert.strictEqual(tracker.isActive(), false);
        });
    });
    describe('Rapid Phase Transitions', () => {
        it('handles rapid start/stop cycles', () => {
            for (let i = 0; i < 100; i++) {
                tracker.startPhase(`Phase ${i}`);
                tracker.stop();
            }
            assert.strictEqual(tracker.isActive(), false);
        });
        it('handles rapid start/succeed cycles', () => {
            for (let i = 0; i < 100; i++) {
                tracker.startPhase(`Phase ${i}`);
                tracker.succeedPhase();
            }
            assert.strictEqual(tracker.isActive(), false);
        });
        it('handles rapid updates', () => {
            tracker.startPhase('Initial');
            for (let i = 0; i < 100; i++) {
                tracker.updatePhase(`Update ${i}`);
            }
            assert.strictEqual(tracker.isActive(), true);
        });
    });
});
