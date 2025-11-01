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
 * Type of change detected in a diff
 */
export type ChangeType = 'added' | 'removed' | 'modified';
/**
 * Represents a single change in a configuration
 */
export interface ConfigChange {
    /** Type of change: added, removed, or modified */
    type: ChangeType;
    /** Path to the changed property (e.g., 'distribution.enabled' or 'records[0].ttl') */
    path: string;
    /** Previous value (undefined for 'added' changes) */
    oldValue?: unknown;
    /** New value (undefined for 'removed' changes) */
    newValue?: unknown;
}
/**
 * Result of comparing two configurations
 */
export interface DiffResult {
    /** Whether configurations are identical */
    identical: boolean;
    /** List of all changes detected */
    changes: ConfigChange[];
    /** Number of additions */
    added: number;
    /** Number of removals */
    removed: number;
    /** Number of modifications */
    modified: number;
}
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
export declare function createDiff(oldConfig: unknown, newConfig: unknown): DiffResult;
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
export declare function deepEqual(val1: unknown, val2: unknown): boolean;
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
export declare function filterDiff(diff: DiffResult, types: ChangeType[]): DiffResult;
/**
 * Serialize a value for display (handles circular references)
 *
 * @param value - Value to serialize
 * @param maxDepth - Maximum nesting depth (default: 10)
 * @returns Serialized string representation
 *
 * @internal
 */
export declare function serializeValue(value: unknown, maxDepth?: number): string;
//# sourceMappingURL=diff-utils.d.ts.map