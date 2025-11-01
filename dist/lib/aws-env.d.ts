/**
 * Creates an environment object with AWS credentials configured
 *
 * @param options - AWS configuration options
 * @returns Environment object ready for child_process.spawn/exec
 *
 * @example
 * const env = createAWSEnv({ profile: 'production', region: 'us-east-1' });
 * execSync('aws s3 ls', { env });
 */
export declare function createAWSEnv(options: {
    profile?: string;
    region?: string;
    additionalVars?: Record<string, string>;
}): NodeJS.ProcessEnv;
/**
 * Validates that required AWS credentials are available
 *
 * @throws {Error} If credentials are not configured
 */
export declare function validateAWSCredentials(profile?: string): void;
//# sourceMappingURL=aws-env.d.ts.map