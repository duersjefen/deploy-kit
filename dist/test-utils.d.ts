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
export declare function startTestServer(port?: number): Promise<TestServerInstance>;
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
export declare function startLocalstack(services?: string[]): Promise<LocalstackConfig>;
/**
 * Stop localstack container
 *
 * @returns Promise that resolves when cleanup is complete
 */
export declare function stopLocalstack(): Promise<void>;
//# sourceMappingURL=test-utils.d.ts.map