/**
 * Shared test utilities for deploy-kit
 */
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
/**
 * Create a temporary directory for testing
 * Automatically cleans up after tests complete
 */
export function createTempDir() {
    return mkdtempSync(join(tmpdir(), 'deploy-kit-test-'));
}
/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir) {
    try {
        rmSync(dir, { recursive: true, force: true });
    }
    catch (error) {
        // Silently ignore cleanup errors
    }
}
/**
 * Mock environment variables for testing
 */
export function withEnv(env, fn) {
    const originalEnv = { ...process.env };
    // Set new env vars
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
            delete process.env[key];
        }
        else {
            process.env[key] = value;
        }
    }
    try {
        return fn();
    }
    finally {
        // Restore original env vars
        for (const [key] of Object.entries(env)) {
            if (originalEnv[key] === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = originalEnv[key];
            }
        }
    }
}
/**
 * Assert that a value matches expected (with optional message)
 */
export function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}
/**
 * Assert strict equality
 */
export function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}
/**
 * Assert that a function throws an error
 */
export function assertThrows(fn, message) {
    try {
        fn();
        throw new Error(message || 'Expected function to throw');
    }
    catch (error) {
        // Expected
        if (error instanceof Error && error.message === (message || 'Expected function to throw')) {
            throw error; // Re-throw our assertion error
        }
        // Actual throw happened, which is good
    }
}
/**
 * Create a mock ProjectConfig for testing
 */
export function createMockProjectConfig(overrides) {
    return {
        projectName: 'test-project',
        displayName: 'Test Project',
        infrastructure: 'sst-serverless',
        database: 'dynamodb',
        stages: ['staging', 'production'],
        mainDomain: 'test.example.com',
        awsProfile: 'test-profile',
        requireCleanGit: false,
        runTestsBeforeDeploy: false,
        stageConfig: {
            staging: {
                domain: 'staging.test.example.com',
                requiresConfirmation: false,
                awsRegion: 'us-east-1',
            },
            production: {
                domain: 'test.example.com',
                requiresConfirmation: true,
                awsRegion: 'us-east-1',
            },
        },
        healthChecks: [],
        hooks: {},
        ...overrides,
    };
}
