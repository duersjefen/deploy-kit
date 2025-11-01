/**
 * Mock utilities for testing
 * Provides pre-configured mocks for AWS services and deployment components
 */
import type { ICloudFrontService, IRoute53Service, IDeploymentService } from './lib/interfaces.js';
import type { DNSRecord } from './types.js';
/**
 * Creates a mock CloudFront service for testing
 *
 * @example
 * const mockCloudFront = createMockCloudFrontService({
 *   invalidateCache: async () => ({ invalidationId: 'I999', status: 'Completed' }),
 * });
 */
export declare function createMockCloudFrontService(overrides?: Partial<ICloudFrontService>): ICloudFrontService;
/**
 * Creates a mock Route53 service for testing
 *
 * @example
 * const mockRoute53 = createMockRoute53Service({
 *   getDNSRecordsForDomain: async (domain) => [
 *     { name: domain, type: 'A', value: '1.2.3.4', ttl: 300 },
 *   ],
 * });
 */
export declare function createMockRoute53Service(overrides?: Partial<IRoute53Service>): IRoute53Service;
/**
 * Creates a mock deployment service for testing
 *
 * @example
 * const mockDeployer = createMockDeploymentService({
 *   deploy: async () => {
 *     console.log('Mock deployment executed');
 *   },
 * });
 */
export declare function createMockDeploymentService(overrides?: Partial<IDeploymentService>): IDeploymentService;
/**
 * Creates a mock DNS record for testing
 *
 * @example
 * const record = createMockDNSRecord({
 *   name: 'staging.example.com',
 *   value: 'd123.cloudfront.net',
 * });
 */
export declare function createMockDNSRecord(overrides?: Partial<DNSRecord>): DNSRecord;
//# sourceMappingURL=test-mocks.d.ts.map