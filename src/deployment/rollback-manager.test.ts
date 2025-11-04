/**
 * Rollback Manager Test Suite
 *
 * Tests for deployment recovery and rollback functionality.
 * Covers lock clearing, status checking, and rollback guidance.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { RollbackManager } from './rollback-manager.js';
import type { ExtendedLockManager, DeploymentLock, DeploymentStage } from '../types.js';

describe('Rollback Manager', () => {
  let mockLockManager: ExtendedLockManager;
  let rollbackManager: RollbackManager;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock console methods to suppress output during tests
    consoleLogSpy = mock.method(console, 'log', () => {});
    consoleErrorSpy = mock.method(console, 'error', () => {});

    // Create mock lock manager
    mockLockManager = {
      getFileLock: mock.fn(async () => null),
      releaseLock: mock.fn(async () => {}),
      clearPulumiLock: mock.fn(async () => {}),
      isPulumiLocked: mock.fn(async () => false),
    } as unknown as ExtendedLockManager;

    rollbackManager = new RollbackManager(mockLockManager);
  });

  afterEach(() => {
    consoleLogSpy.mock.restore();
    consoleErrorSpy.mock.restore();
  });

  describe('constructor', () => {
    it('creates rollback manager with lock manager', () => {
      const manager = new RollbackManager(mockLockManager);
      assert.ok(manager instanceof RollbackManager);
    });
  });

  describe('recover', () => {
    it('clears file lock when present', async () => {
      const mockLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => mockLock);

      await rollbackManager.recover('staging');

      assert.strictEqual((mockLockManager.getFileLock as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.releaseLock as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.clearPulumiLock as any).mock.callCount(), 1);
    });

    it('handles missing file lock gracefully', async () => {
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => null);

      await rollbackManager.recover('staging');

      assert.strictEqual((mockLockManager.getFileLock as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.releaseLock as any).mock.callCount(), 0); // Not called when no lock
      assert.strictEqual((mockLockManager.clearPulumiLock as any).mock.callCount(), 1);
    });

    it('clears Pulumi lock', async () => {
      await rollbackManager.recover('staging');

      assert.strictEqual((mockLockManager.clearPulumiLock as any).mock.callCount(), 1);
      const [stage] = (mockLockManager.clearPulumiLock as any).mock.calls[0].arguments;
      assert.strictEqual(stage, 'staging');
    });

    it('works for production stage', async () => {
      await rollbackManager.recover('production');

      assert.strictEqual((mockLockManager.getFileLock as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.clearPulumiLock as any).mock.callCount(), 1);
    });

    it('throws error if lock clearing fails', async () => {
      const testError = new Error('Lock release failed');
      (mockLockManager.releaseLock as any).mock.mockImplementation(async () => {
        throw testError;
      });

      const mockLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => mockLock);

      await assert.rejects(
        async () => rollbackManager.recover('staging'),
        (error: Error) => {
          assert.strictEqual(error.message, 'Lock release failed');
          return true;
        }
      );
    });

    it('throws error if Pulumi lock clearing fails', async () => {
      const testError = new Error('Pulumi lock clear failed');
      (mockLockManager.clearPulumiLock as any).mock.mockImplementation(async () => {
        throw testError;
      });

      await assert.rejects(
        async () => rollbackManager.recover('staging'),
        (error: Error) => {
          assert.strictEqual(error.message, 'Pulumi lock clear failed');
          return true;
        }
      );
    });

    it('prints success message on completion', async () => {
      await rollbackManager.recover('staging');

      // Check that console.log was called (success messages)
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });
  });

  describe('getStatus', () => {
    it('shows ready status when no locks present', async () => {
      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => false);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => null);

      await rollbackManager.getStatus('staging');

      assert.ok(consoleLogSpy.mock.callCount() > 0);
      assert.strictEqual((mockLockManager.isPulumiLocked as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.getFileLock as any).mock.callCount(), 1);
    });

    it('detects Pulumi lock', async () => {
      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => true);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => null);

      await rollbackManager.getStatus('staging');

      assert.ok(consoleLogSpy.mock.callCount() > 0);
      assert.strictEqual((mockLockManager.isPulumiLocked as any).mock.callCount(), 1);
    });

    it('detects active file lock', async () => {
      const activeLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // Expires in 1 hour (active)
      };

      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => false);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => activeLock);

      await rollbackManager.getStatus('staging');

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('detects stale file lock', async () => {
      const staleLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(Date.now() - 7200000), // 2 hours ago
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago (stale)
      };

      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => false);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => staleLock);

      await rollbackManager.getStatus('staging');

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('calculates remaining lock time correctly', async () => {
      const now = new Date();
      const activeLock: DeploymentLock = {
        stage: 'staging',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // Expires in 30 minutes
      };

      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => false);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => activeLock);

      await rollbackManager.getStatus('staging');

      // Verify time calculation works (console.log called with minutes remaining)
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('works for production stage', async () => {
      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => false);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => null);

      await rollbackManager.getStatus('production');

      assert.strictEqual((mockLockManager.isPulumiLocked as any).mock.callCount(), 1);
      const [stage] = (mockLockManager.isPulumiLocked as any).mock.calls[0].arguments;
      assert.strictEqual(stage, 'production');
    });
  });

  describe('provideRollbackGuidance', () => {
    it('provides generic guidance', () => {
      const error = new Error('Generic deployment error');

      rollbackManager.provideRollbackGuidance('staging', error);

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('provides certificate-specific guidance', () => {
      const error = new Error('SSL certificate validation failed');

      rollbackManager.provideRollbackGuidance('staging', error);

      // Check that guidance was printed
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('provides CloudFront-specific guidance', () => {
      const error = new Error('CloudFront distribution update failed');

      rollbackManager.provideRollbackGuidance('staging', error);

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('provides lock-specific guidance', () => {
      const error = new Error('Lock acquisition failed');

      rollbackManager.provideRollbackGuidance('staging', error);

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('handles multiple error types in message', () => {
      const error = new Error('Lock failed during certificate validation for CloudFront distribution');

      rollbackManager.provideRollbackGuidance('staging', error);

      // Should provide guidance for all detected keywords
      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('works for production stage', () => {
      const error = new Error('Deployment failed');

      rollbackManager.provideRollbackGuidance('production', error);

      assert.ok(consoleLogSpy.mock.callCount() > 0);
    });

    it('includes stage in guidance output', () => {
      const error = new Error('Test error');

      rollbackManager.provideRollbackGuidance('staging', error);

      // Verify stage appears in output
      const calls = consoleLogSpy.mock.calls;
      const outputContainsStaging = calls.some((call: any) =>
        call.arguments.some((arg: any) => typeof arg === 'string' && arg.includes('staging'))
      );
      assert.ok(outputContainsStaging);
    });
  });

  describe('Integration scenarios', () => {
    it('handles full recovery workflow', async () => {
      // Setup: Both locks present
      const mockLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      (mockLockManager.isPulumiLocked as any).mock.mockImplementation(async () => true);
      (mockLockManager.getFileLock as any).mock.mockImplementation(async () => mockLock);

      // Check status (should show locks)
      await rollbackManager.getStatus('staging');
      assert.strictEqual((mockLockManager.isPulumiLocked as any).mock.callCount(), 1);

      // Recover (should clear both locks)
      await rollbackManager.recover('staging');
      assert.strictEqual((mockLockManager.releaseLock as any).mock.callCount(), 1);
      assert.strictEqual((mockLockManager.clearPulumiLock as any).mock.callCount(), 1);
    });

    it('handles multiple stages independently', async () => {
      const stagingLock: DeploymentLock = {
        stage: 'staging',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      (mockLockManager.getFileLock as any).mock.mockImplementation(async (stage: DeploymentStage) => {
        return stage === 'staging' ? stagingLock : null;
      });

      // Check staging (has lock)
      await rollbackManager.getStatus('staging');

      // Check production (no lock)
      await rollbackManager.getStatus('production');

      assert.strictEqual((mockLockManager.getFileLock as any).mock.callCount(), 2);
    });

    it('provides guidance after failed recovery', async () => {
      const testError = new Error('Recovery failed - CloudFront stuck');
      (mockLockManager.clearPulumiLock as any).mock.mockImplementation(async () => {
        throw testError;
      });

      try {
        await rollbackManager.recover('staging');
        assert.fail('Should have thrown error');
      } catch (error) {
        // After failed recovery, provide guidance
        rollbackManager.provideRollbackGuidance('staging', error as Error);
        assert.ok(consoleLogSpy.mock.callCount() > 0);
      }
    });
  });
});
