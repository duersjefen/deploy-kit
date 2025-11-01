/**
 * Diff Utilities Test Suite
 *
 * Tests for configuration comparison and diff generation.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createDiff,
  deepEqual,
  filterDiff,
  serializeValue,
  type DiffResult,
} from './diff-utils.js';

describe('Diff Utilities', () => {
  describe('createDiff - Basic comparisons', () => {
    it('returns identical=true for equal primitives', () => {
      const diff = createDiff('value', 'value');
      assert.strictEqual(diff.identical, true);
      assert.strictEqual(diff.changes.length, 0);
    });

    it('detects modified primitives', () => {
      const diff = createDiff('old', 'new');
      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.changes.length, 1);
      assert.strictEqual(diff.changes[0].type, 'modified');
      assert.strictEqual(diff.changes[0].oldValue, 'old');
      assert.strictEqual(diff.changes[0].newValue, 'new');
    });

    it('returns identical=true for equal objects', () => {
      const obj = { a: 1, b: 'test' };
      const diff = createDiff(obj, obj);
      assert.strictEqual(diff.identical, true);
    });

    it('returns identical=true for deeply equal objects', () => {
      const diff = createDiff(
        { a: 1, b: { c: 2 } },
        { a: 1, b: { c: 2 } }
      );
      assert.strictEqual(diff.identical, true);
    });
  });

  describe('createDiff - Object changes', () => {
    it('detects added properties', () => {
      const diff = createDiff({ a: 1 }, { a: 1, b: 2 });
      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.added, 1);
      assert.strictEqual(diff.removed, 0);
      assert.strictEqual(diff.modified, 0);

      const addedChange = diff.changes.find(c => c.type === 'added');
      assert.ok(addedChange);
      assert.strictEqual(addedChange?.path, 'b');
      assert.strictEqual(addedChange?.newValue, 2);
    });

    it('detects removed properties', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 1 });
      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.added, 0);
      assert.strictEqual(diff.removed, 1);
      assert.strictEqual(diff.modified, 0);

      const removedChange = diff.changes.find(c => c.type === 'removed');
      assert.ok(removedChange);
      assert.strictEqual(removedChange?.path, 'b');
      assert.strictEqual(removedChange?.oldValue, 2);
    });

    it('detects modified properties', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.added, 0);
      assert.strictEqual(diff.removed, 0);
      assert.strictEqual(diff.modified, 1);

      const modifiedChange = diff.changes[0];
      assert.strictEqual(modifiedChange.type, 'modified');
      assert.strictEqual(modifiedChange.path, 'a');
      assert.strictEqual(modifiedChange.oldValue, 1);
      assert.strictEqual(modifiedChange.newValue, 2);
    });

    it('handles mixed changes', () => {
      const diff = createDiff(
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 20, d: 4 }
      );

      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.added, 1); // d
      assert.strictEqual(diff.removed, 1); // c
      assert.strictEqual(diff.modified, 1); // b
    });
  });

  describe('createDiff - Nested objects', () => {
    it('tracks paths for nested properties', () => {
      const diff = createDiff(
        { user: { name: 'John' } },
        { user: { name: 'Jane' } }
      );

      assert.strictEqual(diff.modified, 1);
      assert.strictEqual(diff.changes[0].path, 'user.name');
      assert.strictEqual(diff.changes[0].oldValue, 'John');
      assert.strictEqual(diff.changes[0].newValue, 'Jane');
    });

    it('detects deeply nested changes', () => {
      const diff = createDiff(
        { a: { b: { c: { d: 1 } } } },
        { a: { b: { c: { d: 2 } } } }
      );

      assert.strictEqual(diff.modified, 1);
      assert.strictEqual(diff.changes[0].path, 'a.b.c.d');
    });

    it('handles adding nested properties', () => {
      const diff = createDiff(
        { a: { b: 1 } },
        { a: { b: 1, c: 2 } }
      );

      const added = diff.changes.find(c => c.type === 'added');
      assert.ok(added);
      assert.strictEqual(added?.path, 'a.c');
      assert.strictEqual(added?.newValue, 2);
    });
  });

  describe('createDiff - Array changes', () => {
    it('returns identical for equal arrays', () => {
      const diff = createDiff([1, 2, 3], [1, 2, 3]);
      assert.strictEqual(diff.identical, true);
    });

    it('detects array element modifications', () => {
      const diff = createDiff([1, 2, 3], [1, 20, 3]);
      assert.strictEqual(diff.modified, 1);
      assert.strictEqual(diff.changes[0].path, '[1]');
      assert.strictEqual(diff.changes[0].oldValue, 2);
      assert.strictEqual(diff.changes[0].newValue, 20);
    });

    it('detects array elements added', () => {
      const diff = createDiff([1, 2], [1, 2, 3]);
      assert.strictEqual(diff.added, 1);
      const added = diff.changes.find(c => c.type === 'added');
      assert.strictEqual(added?.path, '[2]');
      assert.strictEqual(added?.newValue, 3);
    });

    it('detects array elements removed', () => {
      const diff = createDiff([1, 2, 3], [1, 2]);
      assert.strictEqual(diff.removed, 1);
      const removed = diff.changes.find(c => c.type === 'removed');
      assert.strictEqual(removed?.path, '[2]');
      assert.strictEqual(removed?.oldValue, 3);
    });

    it('handles array of objects', () => {
      const diff = createDiff(
        [{ id: 1, name: 'a' }, { id: 2, name: 'b' }],
        [{ id: 1, name: 'A' }, { id: 2, name: 'b' }]
      );

      assert.strictEqual(diff.modified, 1);
      assert.strictEqual(diff.changes[0].path, '[0].name');
    });
  });

  describe('createDiff - Type conversions', () => {
    it('detects when type changes from object to primitive', () => {
      const diff = createDiff({ a: 1 }, 'string');
      assert.strictEqual(diff.modified, 1);
      assert.deepStrictEqual(diff.changes[0].oldValue, { a: 1 });
      assert.strictEqual(diff.changes[0].newValue, 'string');
    });

    it('detects when type changes from array to object', () => {
      const diff = createDiff([1, 2], { 0: 1, 1: 2 });
      assert.strictEqual(diff.modified, 1);
    });

    it('detects null to object change', () => {
      const diff = createDiff(null, { a: 1 });
      assert.strictEqual(diff.modified, 1);
    });
  });

  describe('deepEqual', () => {
    it('returns true for identical primitives', () => {
      assert.strictEqual(deepEqual(1, 1), true);
      assert.strictEqual(deepEqual('test', 'test'), true);
      assert.strictEqual(deepEqual(true, true), true);
    });

    it('returns false for different primitives', () => {
      assert.strictEqual(deepEqual(1, 2), false);
      assert.strictEqual(deepEqual('a', 'b'), false);
    });

    it('returns true for identical objects', () => {
      assert.strictEqual(deepEqual({ a: 1 }, { a: 1 }), true);
    });

    it('returns false for different objects', () => {
      assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false);
    });

    it('returns true for deeply equal objects', () => {
      assert.strictEqual(
        deepEqual(
          { a: { b: { c: 1 } } },
          { a: { b: { c: 1 } } }
        ),
        true
      );
    });

    it('returns true for identical arrays', () => {
      assert.strictEqual(deepEqual([1, 2, 3], [1, 2, 3]), true);
    });

    it('returns false for different arrays', () => {
      assert.strictEqual(deepEqual([1, 2], [1, 2, 3]), false);
      assert.strictEqual(deepEqual([1, 2], [2, 1]), false);
    });

    it('returns true for null === null', () => {
      assert.strictEqual(deepEqual(null, null), true);
    });

    it('returns false for null vs undefined', () => {
      assert.strictEqual(deepEqual(null, undefined), false);
    });
  });

  describe('filterDiff', () => {
    it('filters by type "added"', () => {
      const diff = createDiff({ a: 1 }, { a: 2, b: 3 });
      const filtered = filterDiff(diff, ['added']);

      assert.strictEqual(filtered.added, 1);
      assert.strictEqual(filtered.removed, 0);
      assert.strictEqual(filtered.modified, 0);
    });

    it('filters by type "removed"', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 1 });
      const filtered = filterDiff(diff, ['removed']);

      assert.strictEqual(filtered.added, 0);
      assert.strictEqual(filtered.removed, 1);
      assert.strictEqual(filtered.modified, 0);
    });

    it('filters by type "modified"', () => {
      const diff = createDiff(
        { a: 1, b: 2, c: 3 },
        { a: 2, b: 2, c: 4 }
      );
      const filtered = filterDiff(diff, ['modified']);

      assert.strictEqual(filtered.modified, 2);
      assert.strictEqual(filtered.added, 0);
      assert.strictEqual(filtered.removed, 0);
    });

    it('filters by multiple types', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 2, c: 3 });
      const filtered = filterDiff(diff, ['added', 'removed']);

      assert.strictEqual(filtered.added, 1);
      assert.strictEqual(filtered.removed, 1);
      assert.strictEqual(filtered.modified, 0);
    });
  });

  describe('serializeValue', () => {
    it('serializes null', () => {
      assert.strictEqual(serializeValue(null), 'null');
    });

    it('serializes undefined', () => {
      assert.strictEqual(serializeValue(undefined), 'undefined');
    });

    it('serializes strings with quotes', () => {
      assert.strictEqual(serializeValue('test'), '"test"');
    });

    it('serializes numbers', () => {
      assert.strictEqual(serializeValue(42), '42');
      assert.strictEqual(serializeValue(3.14), '3.14');
    });

    it('serializes booleans', () => {
      assert.strictEqual(serializeValue(true), 'true');
      assert.strictEqual(serializeValue(false), 'false');
    });

    it('serializes arrays', () => {
      const result = serializeValue([1, 2, 3]);
      assert.ok(result.includes('1'));
      assert.ok(result.includes('2'));
      assert.ok(result.includes('3'));
    });

    it('serializes objects', () => {
      const result = serializeValue({ a: 1, b: 'test' });
      assert.ok(result.includes('a'));
      assert.ok(result.includes('1'));
      assert.ok(result.includes('b'));
    });

    it('respects maxDepth limit', () => {
      const deep = { a: { b: { c: { d: 1 } } } };
      const result = serializeValue(deep, 2);
      assert.ok(result.includes('{...}'));
    });

    it('marks arrays as truncated at max depth', () => {
      const deep = { a: [1, [2, [3, [4]]]] };
      const result = serializeValue(deep, 2);
      assert.ok(result.includes('[...]'));
    });
  });

  describe('Complex real-world scenarios', () => {
    it('detects changes in deployment config', () => {
      const oldConfig = {
        stage: 'staging',
        cloudfront: {
          distributionId: 'E123ABC',
          caching: { ttl: 300 },
        },
        ssl: { enabled: true, certificateArn: 'arn:aws:...' },
        healthChecks: [
          { url: 'https://api.example.com/health', timeout: 5000 },
        ],
      };

      const newConfig = {
        stage: 'staging',
        cloudfront: {
          distributionId: 'E123ABC',
          caching: { ttl: 600 }, // Changed
        },
        ssl: { enabled: true, certificateArn: 'arn:aws:...' },
        healthChecks: [
          { url: 'https://api.example.com/health', timeout: 5000 },
          { url: 'https://www.example.com/status', timeout: 10000 }, // Added
        ],
      };

      const diff = createDiff(oldConfig, newConfig);

      assert.strictEqual(diff.identical, false);
      assert.strictEqual(diff.modified, 1); // caching.ttl
      assert.strictEqual(diff.added, 1); // healthChecks[1]

      const ttlChange = diff.changes.find(c => c.path === 'cloudfront.caching.ttl');
      assert.ok(ttlChange);
      assert.strictEqual(ttlChange?.oldValue, 300);
      assert.strictEqual(ttlChange?.newValue, 600);
    });

    it('handles large configurations', () => {
      const largeOld: Record<string, unknown> = {};
      const largeNew: Record<string, unknown> = {};

      for (let i = 0; i < 100; i++) {
        largeOld[`key${i}`] = i;
        largeNew[`key${i}`] = i;
      }

      // Modify one value
      largeNew['key50'] = 500;

      const diff = createDiff(largeOld, largeNew);

      assert.strictEqual(diff.modified, 1);
      assert.strictEqual(diff.added, 0);
      assert.strictEqual(diff.removed, 0);
    });

    it('detects environment variable changes', () => {
      const oldEnv = {
        DATABASE_URL: 'postgres://old',
        API_KEY: 'secret123',
        DEBUG: 'false',
      };

      const newEnv = {
        DATABASE_URL: 'postgres://new',
        API_KEY: 'secret123',
        LOG_LEVEL: 'debug', // Added
      };

      const diff = createDiff(oldEnv, newEnv);

      assert.strictEqual(diff.modified, 1); // DATABASE_URL
      assert.strictEqual(diff.removed, 1); // DEBUG
      assert.strictEqual(diff.added, 1); // LOG_LEVEL
    });
  });

  describe('Edge cases', () => {
    it('handles empty objects', () => {
      const diff = createDiff({}, {});
      assert.strictEqual(diff.identical, true);
    });

    it('handles empty arrays', () => {
      const diff = createDiff([], []);
      assert.strictEqual(diff.identical, true);
    });

    it('handles undefined values in objects', () => {
      const diff = createDiff(
        { a: 1, b: undefined },
        { a: 1 }
      );
      // undefined is treated as missing property
      assert.strictEqual(diff.removed, 1);
    });

    it('handles numeric keys in objects', () => {
      const obj1 = { 1: 'a', 2: 'b' };
      const obj2 = { 1: 'a', 2: 'b', 3: 'c' };

      const diff = createDiff(obj1, obj2);
      assert.strictEqual(diff.added, 1);
    });

    it('handles special characters in keys', () => {
      const diff = createDiff(
        { 'key-with-dashes': 1, 'key.with.dots': 2 },
        { 'key-with-dashes': 1, 'key.with.dots': 20 }
      );

      assert.strictEqual(diff.modified, 1);
      assert.ok(diff.changes[0].path.includes('key.with.dots'));
    });

    it('handles Date objects', () => {
      const d1 = new Date('2025-01-01');
      const d2 = new Date('2025-01-02');

      const diff = createDiff(d1, d2);
      assert.strictEqual(diff.modified, 1);
    });
  });
});
