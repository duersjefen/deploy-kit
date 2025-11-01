/**
 * Sophisticated error handling and recovery suggestions
 * Provides intelligent guidance for common deployment issues
 */
import chalk from 'chalk';
/**
 * Common deployment errors with recovery suggestions
 */
const ERROR_RECOVERY_GUIDE = {
    'Certificate.*in use': {
        suggestion: 'ACM certificate is referenced by orphaned CloudFront distribution',
        steps: [
            'This typically happens when previous deployments left orphaned distributions',
            'Run: npx deploy-kit recover <stage>',
            'Then retry: npx deploy-kit deploy <stage>',
            'If problem persists, manually delete orphaned distributions in AWS CloudFront',
        ],
    },
    'git status.*uncommitted': {
        suggestion: 'You have uncommitted changes in your repository',
        steps: [
            'Commit your changes: git add . && git commit -m "your message"',
            'Or stash temporarily: git stash',
            'Then retry deployment',
        ],
    },
    'AWS credentials.*invalid': {
        suggestion: 'AWS credentials are not configured or expired',
        steps: [
            'Verify AWS credentials: aws sts get-caller-identity',
            'Check AWS_PROFILE environment variable: echo $AWS_PROFILE',
            'Re-authenticate if needed: aws sso login --profile <profile>',
            'Then retry deployment',
        ],
    },
    'Tests.*failed': {
        suggestion: 'One or more tests are failing',
        steps: [
            'Run tests locally: npm test',
            'Fix failing tests before deploying',
            'Verify all tests pass: npm test -- --coverage',
            'Then retry deployment',
        ],
    },
    'Build.*failed': {
        suggestion: 'Application build failed',
        steps: [
            'Run build locally: npm run build',
            'Review error messages in build output',
            'Fix build errors and commit changes',
            'Then retry deployment',
        ],
    },
    'CloudFront.*403': {
        suggestion: 'CloudFront cannot access S3 origin',
        steps: [
            'This is normal immediately after deployment (5-15 min propagation)',
            'Wait 5-10 minutes for CloudFront to propagate globally',
            'Test again: curl -I https://your-domain.com',
            'If still failing after 15 min, check S3 bucket policy and OAC settings',
        ],
    },
    'Timeout': {
        suggestion: 'Deployment took too long and timed out',
        steps: [
            'Large deployments can take 10-15 minutes',
            'Check deployment logs: npx sst logs --stage <stage>',
            'Verify AWS resources are being created: aws cloudformation describe-stacks',
            'Retry deployment: npx deploy-kit deploy <stage>',
        ],
    },
};
/**
 * Find best matching recovery suggestion for an error
 */
function findRecoverySuggestion(errorMessage) {
    for (const [pattern, guide] of Object.entries(ERROR_RECOVERY_GUIDE)) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(errorMessage)) {
            return guide;
        }
    }
    return null;
}
/**
 * Print sophisticated error message with recovery suggestions
 */
export function printErrorWithSuggestions(context) {
    const { stage, command, error, timestamp } = context;
    console.log('\n' + chalk.bold.red('═'.repeat(70)));
    console.log(chalk.bold.red('❌ DEPLOYMENT ERROR'));
    console.log(chalk.bold.red('═'.repeat(70)));
    console.log('\n📋 Error Details:');
    console.log(chalk.red(`  Command: ${command}`));
    console.log(chalk.red(`  Stage: ${stage}`));
    console.log(chalk.red(`  Time: ${timestamp.toLocaleTimeString()}`));
    console.log(chalk.red(`  Message: ${error.message}`));
    // Find and suggest recovery
    const recovery = findRecoverySuggestion(error.message);
    if (recovery) {
        console.log('\n💡 Likely Cause:');
        console.log(chalk.yellow(`  ${recovery.suggestion}`));
        console.log('\n🔧 Recovery Steps:');
        recovery.steps.forEach((step, index) => {
            console.log(chalk.cyan(`  ${index + 1}. ${step}`));
        });
    }
    else {
        console.log('\n💡 Generic Recovery:');
        console.log(chalk.yellow('  1. Review the error message above'));
        console.log(chalk.yellow('  2. Fix the underlying issue'));
        console.log(chalk.yellow('  3. Retry deployment'));
    }
    console.log('\n📚 Need More Help?');
    console.log(chalk.gray('  • Check logs: npx deploy-kit logs --stage ' + stage));
    console.log(chalk.gray('  • Check status: npx deploy-kit status'));
    console.log(chalk.gray('  • Force recovery: npx deploy-kit recover ' + stage));
    console.log(chalk.gray('  • Read docs: https://github.com/duersjefen/deploy-kit'));
    console.log('\n');
}
/**
 * Print pre-deployment validation error
 */
export function printValidationError(issue, suggestion) {
    console.log('\n' + chalk.bold.yellow('⚠️  PRE-DEPLOYMENT VALIDATION FAILED'));
    console.log(chalk.bold.yellow('═'.repeat(70)));
    console.log(chalk.yellow(`\nIssue: ${issue}`));
    console.log(chalk.gray(`\nSuggestion: ${suggestion}`));
    console.log('\n');
}
/**
 * Print deployment success with metrics
 */
export function printDeploymentSuccess(stage, duration, metrics) {
    console.log('\n' + chalk.bold.green('═'.repeat(70)));
    console.log(chalk.bold.green('✨ DEPLOYMENT SUCCESSFUL'));
    console.log(chalk.bold.green('═'.repeat(70)));
    console.log('\n🎉 Deployment Summary:');
    console.log(chalk.green(`  Stage: ${stage}`));
    console.log(chalk.green(`  Duration: ${duration}s`));
    console.log(chalk.green(`  Status: All checks passed ✅`));
    if (metrics) {
        if (metrics.checksRun) {
            console.log(chalk.cyan(`  Safety Checks: ${metrics.checksRun} passed`));
        }
        if (metrics.cacheInvalidated) {
            console.log(chalk.cyan(`  Cache: Invalidated`));
        }
    }
    console.log('\n🚀 Application is live and ready!');
    console.log(chalk.gray('  Next steps:'));
    console.log(chalk.gray(`  • Verify: npx deploy-kit health ${stage}`));
    console.log(chalk.gray(`  • View logs: npx deploy-kit logs --stage ${stage}`));
    console.log(chalk.gray('  • Check status: npx deploy-kit status\n'));
}
