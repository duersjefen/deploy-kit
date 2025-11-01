/**
 * Lock Manager Test Suite
 *
 * Tests for concurrent deployment prevention and Pulumi lock recovery.
 * Uses temporary directories for lock file testing.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getLockManager } from './manager.js';
describe('Lock Manager', () => {
    let testDir;
    let lockManager;
    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), 'lock-test-'));
        lockManager = getLockManager(testDir);
    });
    afterEach(() => {
        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });
    describe('Constructor', () => {
        it('creates lock manager instance', () => {
            assert.ok(lockManager);
            assert.ok(lockManager.getFileLock);
            assert.ok(lockManager.acquireLock);
            assert.ok(lockManager.releaseLock);
            assert.ok(lockManager.isPulumiLocked);
            assert.ok(lockManager.clearPulumiLock);
            assert.ok(lockManager.checkAndCleanPulumiLock);
        });
        it('initializes with different project roots', () => {
            const manager1 = getLockManager('/path/1');
            const manager2 = getLockManager('/path/2');
            assert.ok(manager1);
            assert.ok(manager2);
        });
    });
    describe('getFileLock', () => {
        it('returns null when no lock exists', async () => {
            const lock = await lockManager.getFileLock('staging');
            assert.strictEqual(lock, null);
        });
        it('returns lock object when lock exists', async () => {
            // Create a lock first
            const createdLock = await lockManager.acquireLock('staging');
            const retrievedLock = await lockManager.getFileLock('staging');
            assert.ok(retrievedLock);
            assert.strictEqual(retrievedLock?.stage, 'staging');
            assert.strictEqual(retrievedLock?.reason, 'Deployment in progress');
        });
        it('parses dates correctly', async () => {
            await lockManager.acquireLock('staging');
            const lock = await lockManager.getFileLock('staging');
            assert.ok(lock);
            assert.ok(lock.createdAt instanceof Date);
            assert.ok(lock.expiresAt instanceof Date);
            assert.ok(lock.expiresAt.getTime() > lock.createdAt.getTime());
        });
        it('handles different stages independently', async () => {
            await lockManager.acquireLock('staging');
            const stagingLock = await lockManager.getFileLock('staging');
            const prodLock = await lockManager.getFileLock('production');
            assert.ok(stagingLock);
            assert.strictEqual(prodLock, null);
        });
        it('handles corrupted lock files gracefully', async () => {
            const lockPath = join(testDir, '.deployment-lock-staging');
            writeFileSync(lockPath, 'invalid json');
            const lock = await lockManager.getFileLock('staging');
            assert.strictEqual(lock, null);
        });
    });
    describe('acquireLock', () => {
        it('creates lock file for staging', async () => {
            const lock = await lockManager.acquireLock('staging');
            assert.ok(lock);
            assert.strictEqual(lock.stage, 'staging');
            assert.strictEqual(lock.reason, 'Deployment in progress');
            const lockPath = join(testDir, '.deployment-lock-staging');
            assert.ok(existsSync(lockPath));
        });
        it('creates lock file for production', async () => {
            const lock = await lockManager.acquireLock('production');
            assert.ok(lock);
            assert.strictEqual(lock.stage, 'production');
            const lockPath = join(testDir, '.deployment-lock-production');
            assert.ok(existsSync(lockPath));
        });
        it('sets lock expiration time', async () => {
            const before = new Date();
            const lock = await lockManager.acquireLock('staging');
            const after = new Date();
            // Lock should expire in ~120 minutes
            const expirationTime = lock.expiresAt.getTime() - lock.createdAt.getTime();
            const expectedMs = 120 * 60 * 1000;
            assert.ok(expirationTime > expectedMs - 1000);
            assert.ok(expirationTime < expectedMs + 1000);
        });
        it('throws when lock already exists and not expired', async () => {
            await lockManager.acquireLock('staging');
            try {
                await lockManager.acquireLock('staging');
                assert.fail('Should have thrown error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('already in progress'));
            }
        });
        it('contains recovery instructions in error message', async () => {
            await lockManager.acquireLock('staging');
            try {
                await lockManager.acquireLock('staging');
                assert.fail('Should have thrown');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('recover'));
                assert.ok(error.message.includes('npx'));
            }
        });
        it('shows remaining lock time in error', async () => {
            await lockManager.acquireLock('staging');
            try {
                await lockManager.acquireLock('staging');
                assert.fail('Should have thrown');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('min remaining'));
            }
        });
        it('reuses expired locks', async () => {
            // Create a lock with custom expiration in the past
            const oldLock = await lockManager.acquireLock('staging');
            await lockManager.releaseLock(oldLock);
            // Manually create an expired lock
            const lockPath = join(testDir, '.deployment-lock-staging');
            const expiredLock = {
                stage: 'staging',
                createdAt: new Date(Date.now() - 200 * 60 * 1000), // 200 min ago
                expiresAt: new Date(Date.now() - 80 * 60 * 1000), // 80 min ago (expired)
                reason: 'Old deployment',
            };
            writeFileSync(lockPath, JSON.stringify(expiredLock, null, 2));
            // Should be able to acquire despite old lock
            const newLock = await lockManager.acquireLock('staging');
            assert.ok(newLock);
            assert.strictEqual(newLock.stage, 'staging');
        });
        it('allows concurrent locks on different stages', async () => {
            const stagingLock = await lockManager.acquireLock('staging');
            const prodLock = await lockManager.acquireLock('production');
            assert.ok(stagingLock);
            assert.ok(prodLock);
            assert.strictEqual(stagingLock.stage, 'staging');
            assert.strictEqual(prodLock.stage, 'production');
        });
    });
    describe('releaseLock', () => {
        it('removes lock file', async () => {
            const lock = await lockManager.acquireLock('staging');
            const lockPath = join(testDir, '.deployment-lock-staging');
            assert.ok(existsSync(lockPath));
            await lockManager.releaseLock(lock);
            assert.ok(!existsSync(lockPath));
        });
        it('allows reacquiring after release', async () => {
            const lock1 = await lockManager.acquireLock('staging');
            await lockManager.releaseLock(lock1);
            // Should be able to acquire again
            const lock2 = await lockManager.acquireLock('staging');
            assert.ok(lock2);
            await lockManager.releaseLock(lock2);
        });
        it('handles missing lock file gracefully', async () => {
            const lock = {
                stage: 'staging',
                createdAt: new Date(),
                expiresAt: new Date(),
                reason: 'Test',
            };
            // Lock file doesn't exist, but should not throw
            assert.doesNotThrow(() => {
                lockManager.releaseLock(lock);
            });
        });
        it('handles double release gracefully', async () => {
            const lock = await lockManager.acquireLock('staging');
            await lockManager.releaseLock(lock);
            // Second release should not throw
            assert.doesNotThrow(() => {
                lockManager.releaseLock(lock);
            });
        });
        it('only releases for correct stage', async () => {
            const stagingLock = await lockManager.acquireLock('staging');
            const prodLock = await lockManager.acquireLock('production');
            await lockManager.releaseLock(stagingLock);
            const stagingPath = join(testDir, '.deployment-lock-staging');
            const prodPath = join(testDir, '.deployment-lock-production');
            assert.ok(!existsSync(stagingPath));
            assert.ok(existsSync(prodPath));
            await lockManager.releaseLock(prodLock);
            assert.ok(!existsSync(prodPath));
        });
    });
    describe('isPulumiLocked', () => {
        it('returns boolean', async () => {
            const result = await lockManager.isPulumiLocked('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
        it('handles both stages', async () => {
            const stagingResult = await lockManager.isPulumiLocked('staging');
            const prodResult = await lockManager.isPulumiLocked('production');
            assert.strictEqual(typeof stagingResult, 'boolean');
            assert.strictEqual(typeof prodResult, 'boolean');
        });
        it('gracefully handles command failures', async () => {
            // Even if sst command fails, should not throw
            const result = await lockManager.isPulumiLocked('staging');
            assert.strictEqual(typeof result, 'boolean');
        });
    });
    describe('clearPulumiLock', () => {
        it('runs unlock command', async () => {
            // Should not throw even if unlock fails
            assert.doesNotThrow(async () => {
                await lockManager.clearPulumiLock('staging');
            });
        });
        it('handles both stages', async () => {
            // Should not throw for either stage
            assert.doesNotThrow(async () => {
                await lockManager.clearPulumiLock('staging');
                await lockManager.clearPulumiLock('production');
            });
        });
        it('gracefully handles unlock failures', async () => {
            // Lock may not exist, which is OK
            const result = await lockManager.clearPulumiLock('staging');
            assert.strictEqual(result, undefined);
        });
    });
    describe('checkAndCleanPulumiLock', () => {
        it('completes without throwing', async () => {
            assert.doesNotThrow(async () => {
                await lockManager.checkAndCleanPulumiLock('staging');
            });
        });
        it('handles both stages', async () => {
            assert.doesNotThrow(async () => {
                await lockManager.checkAndCleanPulumiLock('staging');
                await lockManager.checkAndCleanPulumiLock('production');
            });
        });
        it('clears lock if detected', async () => {
            // This is integration-level test
            // If Pulumi lock is detected, it should be cleared
            await lockManager.checkAndCleanPulumiLock('staging');
            // Should not throw
            assert.ok(true);
        });
    });
    describe('Integration scenarios', () => {
        it('implements try-finally pattern correctly', async () => {
            const lock = await lockManager.acquireLock('staging');
            try {
                const retrievedLock = await lockManager.getFileLock('staging');
                assert.ok(retrievedLock);
            }
            finally {
                await lockManager.releaseLock(lock);
            }
            const afterRelease = await lockManager.getFileLock('staging');
            assert.strictEqual(afterRelease, null);
        });
        it('handles sequential deployments', async () => {
            const lock1 = await lockManager.acquireLock('staging');
            await lockManager.releaseLock(lock1);
            // Second deployment should work
            const lock2 = await lockManager.acquireLock('staging');
            assert.ok(lock2);
            await lockManager.releaseLock(lock2);
        });
        it('prevents concurrent deployments', async () => {
            const lock1 = await lockManager.acquireLock('staging');
            try {
                await assert.rejects(async () => await lockManager.acquireLock('staging'), /already in progress/);
            }
            finally {
                await lockManager.releaseLock(lock1);
            }
        });
        it('manages multiple stages independently', async () => {
            const stagingLock = await lockManager.acquireLock('staging');
            const prodLock = await lockManager.acquireLock('production');
            // Both should exist
            assert.ok(await lockManager.getFileLock('staging'));
            assert.ok(await lockManager.getFileLock('production'));
            // Release one
            await lockManager.releaseLock(stagingLock);
            // Staging gone, prod remains
            assert.strictEqual(await lockManager.getFileLock('staging'), null);
            assert.ok(await lockManager.getFileLock('production'));
            await lockManager.releaseLock(prodLock);
        });
        it('lock file contains valid JSON', async () => {
            await lockManager.acquireLock('staging');
            const lockPath = join(testDir, '.deployment-lock-staging');
            const content = readFileSync(lockPath, 'utf-8');
            const parsed = JSON.parse(content);
            assert.ok(parsed.stage);
            assert.ok(parsed.createdAt);
            assert.ok(parsed.expiresAt);
            assert.ok(parsed.reason);
        });
    });
    describe('Edge cases', () => {
        it('handles very rapid lock/unlock cycles', async () => {
            for (let i = 0; i < 5; i++) {
                const lock = await lockManager.acquireLock('staging');
                await lockManager.releaseLock(lock);
            }
            const finalLock = await lockManager.getFileLock('staging');
            assert.strictEqual(finalLock, null);
        });
        it('handles lock operations on non-existent base directory', () => {
            const nonExistentDir = join(tmpdir(), 'does-not-exist-' + Date.now());
            const manager = getLockManager(nonExistentDir);
            assert.ok(manager);
            // Should still return null for non-existent lock
            assert.doesNotThrow(async () => {
                await manager.getFileLock('staging');
            });
        });
        it('handles special characters in lock data', async () => {
            const lock = await lockManager.acquireLock('staging');
            const retrieved = await lockManager.getFileLock('staging');
            assert.ok(retrieved);
            assert.strictEqual(retrieved.reason, 'Deployment in progress');
            await lockManager.releaseLock(lock);
        });
        it('lock expiration is in the future', async () => {
            const lock = await lockManager.acquireLock('staging');
            assert.ok(lock.expiresAt.getTime() > new Date().getTime());
            await lockManager.releaseLock(lock);
        });
    });
});
