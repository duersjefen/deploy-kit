/**
 * Mock utilities for testing
 * Provides pre-configured mocks for AWS services and deployment components
 */
/**
 * Creates a mock CloudFront service for testing
 *
 * @example
 * const mockCloudFront = createMockCloudFrontService({
 *   invalidateCache: async () => ({ invalidationId: 'I999', status: 'Completed' }),
 * });
 */
export function createMockCloudFrontService(overrides) {
    return {
        listDistributions: async () => [
            {
                id: 'E123',
                domainName: 'd123.cloudfront.net',
                status: 'Deployed',
                enabled: true,
            },
        ],
        getDistribution: async (id) => ({
            id,
            domainName: 'd123.cloudfront.net',
            origins: [{ domainName: 'bucket.s3.amazonaws.com' }],
        }),
        invalidateCache: async (_, paths) => ({
            invalidationId: 'I123',
            status: 'InProgress',
        }),
        ...overrides,
    };
}
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
export function createMockRoute53Service(overrides) {
    return {
        listHostedZones: async () => [
            { id: 'Z123', name: 'example.com', recordCount: 10 },
        ],
        listRecordSets: async () => [
            { name: 'example.com', type: 'A', value: '1.2.3.4', ttl: 300 },
        ],
        getDNSRecordsForDomain: async (domain) => [
            { name: domain, type: 'A', value: '1.2.3.4', ttl: 300 },
        ],
        ...overrides,
    };
}
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
export function createMockDeploymentService(overrides) {
    return {
        deploy: async () => {
            // Mock deployment
        },
        verifyHealth: async () => true,
        rollback: async () => {
            // Mock rollback
        },
        ...overrides,
    };
}
/**
 * Creates a mock DNS record for testing
 *
 * @example
 * const record = createMockDNSRecord({
 *   name: 'staging.example.com',
 *   value: 'd123.cloudfront.net',
 * });
 */
export function createMockDNSRecord(overrides) {
    return {
        name: 'example.com',
        type: 'A',
        value: '1.2.3.4',
        ttl: 300,
        ...overrides,
    };
}
