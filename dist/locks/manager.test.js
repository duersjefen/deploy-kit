/**
 * Tests for Lock Manager
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getLockManager } from './manager.js';
const testDir = join(tmpdir(), 'deploy-kit-test-locks');
before(() => {
    if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
    }
});
after(() => {
    try {
        ['staging', 'production'].forEach(stage => {
            const file = join(testDir, `.deployment-lock-${stage}`);
            if (existsSync(file))
                unlinkSync(file);
        });
        rmdirSync(testDir);
    }
    catch (error) {
        // Ignore
    }
});
describe('LockManager', () => {
    it('should acquire lock when none exists', async () => {
        const manager = getLockManager(testDir);
        const lock = await manager.acquireLock('staging');
        assert.ok(lock);
        assert.strictEqual(lock.stage, 'staging');
        await manager.releaseLock(lock);
    });
    it('should prevent concurrent deployment', async () => {
        const manager = getLockManager(testDir);
        const lock1 = await manager.acquireLock('production');
        try {
            await manager.acquireLock('production');
            assert.fail('Should throw error');
        }
        catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('already in progress'));
        }
        finally {
            await manager.releaseLock(lock1);
        }
    });
    it('should allow independent locks for different stages', async () => {
        const manager = getLockManager(testDir);
        const stagingLock = await manager.acquireLock('staging');
        const prodLock = await manager.acquireLock('production');
        assert.strictEqual(stagingLock.stage, 'staging');
        assert.strictEqual(prodLock.stage, 'production');
        await manager.releaseLock(stagingLock);
        await manager.releaseLock(prodLock);
    });
    it('should release lock successfully', async () => {
        const manager = getLockManager(testDir);
        const lock = await manager.acquireLock('staging');
        const lockPath = join(testDir, '.deployment-lock-staging');
        assert.ok(existsSync(lockPath));
        await manager.releaseLock(lock);
        assert.ok(!existsSync(lockPath));
    });
    it('should return null when no lock exists', async () => {
        const manager = getLockManager(testDir);
        const lock = await manager.getFileLock('staging');
        assert.strictEqual(lock, null);
    });
});
