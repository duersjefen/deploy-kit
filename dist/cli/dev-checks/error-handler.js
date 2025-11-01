/**
 * SST Dev Error Handler
 * Translates cryptic SST errors into actionable guidance
 */
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
/**
 * Handle and provide guidance for common SST dev errors
 *
 * Converts technical error messages into user-friendly recovery steps
 * Parses .sst/log/sst.log for detailed error information
 */
export async function handleSstDevError(error, projectRoot) {
    const message = error.message.toLowerCase();
    // Try to read SST log file for more context
    const logContent = projectRoot ? readSstLogFile(projectRoot) : null;
    const detailedError = logContent ? parseErrorFromLog(logContent) : null;
    console.log(chalk.bold.red('🔍 Error Analysis:\n'));
    // Pattern 1: Pulumi Output Misuse
    if (message.includes('partition') && message.includes('not valid')) {
        console.log(chalk.red('❌ Pulumi Output Error Detected\n'));
        console.log(chalk.yellow('You\'re using Pulumi Outputs incorrectly in sst.config.ts\n'));
        console.log(chalk.bold('Common mistakes:'));
        console.log(chalk.red('  ❌ resources: [table.arn]'));
        console.log(chalk.green('  ✅ resources: [table.arn.apply(arn => arn)]\n'));
        console.log(chalk.red('  ❌ resources: [`${table.arn}/*`]'));
        console.log(chalk.green('  ✅ resources: [pulumi.interpolate`${table.arn}/*`]\n'));
        console.log(chalk.gray('Learn more: https://www.pulumi.com/docs/concepts/inputs-outputs\n'));
        return;
    }
    // Pattern 2: Recursive SST Dev Script
    if (message.includes('dev command for this process does not look right')) {
        console.log(chalk.red('❌ Recursive SST Dev Script Detected\n'));
        console.log(chalk.yellow('Your package.json has a dev script that calls SST:\n'));
        console.log(chalk.gray('This creates infinite recursion because SST runs'));
        console.log(chalk.gray('`npm run dev` internally to start your framework.\n'));
        console.log(chalk.bold('Fix:'));
        console.log(chalk.gray('  Separate SST from framework dev scripts:'));
        console.log(chalk.red('  ❌ "dev": "sst dev"'));
        console.log(chalk.green('  ✅ "dev": "next dev"              ← What SST calls'));
        console.log(chalk.green('  ✅ "sst:dev": "sst dev"           ← What you run\n'));
        console.log(chalk.gray('Then use: npm run sst:dev (or make dev)\n'));
        return;
    }
    // Pattern 3: Next.js Canary Features
    if (message.includes('can only be enabled when using the latest canary')) {
        const match = message.match(/"([^"]+)"/);
        const feature = match ? match[1] : 'Unknown feature';
        console.log(chalk.red('❌ Next.js Canary Feature Detected\n'));
        console.log(chalk.yellow(`Feature: ${feature}\n`));
        console.log(chalk.gray('You\'re using a stable Next.js version, but this feature'));
        console.log(chalk.gray('is only available in canary releases.\n'));
        console.log(chalk.bold('Options:'));
        console.log(chalk.gray('  1. Remove the feature from next.config (recommended)'));
        console.log(chalk.gray('  2. Upgrade to Next.js canary (unstable)\n'));
        console.log(chalk.gray('Run `npx deploy-kit dev` to auto-detect and fix\n'));
        return;
    }
    // Pattern 4: Concurrent Update / Lock
    if (message.includes('concurrent update') || message.includes('lock')) {
        console.log(chalk.yellow('🔧 Recovery Steps:'));
        console.log(chalk.gray('  1. Run: npx sst unlock'));
        console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
        return;
    }
    // Pattern 5: Port in Use
    if (message.includes('eaddrinuse') || message.includes('port')) {
        console.log(chalk.yellow('🔧 Recovery Steps:'));
        console.log(chalk.gray('  1. Kill port: lsof -ti:3000 | xargs kill -9'));
        console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
        return;
    }
    // Pattern 6: AWS Credentials
    if (message.includes('credentials') || message.includes('aws')) {
        console.log(chalk.yellow('🔧 Recovery Steps:'));
        console.log(chalk.gray('  1. Configure AWS: aws configure'));
        console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
        return;
    }
    // Show detailed error from log file if available
    if (detailedError) {
        console.log(chalk.red(`\n📋 Details from .sst/log/sst.log:`));
        console.log(chalk.gray(`   ${detailedError}\n`));
    }
    // Fallback: Clean SST State
    console.log(chalk.yellow('🔧 Try cleaning SST state:'));
    console.log(chalk.gray('  rm -rf .sst'));
    console.log(chalk.gray('  npx deploy-kit dev\n'));
    if (projectRoot && existsSync(join(projectRoot, '.sst', 'log', 'sst.log'))) {
        console.log(chalk.gray(`Full logs: ${join(projectRoot, '.sst', 'log', 'sst.log')}\n`));
    }
}
/**
 * Read SST log file if it exists
 */
function readSstLogFile(projectRoot) {
    const logPath = join(projectRoot, '.sst', 'log', 'sst.log');
    if (!existsSync(logPath)) {
        return null;
    }
    try {
        return readFileSync(logPath, 'utf-8');
    }
    catch (error) {
        return null;
    }
}
/**
 * Parse error messages from SST log content
 *
 * Looks for common error patterns in the log
 */
function parseErrorFromLog(logContent) {
    // Split into lines and get the last 50 lines (most recent)
    const lines = logContent.split('\n').slice(-50);
    // Look for error messages
    const errorPatterns = [
        /level=ERROR msg="([^"]+)"/,
        /error: (.+)/i,
        /Error: (.+)/,
        /Failed: (.+)/,
        /✖ (.+)/,
    ];
    for (const line of lines.reverse()) {
        for (const pattern of errorPatterns) {
            const match = line.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
    }
    return null;
}
