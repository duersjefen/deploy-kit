/**
 * Safe Error Handler for SST/Pulumi Deployments
 *
 * Addresses DEP-39: Pulumi's error formatter can cause RangeError when trying
 * to serialize large AWS SDK errors or errors with circular references.
 * This causes the actual error message to be completely masked.
 *
 * This module provides safe error formatting that:
 * - Truncates large strings to prevent "Invalid string length" errors
 * - Handles circular references gracefully
 * - Extracts useful information from AWS SDK errors
 * - Preserves stack traces (truncated to reasonable length)
 *
 * Related Issues:
 * - SST Issue #6141 (Oct 2025)
 * - Pulumi Issue #20567 (Sep 2025)
 *
 * @example
 * ```typescript
 * import { installGlobalErrorHandler, formatErrorSafely } from './safe-error-handler.js';
 *
 * // Install global handler (call once at CLI entry point)
 * installGlobalErrorHandler();
 *
 * // Or format errors manually
 * try {
 *   await sstDeploy();
 * } catch (error) {
 *   console.error(formatErrorSafely(error));
 * }
 * ```
 */

import util from 'util';
import chalk from 'chalk';

/**
 * Maximum lengths to prevent RangeError
 */
const MAX_STRING_LENGTH = 50000; // Well under Node.js limit of ~268M chars
const MAX_STACK_LINES = 50;
const MAX_DEPTH = 5;

/**
 * Safely format an error object for display
 *
 * Handles:
 * - Circular references (replaced with "[Circular]")
 * - Very deep object nesting (truncated at MAX_DEPTH)
 * - Large strings (truncated at MAX_STRING_LENGTH)
 * - Stack traces (limited to MAX_STACK_LINES)
 *
 * @param error - The error to format
 * @param options - Formatting options
 * @returns Formatted error string (never throws)
 */
export function formatErrorSafely(
  error: unknown,
  options: {
    maxLength?: number;
    maxStackLines?: number;
    maxDepth?: number;
    colorize?: boolean;
  } = {}
): string {
  const maxLength = options.maxLength ?? MAX_STRING_LENGTH;
  const maxStackLines = options.maxStackLines ?? MAX_STACK_LINES;
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const colorize = options.colorize ?? true;

  try {
    const parts: string[] = [];

    // Error type and constructor name
    if (error && typeof error === 'object') {
      const constructor = error.constructor?.name || 'Error';
      parts.push(colorize ? chalk.red(`${constructor}:`) : `${constructor}:`);
    }

    // Error message
    if (error instanceof Error) {
      const message = error.message || 'No message';
      const truncatedMessage = message.length > maxLength
        ? message.substring(0, maxLength) + '... [truncated]'
        : message;
      parts.push(truncatedMessage);

      // Stack trace (truncated)
      if (error.stack) {
        const stackLines = error.stack.split('\n');
        const relevantLines = stackLines.slice(0, maxStackLines);

        if (stackLines.length > maxStackLines) {
          relevantLines.push(`... [${stackLines.length - maxStackLines} more lines]`);
        }

        parts.push('');
        parts.push(colorize ? chalk.dim('Stack trace:') : 'Stack trace:');
        parts.push(relevantLines.join('\n'));
      }

      // Additional error properties (common in AWS SDK errors)
      const knownProps = ['name', 'message', 'stack', 'constructor'];
      const additionalProps = Object.keys(error).filter(key => !knownProps.includes(key));

      if (additionalProps.length > 0) {
        parts.push('');
        parts.push(colorize ? chalk.dim('Additional properties:') : 'Additional properties:');

        for (const key of additionalProps) {
          try {
            const value = (error as any)[key];
            const inspected = util.inspect(value, {
              depth: maxDepth,
              maxStringLength: 200,
              breakLength: Infinity,
              compact: true,
            });
            parts.push(`  ${key}: ${inspected}`);
          } catch {
            parts.push(`  ${key}: [Unable to serialize]`);
          }
        }
      }
    } else if (error && typeof error === 'object') {
      // Non-Error objects (e.g., thrown plain objects)
      try {
        const inspected = util.inspect(error, {
          depth: maxDepth,
          maxStringLength: maxLength,
          breakLength: Infinity,
          colors: colorize,
        });
        parts.push(inspected);
      } catch {
        parts.push('[Complex object - unable to serialize safely]');
      }
    } else {
      // Primitive values
      parts.push(String(error));
    }

    return parts.join('\n');
  } catch (formattingError) {
    // Last resort: If even safe formatting fails
    return `[Error formatting failed: ${String(error)}]`;
  }
}

/**
 * Extract actionable error messages from SST/Pulumi deployment errors
 *
 * Common error patterns:
 * - Missing SST secrets: "secret not found"
 * - AWS permission errors: "AccessDenied", "Forbidden"
 * - Pulumi state locked: "locked", "concurrent operation"
 * - CloudFront errors: "CNAMEAlreadyExists", "InvalidArgument"
 *
 * @param error - The error to analyze
 * @returns Actionable error message with fix suggestions
 */
export function extractActionableMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return formatErrorSafely(error);
  }

  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';
  const combined = message + ' ' + stack;

  // SST Secrets
  if (combined.includes('secret') && (combined.includes('not found') || combined.includes('missing'))) {
    return chalk.red('❌ SST Secret Not Found\n\n') +
      'One or more required secrets are not set.\n\n' +
      chalk.cyan('Fix:\n') +
      '1. List current secrets: pnpm sst secret list\n' +
      '2. Set missing secrets: pnpm sst secret set SecretName "value" --stage <stage>\n\n' +
      chalk.dim('Original error: ' + error.message.substring(0, 200));
  }

  // AWS Permissions
  if (combined.includes('accessdenied') || combined.includes('forbidden') || combined.includes('unauthorized')) {
    return chalk.red('❌ AWS Permission Denied\n\n') +
      'Your AWS credentials lack necessary permissions.\n\n' +
      chalk.cyan('Fix:\n') +
      '1. Verify AWS profile: aws sts get-caller-identity\n' +
      '2. Check IAM policies for required permissions\n' +
      '3. Ensure profile matches project: export AWS_PROFILE=<project-name>\n\n' +
      chalk.dim('Original error: ' + error.message.substring(0, 200));
  }

  // Pulumi State Lock
  if (combined.includes('locked') || combined.includes('concurrent')) {
    return chalk.red('❌ Pulumi State Locked\n\n') +
      'Another deployment is in progress, or a previous deployment crashed.\n\n' +
      chalk.cyan('Fix:\n') +
      '1. Check active deployments: npx sst status\n' +
      '2. If no deployment is running: npx deploy-kit recover <stage>\n' +
      '3. Or manually: pulumi cancel --stack <project>-<stage>\n\n' +
      chalk.dim('Original error: ' + error.message.substring(0, 200));
  }

  // CloudFront CNAME Conflicts
  if (combined.includes('cname') && combined.includes('already')) {
    return chalk.red('❌ CloudFront CNAME Conflict\n\n') +
      'The custom domain is already associated with another CloudFront distribution.\n\n' +
      chalk.cyan('Fix:\n') +
      '1. Run: npx deploy-kit cloudfront audit\n' +
      '2. Clean up orphaned distributions: npx deploy-kit cloudfront cleanup\n' +
      '3. Or add override: true in sst.config.ts domain configuration\n\n' +
      chalk.dim('Original error: ' + error.message.substring(0, 200));
  }

  // Default: Return safely formatted error
  return formatErrorSafely(error, { colorize: true });
}

/**
 * Install global error handlers to catch unhandled rejections and exceptions
 *
 * Prevents Pulumi's error formatter from masking errors with RangeError.
 * Should be called once at the CLI entry point (src/cli.ts).
 *
 * @param options - Handler options
 *
 * @example
 * ```typescript
 * // In src/cli.ts (before any other imports)
 * import { installGlobalErrorHandler } from './lib/safe-error-handler.js';
 * installGlobalErrorHandler({ exitOnError: true });
 * ```
 */
export function installGlobalErrorHandler(options: {
  exitOnError?: boolean;
  logToFile?: string;
  verbose?: boolean;
} = {}): void {
  const exitOnError = options.exitOnError ?? true;
  const verbose = options.verbose ?? false;

  // Handle unhandled promise rejections (most SST/Pulumi errors)
  process.on('unhandledRejection', (reason, promise) => {
    console.error('\n' + chalk.red('═'.repeat(80)));
    console.error(chalk.red.bold('🔴 UNHANDLED PROMISE REJECTION (Error caught before Pulumi formatter)\n'));

    if (verbose) {
      console.error(chalk.dim('Promise:'), promise);
    }

    // Try to extract actionable message first
    const actionableMessage = extractActionableMessage(reason);
    console.error(actionableMessage);

    console.error(chalk.red('═'.repeat(80)) + '\n');

    if (options.logToFile) {
      try {
        const fs = require('fs');
        const timestamp = new Date().toISOString();
        const logEntry = `\n[${timestamp}] Unhandled Rejection:\n${formatErrorSafely(reason, { colorize: false })}\n`;
        fs.appendFileSync(options.logToFile, logEntry);
      } catch {
        // Ignore logging errors
      }
    }

    if (exitOnError) {
      process.exit(1);
    }
  });

  // Handle uncaught exceptions (fallback)
  process.on('uncaughtException', (error, origin) => {
    console.error('\n' + chalk.red('═'.repeat(80)));
    console.error(chalk.red.bold('🔴 UNCAUGHT EXCEPTION\n'));

    if (verbose) {
      console.error(chalk.dim('Origin:'), origin);
    }

    console.error(formatErrorSafely(error, { colorize: true }));
    console.error(chalk.red('═'.repeat(80)) + '\n');

    if (options.logToFile) {
      try {
        const fs = require('fs');
        const timestamp = new Date().toISOString();
        const logEntry = `\n[${timestamp}] Uncaught Exception:\n${formatErrorSafely(error, { colorize: false })}\n`;
        fs.appendFileSync(options.logToFile, logEntry);
      } catch {
        // Ignore logging errors
      }
    }

    if (exitOnError) {
      process.exit(1);
    }
  });

  // Log that handlers are installed (only in verbose mode)
  if (verbose) {
    console.log(chalk.green('✅ Global error handlers installed (DEP-39 mitigation active)\n'));
  }
}

/**
 * Check if an error is the RangeError caused by Pulumi's error formatter
 *
 * Symptoms:
 * - Error name is "RangeError"
 * - Message contains "Invalid string length"
 * - Stack includes Pulumi's error formatting code
 *
 * @param error - The error to check
 * @returns true if this is a Pulumi RangeError
 */
export function isPulumiRangeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name !== 'RangeError') {
    return false;
  }

  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  return (
    message.includes('invalid string length') &&
    (stack.includes('pulumi') || stack.includes('node:buffer') || stack.includes('stringify'))
  );
}
