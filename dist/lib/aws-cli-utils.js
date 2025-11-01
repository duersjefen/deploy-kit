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
import { execSync } from 'child_process';
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
export function buildAwsEnv(profile, additionalEnv) {
    const env = {
        ...process.env,
        ...additionalEnv,
    };
    if (profile) {
        env.AWS_PROFILE = profile;
    }
    return env;
}
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
export function findCloudFrontDistributionByDomain(domain, profile, fields = ['Id', 'DomainName', 'Status']) {
    try {
        const fieldSpec = fields.join(',');
        const query = `DistributionList.Items[?DomainName=='${domain}'].{${fieldSpec}}`;
        const stdout = execSync(`aws cloudfront list-distributions --query "${query}" --output json`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr for cleaner output
        });
        const distributions = JSON.parse(stdout || '[]');
        return distributions.length > 0 ? distributions[0] : null;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to find CloudFront distribution for domain ${domain}: ${message}`);
    }
}
/**
 * Find a CloudFront distribution by distribution ID
 *
 * @param distributionId - CloudFront distribution ID
 * @param profile - AWS profile (optional)
 * @returns Distribution details or null if not found
 * @throws {Error} If AWS CLI call fails
 */
export function getCloudFrontDistribution(distributionId, profile) {
    try {
        const stdout = execSync(`aws cloudfront get-distribution-config --id ${distributionId} --output json`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const data = JSON.parse(stdout || '{}');
        return data.Distribution?.DistributionConfig || null;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get CloudFront distribution ${distributionId}: ${message}`);
    }
}
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
export function dynamoTableExists(tableName, profile) {
    try {
        const stdout = execSync(`aws dynamodb describe-table --table-name ${tableName} --query "Table.TableStatus" --output text`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const status = stdout.trim();
        return status === 'ACTIVE';
    }
    catch {
        return false;
    }
}
/**
 * Get AWS account ID
 *
 * @param profile - AWS profile (optional)
 * @returns AWS account ID
 * @throws {Error} If unable to determine account ID
 */
export function getAwsAccountId(profile) {
    try {
        const stdout = execSync(`aws sts get-caller-identity --query "Account" --output text`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        return stdout.trim();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get AWS account ID: ${message}`);
    }
}
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
export function getAwsRegion(profile) {
    const env = buildAwsEnv(profile);
    if (env.AWS_REGION) {
        return env.AWS_REGION;
    }
    try {
        const stdout = execSync(`aws configure get region`, {
            encoding: 'utf-8',
            env,
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const region = stdout.trim();
        return region || 'us-east-1';
    }
    catch {
        return 'us-east-1';
    }
}
/**
 * List all Route53 hosted zones
 *
 * @param profile - AWS profile (optional)
 * @returns Array of hosted zone objects with Id and Name
 * @throws {Error} If AWS CLI call fails
 */
export function listRoute53HostedZones(profile) {
    try {
        const stdout = execSync(`aws route53 list-hosted-zones --query "HostedZones[*].{Id:Id,Name:Name}" --output json`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        return JSON.parse(stdout || '[]');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list Route53 hosted zones: ${message}`);
    }
}
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
export function getAcmCertificateByDomain(domain, profile) {
    try {
        const stdout = execSync(`aws acm list-certificates --query "CertificateSummaryList[?DomainName=='${domain}'].{CertificateArn:CertificateArn,DomainName:DomainName,Status:Status}" --output json`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const certs = JSON.parse(stdout || '[]');
        return certs.length > 0 ? certs[0] : null;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get ACM certificate for domain ${domain}: ${message}`);
    }
}
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
export function hasAwsCredentials(profile) {
    try {
        execSync(`aws sts get-caller-identity`, {
            encoding: 'utf-8',
            env: buildAwsEnv(profile),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        return true;
    }
    catch {
        return false;
    }
}
