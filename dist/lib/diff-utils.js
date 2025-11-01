/**
 * Diff Utilities
 *
 * Core utilities for comparing configurations and generating structured diffs.
 * Supports deep object comparison with change tracking.
 *
 * @example
 * ```typescript
 * const oldConfig = { name: 'service', port: 3000, ssl: true };
 * const newConfig = { name: 'service', port: 3001, ssl: true, region: 'eu-west-1' };
 * const diff = createDiff(oldConfig, newConfig);
 * console.log(diff.changes); // [ { type: 'modified', path: 'port', ... }, ... ]
 * ```
 */
/**
 * Compare two configurations and return structured diff
 *
 * @param oldConfig - Original configuration
 * @param newConfig - New configuration to compare against
 * @returns DiffResult with all changes
 *
 * @example
 * ```typescript
 * const diff = createDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
 * // Returns:
 * // {
 * //   identical: false,
 * //   changes: [
 * //     { type: 'modified', path: 'b', oldValue: 2, newValue: 3 },
 * //     { type: 'added', path: 'c', newValue: 4 }
 * //   ],
 * //   added: 1,
 * //   removed: 0,
 * //   modified: 1
 * // }
 * ```
 */
export function createDiff(oldConfig, newConfig) {
    const changes = [];
    // Deep comparison with path tracking
    compareValues(oldConfig, newConfig, '', changes);
    const result = {
        identical: changes.length === 0,
        changes,
        added: changes.filter(c => c.type === 'added').length,
        removed: changes.filter(c => c.type === 'removed').length,
        modified: changes.filter(c => c.type === 'modified').length,
    };
    return result;
}
/**
 * Recursively compare two values and collect changes
 *
 * @internal
 */
function compareValues(oldVal, newVal, path, changes) {
    // Handle primitives and null
    if (oldVal === newVal) {
        return;
    }
    if (oldVal === null || typeof oldVal !== 'object') {
        if (newVal === null || typeof newVal !== 'object') {
            // Both are primitives but different
            if (oldVal !== undefined) {
                changes.push({
                    type: 'modified',
                    path: path || 'root',
                    oldValue: oldVal,
                    newValue: newVal,
                });
            }
            else {
                changes.push({
                    type: 'added',
                    path: path || 'root',
                    newValue: newVal,
                });
            }
            return;
        }
        // oldVal is primitive, newVal is object
        changes.push({
            type: 'modified',
            path: path || 'root',
            oldValue: oldVal,
            newValue: newVal,
        });
        return;
    }
    if (newVal === null || typeof newVal !== 'object') {
        // oldVal is object, newVal is primitive
        changes.push({
            type: 'modified',
            path: path || 'root',
            oldValue: oldVal,
            newValue: newVal,
        });
        return;
    }
    // Both are objects - compare recursively
    const oldIsArray = Array.isArray(oldVal);
    const newIsArray = Array.isArray(newVal);
    if (oldIsArray !== newIsArray) {
        // One is array, other is object
        changes.push({
            type: 'modified',
            path: path || 'root',
            oldValue: oldVal,
            newValue: newVal,
        });
        return;
    }
    if (oldIsArray && newIsArray) {
        compareArrays(oldVal, newVal, path, changes);
    }
    else {
        compareObjects(oldVal, newVal, path, changes);
    }
}
/**
 * Compare two arrays recursively
 *
 * @internal
 */
function compareArrays(oldArr, newArr, path, changes) {
    const maxLen = Math.max(oldArr.length, newArr.length);
    for (let i = 0; i < maxLen; i++) {
        const oldItem = oldArr[i];
        const newItem = newArr[i];
        const itemPath = `${path}[${i}]`;
        if (i >= oldArr.length) {
            // Item added
            changes.push({
                type: 'added',
                path: itemPath,
                newValue: newItem,
            });
        }
        else if (i >= newArr.length) {
            // Item removed
            changes.push({
                type: 'removed',
                path: itemPath,
                oldValue: oldItem,
            });
        }
        else {
            // Item exists in both, compare them
            compareValues(oldItem, newItem, itemPath, changes);
        }
    }
}
/**
 * Compare two objects recursively
 *
 * @internal
 */
function compareObjects(oldObj, newObj, path, changes) {
    // Get all keys from both objects
    const allKeys = new Set([
        ...Object.keys(oldObj),
        ...Object.keys(newObj),
    ]);
    for (const key of allKeys) {
        const keyPath = path ? `${path}.${key}` : key;
        const oldValue = oldObj[key];
        const newValue = newObj[key];
        if (!(key in oldObj)) {
            // Key added
            changes.push({
                type: 'added',
                path: keyPath,
                newValue,
            });
        }
        else if (!(key in newObj)) {
            // Key removed
            changes.push({
                type: 'removed',
                path: keyPath,
                oldValue,
            });
        }
        else {
            // Key exists in both, compare values
            compareValues(oldValue, newValue, keyPath, changes);
        }
    }
}
/**
 * Check if two values are deeply equal
 *
 * @param val1 - First value
 * @param val2 - Second value
 * @returns true if values are deeply equal
 *
 * @example
 * ```typescript
 * deepEqual({a: 1}, {a: 1}) // true
 * deepEqual({a: 1}, {a: 2}) // false
 * deepEqual([1, 2], [1, 2]) // true
 * ```
 */
export function deepEqual(val1, val2) {
    if (val1 === val2)
        return true;
    if (val1 === null || val2 === null) {
        return val1 === val2;
    }
    if (typeof val1 !== 'object' || typeof val2 !== 'object') {
        return false;
    }
    const arr1 = Array.isArray(val1);
    const arr2 = Array.isArray(val2);
    if (arr1 !== arr2) {
        return false;
    }
    if (arr1 && arr2) {
        if (val1.length !== val2.length) {
            return false;
        }
        return val1.every((item, idx) => deepEqual(item, val2[idx]));
    }
    const obj1 = val1;
    const obj2 = val2;
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    return keys1.every(key => deepEqual(obj1[key], obj2[key]));
}
/**
 * Filter diff changes by type
 *
 * @param diff - DiffResult to filter
 * @param types - Change types to include
 * @returns Filtered DiffResult
 *
 * @example
 * ```typescript
 * const diff = createDiff(old, new);
 * const onlyChanges = filterDiff(diff, ['modified']);
 * const onlyAdditions = filterDiff(diff, ['added']);
 * ```
 */
export function filterDiff(diff, types) {
    const typeSet = new Set(types);
    const filtered = diff.changes.filter(c => typeSet.has(c.type));
    return {
        identical: filtered.length === 0,
        changes: filtered,
        added: filtered.filter(c => c.type === 'added').length,
        removed: filtered.filter(c => c.type === 'removed').length,
        modified: filtered.filter(c => c.type === 'modified').length,
    };
}
/**
 * Serialize a value for display (handles circular references)
 *
 * @param value - Value to serialize
 * @param maxDepth - Maximum nesting depth (default: 10)
 * @returns Serialized string representation
 *
 * @internal
 */
export function serializeValue(value, maxDepth = 10) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (typeof value === 'string')
        return `"${value}"`;
    if (typeof value === 'number')
        return String(value);
    if (typeof value === 'boolean')
        return String(value);
    if (maxDepth === 0) {
        if (Array.isArray(value))
            return '[...]';
        if (typeof value === 'object')
            return '{...}';
        return String(value);
    }
    if (Array.isArray(value)) {
        const items = value.map(v => serializeValue(v, maxDepth - 1)).join(', ');
        return `[${items}]`;
    }
    if (typeof value === 'object') {
        const obj = value;
        const items = Object.entries(obj)
            .map(([k, v]) => `${k}: ${serializeValue(v, maxDepth - 1)}`)
            .join(', ');
        return `{${items}}`;
    }
    return String(value);
}
