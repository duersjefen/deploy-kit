/**
 * Shared test utilities for deploy-kit
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ProjectConfig } from './types.js';

/**
 * Create a temporary directory for testing
 * Automatically cleans up after tests complete
 */
export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'deploy-kit-test-'));
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    // Silently ignore cleanup errors
  }
}

/**
 * Mock environment variables for testing
 */
export function withEnv(env: Record<string, string>, fn: () => void | Promise<void>): void | Promise<void> {
  const originalEnv = { ...process.env };
  
  // Set new env vars
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  
  try {
    return fn();
  } finally {
    // Restore original env vars
    for (const [key] of Object.entries(env)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }
}

/**
 * Assert that a value matches expected (with optional message)
 */
export function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Assert strict equality
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
    );
  }
}

/**
 * Assert that a function throws an error
 */
export function assertThrows(fn: () => void, message?: string): void {
  try {
    fn();
    throw new Error(message || 'Expected function to throw');
  } catch (error) {
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
export function createMockProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig {
  return {
    projectName: 'test-project',
    displayName: 'Test Project',
    infrastructure: 'sst-serverless' as const,
    database: 'dynamodb' as const,
    stages: ['staging', 'production'] as const,
    mainDomain: 'test.example.com',
    awsProfile: 'test-profile',
    requireCleanGit: false,
    runTestsBeforeDeploy: false,
    stageConfig: {
      staging: {
        domain: 'staging.test.example.com',
        requiresConfirmation: false,
        awsRegion: 'us-east-1',
        skipHealthChecks: false,
        skipCacheInvalidation: false,
      },
      production: {
        domain: 'test.example.com',
        requiresConfirmation: true,
        awsRegion: 'us-east-1',
        skipHealthChecks: false,
        skipCacheInvalidation: false,
      },
    },
    healthChecks: [],
    hooks: {},
    ...overrides,
  };
}


/**
 * Test server interface for health check testing
 */
export interface TestServerInstance {
  setResponse(status: number, body: string): void;
  setDelay(ms: number): void;
  close(): Promise<void>;
  getPort(): number;
}

/**
 * Start a local HTTP test server for health check integration tests
 * 
 * @param port - Port to listen on (0 = auto-assign)
 * @returns Server instance with methods to control responses
 * 
 * @example
 * ```typescript
 * const server = await startTestServer(8888);
 * server.setResponse(200, 'OK');
 * // Server is ready for health checks
 * ```
 */
export async function startTestServer(port: number = 0): Promise<TestServerInstance> {
  const { createServer } = await import('http');
  
  let response = { status: 200, body: 'OK' };
  let delay = 0;
  let actualPort = 0;
  
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(response.status, { 'Content-Type': 'text/plain' });
      res.end(response.body);
    }, delay);
  });
  
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address();
      actualPort = typeof addr === 'object' ? addr?.port || 0 : 0;
      
      resolve({
        setResponse: (status: number, body: string) => {
          response = { status, body };
        },
        setDelay: (ms: number) => {
          delay = ms;
        },
        close: () => {
          return new Promise((resolve) => {
            server.close(() => resolve());
          });
        },
        getPort: () => actualPort,
      });
    });
    
    server.on('error', reject);
  });
}

/**
 * Localstack testing configuration
 */
export interface LocalstackConfig {
  endpoint: string;
  port: number;
  services: string[];
}

/**
 * Start localstack container for integration testing
 * 
 * Note: Requires Docker to be installed and running.
 * For CI/CD environments, consider using pre-built localstack images.
 * 
 * Supported services:
 * - cloudfront: CloudFront distribution API
 * - acm: SSL certificates
 * - route53: DNS records
 * - s3: Object storage
 * - ssm: Parameter store
 * 
 * @param services - List of AWS services to emulate
 * @returns Localstack configuration object
 * 
 * @throws {Error} If Docker is not available or container fails to start
 * 
 * @example
 * ```typescript
 * const config = await startLocalstack(['cloudfront', 'acm']);
 * // AWS SDK will use config.endpoint
 * process.env.AWS_ENDPOINT_URL = config.endpoint;
 * ```
 */
export async function startLocalstack(services: string[] = ['cloudfront', 'acm', 'route53']): Promise<LocalstackConfig> {
  // For now, return a mock config that points to localhost
  // In a real implementation, this would start a Docker container
  // For CI/CD, Docker should already have localstack running
  
  const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  const port = parseInt(endpoint.split(':').pop() || '4566', 10);
  
  // In integration testing, we assume localstack is already running
  // This could be started via docker-compose or GitHub Actions service
  return {
    endpoint,
    port,
    services,
  };
}

/**
 * Stop localstack container
 * 
 * @returns Promise that resolves when cleanup is complete
 */
export async function stopLocalstack(): Promise<void> {
  // Cleanup handled by Docker or test runner
  // This is a placeholder for future docker-compose integration
}
