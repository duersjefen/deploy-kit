/**
 * Shared test utilities for deploy-kit
 */
import type { ProjectConfig } from './types.js';
/**
 * Create a temporary directory for testing
 * Automatically cleans up after tests complete
 */
export declare function createTempDir(): string;
/**
 * Clean up a temporary directory
 */
export declare function cleanupTempDir(dir: string): void;
/**
 * Mock environment variables for testing
 */
export declare function withEnv(env: Record<string, string>, fn: () => void | Promise<void>): void | Promise<void>;
/**
 * Assert that a value matches expected (with optional message)
 */
export declare function assert(condition: boolean, message?: string): void;
/**
 * Assert strict equality
 */
export declare function assertEqual<T>(actual: T, expected: T, message?: string): void;
/**
 * Assert that a function throws an error
 */
export declare function assertThrows(fn: () => void, message?: string): void;
/**
 * Create a mock ProjectConfig for testing
 */
export declare function createMockProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig;
//# sourceMappingURL=test-utils.d.ts.map