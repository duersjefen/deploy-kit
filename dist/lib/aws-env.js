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
export function createAWSEnv(options) {
    const env = { ...process.env };
    if (options.profile) {
        env.AWS_PROFILE = options.profile;
    }
    if (options.region) {
        env.AWS_REGION = options.region;
    }
    if (options.additionalVars) {
        Object.assign(env, options.additionalVars);
    }
    return env;
}
/**
 * Validates that required AWS credentials are available
 *
 * @throws {Error} If credentials are not configured
 */
export function validateAWSCredentials(profile) {
    if (profile && !process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
        throw new Error(`AWS profile "${profile}" specified but no AWS credentials found. ` +
            `Please run "aws configure --profile ${profile}" or set AWS_ACCESS_KEY_ID.`);
    }
}
