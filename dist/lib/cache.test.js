/**
 * Cache Module Test Suite
 *
 * Tests for SimpleCache<T> utility with TTL-based expiration.
 * Covers core functionality, edge cases, and memory management.
 */
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { SimpleCache, cacheKey } from './cache.js';
describe('SimpleCache', () => {
    let cache;
    beforeEach(() => {
        cache = new SimpleCache(1000); // 1 second TTL for fast tests
    });
    describe('Basic Operations', () => {
        it('stores and retrieves values', () => {
            cache.set('key1', 'value1');
            assert.strictEqual(cache.get('key1'), 'value1');
        });
        it('returns null for non-existent keys', () => {
            assert.strictEqual(cache.get('non-existent'), null);
        });
        it('stores multiple values independently', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');
            assert.strictEqual(cache.get('key1'), 'value1');
            assert.strictEqual(cache.get('key2'), 'value2');
            assert.strictEqual(cache.get('key3'), 'value3');
        });
        it('overwrites existing values', () => {
            cache.set('key1', 'value1');
            assert.strictEqual(cache.get('key1'), 'value1');
            cache.set('key1', 'updated-value');
            assert.strictEqual(cache.get('key1'), 'updated-value');
        });
        it('handles special characters in keys', () => {
            const specialKey = 'dist:us-east-1:d1abc123';
            cache.set(specialKey, 'value');
            assert.strictEqual(cache.get(specialKey), 'value');
        });
        it('stores complex objects', () => {
            const complexCache = new SimpleCache();
            const obj = { id: '123', name: 'test', nested: { data: 'value' } };
            complexCache.set('obj', obj);
            assert.deepStrictEqual(complexCache.get('obj'), obj);
        });
    });
    describe('TTL and Expiration', () => {
        it('expires values after TTL', async () => {
            const shortCache = new SimpleCache(100); // 100ms TTL
            shortCache.set('key1', 'value1');
            assert.strictEqual(shortCache.get('key1'), 'value1');
            // Wait for expiration
            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.strictEqual(shortCache.get('key1'), null);
        });
        it('respects custom TTL per entry', async () => {
            cache.set('short', 'value', 50); // 50ms custom TTL
            cache.set('long', 'value', 5000); // 5s custom TTL
            assert.strictEqual(cache.get('short'), 'value');
            assert.strictEqual(cache.get('long'), 'value');
            await new Promise((resolve) => setTimeout(resolve, 100));
            assert.strictEqual(cache.get('short'), null);
            assert.strictEqual(cache.get('long'), 'value');
        });
        it('resets TTL on overwrite', async () => {
            cache.set('key1', 'value1');
            await new Promise((resolve) => setTimeout(resolve, 600));
            // Not yet expired (1000ms TTL)
            assert.strictEqual(cache.get('key1'), 'value1');
            // Overwrite resets TTL
            cache.set('key1', 'value2');
            await new Promise((resolve) => setTimeout(resolve, 600));
            // Should still be valid (new 1000ms TTL started)
            assert.strictEqual(cache.get('key1'), 'value2');
        });
        it('uses custom TTL when provided to set()', async () => {
            const longCache = new SimpleCache(100); // Default 100ms
            longCache.set('key1', 'value1', 5000); // Custom 5s
            await new Promise((resolve) => setTimeout(resolve, 200));
            assert.strictEqual(longCache.get('key1'), 'value1');
        });
    });
    describe('Delete and Clear', () => {
        it('deletes specific keys', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            const deleted = cache.delete('key1');
            assert.strictEqual(deleted, true);
            assert.strictEqual(cache.get('key1'), null);
            assert.strictEqual(cache.get('key2'), 'value2');
        });
        it('returns false when deleting non-existent key', () => {
            const deleted = cache.delete('non-existent');
            assert.strictEqual(deleted, false);
        });
        it('clears all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');
            cache.clear();
            assert.strictEqual(cache.get('key1'), null);
            assert.strictEqual(cache.get('key2'), null);
            assert.strictEqual(cache.get('key3'), null);
        });
        it('clears cache without affecting new instances', () => {
            cache.set('key1', 'value1');
            cache.clear();
            const newCache = new SimpleCache();
            newCache.set('key2', 'value2');
            assert.strictEqual(cache.get('key1'), null);
            assert.strictEqual(newCache.get('key2'), 'value2');
        });
    });
    describe('Has Method', () => {
        it('returns true for existing non-expired values', () => {
            cache.set('key1', 'value1');
            assert.strictEqual(cache.has('key1'), true);
        });
        it('returns false for non-existent keys', () => {
            assert.strictEqual(cache.has('non-existent'), false);
        });
        it('returns false for expired keys', async () => {
            const shortCache = new SimpleCache(100);
            shortCache.set('key1', 'value1');
            assert.strictEqual(shortCache.has('key1'), true);
            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.strictEqual(shortCache.has('key1'), false);
        });
    });
    describe('Cleanup Method', () => {
        it('removes expired entries', async () => {
            cache.set('expired', 'value', 50);
            cache.set('valid', 'value', 5000);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const removed = cache.cleanup();
            assert.strictEqual(removed, 1);
            assert.strictEqual(cache.get('valid'), 'value');
        });
        it('returns 0 when no entries are expired', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            const removed = cache.cleanup();
            assert.strictEqual(removed, 0);
        });
        it('removes all entries when all are expired', async () => {
            cache.set('key1', 'value1', 50);
            cache.set('key2', 'value2', 50);
            cache.set('key3', 'value3', 50);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const removed = cache.cleanup();
            assert.strictEqual(removed, 3);
            assert.strictEqual(cache.stats().size, 0);
        });
    });
    describe('Stats Method', () => {
        it('reports cache statistics', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            const stats = cache.stats();
            assert.strictEqual(stats.size, 2);
            assert.strictEqual(stats.expired, 0);
        });
        it('counts expired entries', async () => {
            cache.set('expired1', 'value', 50);
            cache.set('expired2', 'value', 50);
            cache.set('valid', 'value', 5000);
            await new Promise((resolve) => setTimeout(resolve, 100));
            const stats = cache.stats();
            assert.strictEqual(stats.size, 3);
            assert.strictEqual(stats.expired, 2);
        });
        it('returns correct stats after cleanup', async () => {
            cache.set('key1', 'value1', 50);
            cache.set('key2', 'value2', 50);
            cache.set('key3', 'value3');
            await new Promise((resolve) => setTimeout(resolve, 100));
            cache.cleanup();
            const stats = cache.stats();
            assert.strictEqual(stats.size, 1);
            assert.strictEqual(stats.expired, 0);
        });
    });
    describe('GetOrSet Pattern', () => {
        it('returns cached value without calling fetcher', async () => {
            let callCount = 0;
            const fetcher = async () => {
                callCount++;
                return 'fetched';
            };
            // First call - should fetch
            let result = await cache.getOrSet('key1', fetcher);
            assert.strictEqual(result, 'fetched');
            assert.strictEqual(callCount, 1);
            // Second call - should use cache
            result = await cache.getOrSet('key1', fetcher);
            assert.strictEqual(result, 'fetched');
            assert.strictEqual(callCount, 1); // Not incremented
        });
        it('calls fetcher on cache miss', async () => {
            let callCount = 0;
            const fetcher = async () => {
                callCount++;
                return 'computed-value';
            };
            const result = await cache.getOrSet('new-key', fetcher);
            assert.strictEqual(result, 'computed-value');
            assert.strictEqual(callCount, 1);
        });
        it('respects custom TTL in getOrSet', async () => {
            const shortCache = new SimpleCache(100);
            let callCount = 0;
            const fetcher = async () => {
                callCount++;
                return 'value';
            };
            // First call with custom TTL
            let result = await shortCache.getOrSet('key1', fetcher, 200);
            assert.strictEqual(result, 'value');
            assert.strictEqual(callCount, 1);
            await new Promise((resolve) => setTimeout(resolve, 150));
            // Should still be cached (200ms TTL)
            result = await shortCache.getOrSet('key1', fetcher);
            assert.strictEqual(result, 'value');
            assert.strictEqual(callCount, 1);
            await new Promise((resolve) => setTimeout(resolve, 100));
            // Should be expired now
            result = await shortCache.getOrSet('key1', fetcher);
            assert.strictEqual(result, 'value');
            assert.strictEqual(callCount, 2);
        });
        it('handles async fetcher errors', async () => {
            const fetcher = async () => {
                throw new Error('Fetch failed');
            };
            try {
                await cache.getOrSet('key1', fetcher);
                assert.fail('Should have thrown');
            }
            catch (error) {
                assert.strictEqual(error.message, 'Fetch failed');
            }
        });
        it('stores fetched value in cache', async () => {
            const fetcher = async () => 'fetched-value';
            const result = await cache.getOrSet('key1', fetcher);
            assert.strictEqual(result, 'fetched-value');
            // Verify it's actually cached
            const cached = cache.get('key1');
            assert.strictEqual(cached, 'fetched-value');
        });
    });
    describe('Concurrent Operations', () => {
        it('handles multiple concurrent getOrSet calls', async () => {
            let callCount = 0;
            const fetcher = async () => {
                callCount++;
                await new Promise((resolve) => setTimeout(resolve, 50));
                return 'value';
            };
            const promises = [
                cache.getOrSet('shared-key', fetcher),
                cache.getOrSet('shared-key', fetcher),
                cache.getOrSet('shared-key', fetcher),
            ];
            const results = await Promise.all(promises);
            // All should return same value
            assert.deepStrictEqual(results, ['value', 'value', 'value']);
            // But fetcher might be called multiple times due to async nature
            assert.ok(callCount >= 1);
        });
        it('handles concurrent sets and gets', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            assert.strictEqual(cache.get('key1'), 'value1');
            cache.set('key1', 'updated');
            assert.strictEqual(cache.get('key1'), 'updated');
            assert.strictEqual(cache.get('key2'), 'value2');
        });
    });
    describe('Type Safety', () => {
        it('works with different types', () => {
            const stringCache = new SimpleCache();
            stringCache.set('str', 'value');
            assert.strictEqual(stringCache.get('str'), 'value');
            const numberCache = new SimpleCache();
            numberCache.set('num', 42);
            assert.strictEqual(numberCache.get('num'), 42);
            const objectCache = new SimpleCache();
            const obj = { id: 'test' };
            objectCache.set('obj', obj);
            assert.deepStrictEqual(objectCache.get('obj'), obj);
        });
        it('maintains type through getOrSet', async () => {
            const userCache = new SimpleCache();
            const user = { id: '1', name: 'John' };
            const fetcher = async () => user;
            const result = await userCache.getOrSet('user-1', fetcher);
            assert.strictEqual(result.id, '1');
            assert.strictEqual(result.name, 'John');
        });
    });
    describe('Memory Management', () => {
        it('stores keys without memory waste', () => {
            for (let i = 0; i < 1000; i++) {
                cache.set(`key-${i}`, `value-${i}`);
            }
            const stats = cache.stats();
            assert.strictEqual(stats.size, 1000);
        });
        it('clears memory when cleared', () => {
            for (let i = 0; i < 1000; i++) {
                cache.set(`key-${i}`, `value-${i}`);
            }
            let stats = cache.stats();
            assert.strictEqual(stats.size, 1000);
            cache.clear();
            stats = cache.stats();
            assert.strictEqual(stats.size, 0);
        });
        it('removes expired entries to free memory', async () => {
            const shortCache = new SimpleCache(100);
            for (let i = 0; i < 100; i++) {
                shortCache.set(`key-${i}`, `value-${i}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
            const removed = shortCache.cleanup();
            assert.strictEqual(removed, 100);
            const stats = shortCache.stats();
            assert.strictEqual(stats.size, 0);
        });
    });
    describe('Edge Cases', () => {
        it('handles null and undefined values', () => {
            const nullCache = new SimpleCache();
            nullCache.set('null-key', null);
            assert.strictEqual(nullCache.get('null-key'), null);
            assert.strictEqual(nullCache.has('null-key'), false); // null is treated as expired
        });
        it('handles empty string keys', () => {
            cache.set('', 'empty-key-value');
            assert.strictEqual(cache.get(''), 'empty-key-value');
        });
        it('handles very long keys', () => {
            const longKey = 'k'.repeat(10000);
            cache.set(longKey, 'value');
            assert.strictEqual(cache.get(longKey), 'value');
        });
        it('handles very large values', () => {
            const largeValue = 'x'.repeat(1000000); // 1MB
            cache.set('large', largeValue);
            assert.strictEqual(cache.get('large'), largeValue);
        });
        it('handles zero TTL', async () => {
            cache.set('key1', 'value1', 0);
            // Should expire immediately since TTL is 0
            await new Promise((resolve) => setTimeout(resolve, 1));
            assert.strictEqual(cache.get('key1'), null);
        });
        it('handles very large TTL values', () => {
            cache.set('key1', 'value1', 999999999999);
            assert.strictEqual(cache.get('key1'), 'value1');
        });
    });
});
describe('cacheKey utility function', () => {
    it('joins parts with colons', () => {
        const key = cacheKey('dist', 'us-east-1', 'E123ABC');
        assert.strictEqual(key, 'dist:us-east-1:E123ABC');
    });
    it('filters out undefined parts', () => {
        const key = cacheKey('dist', undefined, 'E123ABC');
        assert.strictEqual(key, 'dist:E123ABC');
    });
    it('filters out empty strings', () => {
        const key = cacheKey('dist', '', 'E123ABC');
        assert.strictEqual(key, 'dist:E123ABC');
    });
    it('handles numbers', () => {
        const key = cacheKey('cache', 'v', 1, 'test');
        assert.strictEqual(key, 'cache:v:1:test');
    });
    it('handles all undefined', () => {
        const key = cacheKey(undefined, undefined);
        assert.strictEqual(key, '');
    });
    it('handles single part', () => {
        const key = cacheKey('single');
        assert.strictEqual(key, 'single');
    });
    it('creates unique keys for different inputs', () => {
        const key1 = cacheKey('dist', 'E123');
        const key2 = cacheKey('dist', 'E456');
        const key3 = cacheKey('dns', 'E123');
        assert.notStrictEqual(key1, key2);
        assert.notStrictEqual(key1, key3);
    });
});
