/**
 * AWS CLI Utility Module
 *
 * Centralizes repeated AWS CLI command patterns to reduce duplication
 * and improve consistency across the codebase.
 *
 * Benefits:
 * - Single source of truth for AWS interactions
 * - Consistent error handling for AWS failures
 * - Easy to mock for testing
 * - Profile handling centralized
 */
import type { CloudFrontDistribution } from './cloudfront/client.js';
/**
 * Build AWS environment variables for CLI execution
 *
 * @param profile - AWS profile name (optional)
 * @param additionalEnv - Additional environment variables to merge
 * @returns Environment object with AWS_PROFILE set if provided
 *
 * @example
 * ```typescript
 * const env = buildAwsEnv('production', { AWS_REGION: 'us-west-2' });
 * await execAsync('aws cloudfront list-distributions', { env });
 * ```
 */
export declare function buildAwsEnv(profile?: string | null, additionalEnv?: Record<string, string>): NodeJS.ProcessEnv;
/**
 * Find a CloudFront distribution by domain name
 *
 * Replaces duplicated AWS CLI calls in health checker and status checker.
 *
 * @param domain - Domain name to search for
 * @param profile - AWS profile (optional)
 * @param fields - Fields to retrieve (default: ['Id', 'DomainName', 'Status'])
 * @returns CloudFront distribution object or null if not found
 * @throws {Error} If AWS CLI call fails
 *
 * @example
 * ```typescript
 * const dist = await findCloudFrontDistributionByDomain('example.com', 'prod');
 * if (dist) {
 *   console.log(`Distribution ${dist.Id} is ${dist.Status}`);
 * }
 * ```
 */
export declare function findCloudFrontDistributionByDomain(domain: string, profile?: string | null, fields?: string[]): CloudFrontDistribution | null;
/**
 * Find a CloudFront distribution by distribution ID
 *
 * @param distributionId - CloudFront distribution ID
 * @param profile - AWS profile (optional)
 * @returns Distribution details or null if not found
 * @throws {Error} If AWS CLI call fails
 */
export declare function getCloudFrontDistribution(distributionId: string, profile?: string | null): CloudFrontDistribution | null;
/**
 * Check if a DynamoDB table exists
 *
 * @param tableName - DynamoDB table name
 * @param profile - AWS profile (optional)
 * @returns true if table exists and is active
 *
 * @example
 * ```typescript
 * if (await dynamoTableExists('my-app-table', 'prod')) {
 *   console.log('Table is ready');
 * }
 * ```
 */
export declare function dynamoTableExists(tableName: string, profile?: string | null): boolean;
/**
 * Get AWS account ID
 *
 * @param profile - AWS profile (optional)
 * @returns AWS account ID
 * @throws {Error} If unable to determine account ID
 */
export declare function getAwsAccountId(profile?: string | null): string;
/**
 * Get AWS region
 *
 * Resolves from:
 * 1. AWS_REGION environment variable
 * 2. AWS CLI configuration for profile
 * 3. Default: us-east-1
 *
 * @param profile - AWS profile (optional)
 * @returns AWS region
 */
export declare function getAwsRegion(profile?: string | null): string;
/**
 * List all Route53 hosted zones
 *
 * @param profile - AWS profile (optional)
 * @returns Array of hosted zone objects with Id and Name
 * @throws {Error} If AWS CLI call fails
 */
export declare function listRoute53HostedZones(profile?: string | null): Array<{
    Id: string;
    Name: string;
}>;
/**
 * Check if ACM certificate exists for domain
 *
 * @param domain - Domain name to search for
 * @param profile - AWS profile (optional)
 * @returns ACM certificate object or null if not found
 * @throws {Error} If AWS CLI call fails
 *
 * @example
 * ```typescript
 * const cert = getAcmCertificateByDomain('example.com', 'prod');
 * if (cert) {
 *   console.log(`Certificate ARN: ${cert.CertificateArn}`);
 * }
 * ```
 */
export declare function getAcmCertificateByDomain(domain: string, profile?: string | null): {
    CertificateArn: string;
    DomainName: string;
    Status: string;
} | null;
/**
 * Check if AWS credentials are available
 *
 * @param profile - AWS profile to check (optional)
 * @returns true if credentials are available
 *
 * @example
 * ```typescript
 * if (hasAwsCredentials('prod')) {
 *   console.log('Ready to deploy to production');
 * }
 * ```
 */
export declare function hasAwsCredentials(profile?: string | null): boolean;
//# sourceMappingURL=aws-cli-utils.d.ts.map