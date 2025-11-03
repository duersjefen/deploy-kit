/**
 * SST Dev Error Handler
 * Translates cryptic SST errors into actionable guidance
 *
 * UX Improvements (v2.7.0) - Lock Error Handling:
 * - Interactive recovery for "concurrent update" / lock errors
 * - Automatic stage detection from .sst directory
 * - Contextual explanation of lock cause
 * - Non-interactive mode support (falls back to manual instructions)
 *
 * BEFORE:
 * 🔧 Recovery Steps:
 *   1. Run: npx sst unlock
 *   2. Retry: npx deploy-kit dev
 *
 * AFTER:
 * 🔒 SST Lock Detected
 *
 * The deployment is locked (usually from a previous session that didn't exit cleanly).
 *
 * Stage: staging
 * Lock Type: Pulumi state lock
 * Likely Cause: Previous 'npx deploy-kit dev' or 'sst dev' crashed
 *
 * 🔧 Auto-Recovery Available:
 *   Would you like to automatically unlock? [Y/n]: _
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { promptYesNo } from '../../lib/prompt.js';

/**
 * Handle and provide guidance for common SST dev errors
 *
 * Converts technical error messages into user-friendly recovery steps
 * Parses .sst/log/sst.log for detailed error information
 */
export async function handleSstDevError(error: Error, projectRoot?: string): Promise<void> {
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
    console.log(chalk.gray('your dev script internally to start your framework.\n'));
    console.log(chalk.bold('Fix:'));
    console.log(chalk.gray('  Separate SST from framework dev scripts:'));
    console.log(chalk.red('  ❌ "dev": "sst dev"'));
    console.log(chalk.green('  ✅ "dev": "next dev"              ← What SST calls'));
    console.log(chalk.green('  ✅ "sst:dev": "sst dev"           ← What you run\n'));
    console.log(chalk.gray('Then use: [package-manager] run sst:dev (or make dev)\n'));
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
    await handleLockError(projectRoot);
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
function readSstLogFile(projectRoot: string): string | null {
  const logPath = join(projectRoot, '.sst', 'log', 'sst.log');

  if (!existsSync(logPath)) {
    return null;
  }

  try {
    return readFileSync(logPath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * Parse error messages from SST log content
 *
 * Looks for common error patterns in the log
 */
function parseErrorFromLog(logContent: string): string | null {
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

/**
 * Handle SST lock errors with interactive recovery
 *
 * Provides context about the lock and offers automatic unlock with user confirmation
 */
async function handleLockError(projectRoot?: string): Promise<void> {
  console.log(chalk.bold.yellow('\n🔒 SST Lock Detected\n'));
  console.log(chalk.gray('The deployment is locked (usually from a previous session that didn\'t exit cleanly).\n'));

  // Detect which stage is locked
  const lockedStage = detectLockedStage(projectRoot);
  if (lockedStage) {
    console.log(chalk.gray(`Stage: ${chalk.white(lockedStage)}`));
  }

  console.log(chalk.gray('Lock Type: Pulumi state lock'));
  console.log(chalk.gray('Likely Cause: Previous \'npx deploy-kit dev\' or \'sst dev\' crashed\n'));

  // Check if we're in non-interactive mode
  if (process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true' || !process.stdin.isTTY) {
    console.log(chalk.yellow('🔧 Non-interactive mode: Manual unlock required'));
    console.log(chalk.gray('  Run: npx sst unlock' + (lockedStage ? ` --stage ${lockedStage}` : '')));
    console.log(chalk.gray('  Then retry: npx deploy-kit dev\n'));
    return;
  }

  // Ask user if they want to auto-unlock
  console.log(chalk.bold.cyan('🔧 Auto-Recovery Available:'));
  const shouldUnlock = await promptYesNo('  Would you like to automatically unlock?', true);

  if (shouldUnlock) {
    console.log(chalk.gray('\n⏳ Unlocking...'));

    try {
      const unlockCmd = lockedStage
        ? `npx sst unlock --stage ${lockedStage}`
        : 'npx sst unlock';

      execSync(unlockCmd, {
        cwd: projectRoot || process.cwd(),
        stdio: 'pipe', // Suppress output
      });

      console.log(chalk.green('✅ Lock cleared successfully!\n'));
      console.log(chalk.gray('You can now retry: npx deploy-kit dev\n'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Auto-unlock failed\n'));
      console.log(chalk.gray('Manual steps:'));
      console.log(chalk.gray('  1. npx sst unlock' + (lockedStage ? ` --stage ${lockedStage}` : '')));
      console.log(chalk.gray('  2. npx deploy-kit dev\n'));
    }
  } else {
    console.log(chalk.gray('\n📋 Manual unlock steps:'));
    console.log(chalk.gray('  1. npx sst unlock' + (lockedStage ? ` --stage ${lockedStage}` : '')));
    console.log(chalk.gray('  2. npx deploy-kit dev\n'));
  }
}

/**
 * Detect which SST stage is locked by checking SST directory
 *
 * @param projectRoot - Root directory of the project
 * @returns The locked stage name or null if cannot be determined
 */
function detectLockedStage(projectRoot?: string): string | null {
  if (!projectRoot) {
    return null;
  }

  try {
    const sstDir = join(projectRoot, '.sst');
    if (!existsSync(sstDir)) {
      return null;
    }

    // Check for lock file that might contain stage info
    const lockPath = join(sstDir, 'lock');
    if (existsSync(lockPath)) {
      // Try to read stage from lock file or SST directory structure
      // SST typically creates .sst/stage-name directories
      const fs = require('fs');
      const sstContents = fs.readdirSync(sstDir);

      // Look for common stage names
      const commonStages = ['staging', 'production', 'dev', 'prod', 'development'];
      for (const stage of commonStages) {
        if (sstContents.includes(stage)) {
          return stage;
        }
      }
    }
  } catch {
    // Ignore errors, just return null
  }

  return null;
}
