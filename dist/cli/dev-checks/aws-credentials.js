/**
 * AWS Credentials Check
 * Validates AWS credentials are configured and accessible
 */
import chalk from 'chalk';
import { execSync } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
export function createAwsCredentialsCheck(projectRoot, config) {
    return async () => {
        console.log(chalk.gray('🔍 Checking AWS credentials...'));
        try {
            const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;
            const profileArg = profile ? `--profile ${profile}` : '';
            const result = execSync(`aws sts get-caller-identity ${profileArg}`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const identity = JSON.parse(result);
            const profileInfo = profile ? ` (profile: ${profile})` : ' (default profile)';
            console.log(chalk.green(`✅ AWS credentials valid${profileInfo}`));
            console.log(chalk.gray(`   Account: ${identity.Account}\n`));
            return { passed: true };
        }
        catch (error) {
            return {
                passed: false,
                issue: 'AWS credentials not configured',
                manualFix: 'Run: aws configure',
            };
        }
    };
}
