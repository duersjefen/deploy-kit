/**
 * Pattern Violation Formatter (DEP-30)
 *
 * Formats pattern violations for display with rich error messages
 * including error codes, fixes, and documentation links.
 */

import chalk from 'chalk';
import type { PatternViolation, PatternDetectionResult } from './types.js';
import { getErrorInfo } from './error-catalog.js';

/**
 * Format pattern violations for display
 */
export function formatPatternViolations(violations: PatternViolation[]): string {
  if (violations.length === 0) {
    return '';
  }

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  let output = '';

  if (errors.length > 0) {
    output += chalk.bold.red(`\n❌ SST Pattern Errors (${errors.length}):\n`);
    for (const error of errors) {
      output += formatViolation(error);
    }
  }

  if (warnings.length > 0) {
    output += chalk.bold.yellow(`\n⚠️  SST Pattern Warnings (${warnings.length}):\n`);
    for (const warning of warnings) {
      output += formatViolation(warning);
    }
  }

  return output;
}

/**
 * Format a single violation
 */
function formatViolation(violation: PatternViolation): string {
  let output = '\n';

  // Header with error code and location
  output += chalk.bold(`  [${violation.code}] ${violation.resource}`);
  if (violation.line) {
    output += chalk.gray(` (line ${violation.line}${violation.column ? `:${violation.column}` : ''})`);
  }
  output += '\n';

  // Message
  output += `  ${violation.message}\n`;

  // Fix suggestion
  if (violation.fix) {
    const confidence = getConfidenceEmoji(violation.fix.confidence);
    output += chalk.cyan(`\n  ${confidence} Suggested Fix (${violation.fix.confidence} confidence):\n`);
    output += chalk.red(`    - ${violation.fix.oldCode}\n`);
    output += chalk.green(`    + ${violation.fix.newCode}\n`);
  }

  // Documentation link
  if (violation.docsUrl) {
    output += chalk.gray(`\n  📚 Docs: ${violation.docsUrl}\n`);
  }

  // Related error codes
  if (violation.relatedCodes && violation.relatedCodes.length > 0) {
    output += chalk.gray(`  🔗 Related: ${violation.relatedCodes.join(', ')}\n`);
  }

  return output;
}

/**
 * Get emoji for confidence level
 */
function getConfidenceEmoji(confidence: string): string {
  switch (confidence) {
    case 'high':
      return '🟢';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔴';
    default:
      return '⚪';
  }
}

/**
 * Format pattern detection result summary
 */
export function formatPatternDetectionSummary(result: PatternDetectionResult): string {
  let output = '\n';
  output += chalk.bold('═'.repeat(70)) + '\n';
  output += chalk.bold('  SST Pattern Detection Summary\n');
  output += chalk.bold('═'.repeat(70)) + '\n\n';

  output += `  Total Issues: ${result.violations.length}\n`;
  output += `  ${chalk.red('Errors')}: ${result.errorCount}\n`;
  output += `  ${chalk.yellow('Warnings')}: ${result.warningCount}\n`;
  output += `  ${chalk.green('Auto-fixable')}: ${result.autoFixableCount}\n`;
  output += `  ${chalk.gray(`Duration: ${result.duration}ms`)}\n`;

  return output;
}

/**
 * Format pattern violations grouped by category
 */
export function formatPatternViolationsByCategory(
  violationsByCategory: Map<string, PatternViolation[]>
): string {
  let output = '';

  for (const [category, violations] of violationsByCategory.entries()) {
    output += chalk.bold.cyan(`\n\n${formatCategoryName(category)} (${violations.length}):\n`);
    output += chalk.gray('─'.repeat(70)) + '\n';
    output += formatPatternViolations(violations);
  }

  return output;
}

/**
 * Format category name for display
 */
function formatCategoryName(category: string): string {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format error catalog entry for violation
 */
export function formatViolationWithCatalog(violation: PatternViolation): string {
  let output = formatViolation(violation);

  const catalogEntry = getErrorInfo(violation.code);
  if (catalogEntry) {
    output += chalk.gray('\n  ═══ Error Details ═══\n');
    output += chalk.gray(`  ${catalogEntry.description}\n`);
    output += chalk.gray(`\n  Root Cause: ${catalogEntry.rootCause}\n`);

    if (catalogEntry.badExample) {
      output += chalk.red('\n  ❌ Incorrect:\n');
      output += catalogEntry.badExample.split('\n').map(l => chalk.gray(`    ${l}`)).join('\n') + '\n';
    }

    if (catalogEntry.goodExample) {
      output += chalk.green('\n  ✅ Correct:\n');
      output += catalogEntry.goodExample.split('\n').map(l => chalk.gray(`    ${l}`)).join('\n') + '\n';
    }
  }

  return output;
}

/**
 * Format quick summary for CLI output
 */
export function formatQuickSummary(result: PatternDetectionResult): string {
  if (result.violations.length === 0) {
    return chalk.green('✅ No pattern issues detected');
  }

  const parts = [];
  if (result.errorCount > 0) {
    parts.push(chalk.red(`${result.errorCount} error${result.errorCount > 1 ? 's' : ''}`));
  }
  if (result.warningCount > 0) {
    parts.push(chalk.yellow(`${result.warningCount} warning${result.warningCount > 1 ? 's' : ''}`));
  }

  let summary = `⚠️  ${parts.join(', ')}`;

  if (result.autoFixableCount > 0) {
    summary += chalk.gray(` (${result.autoFixableCount} auto-fixable)`);
  }

  return summary;
}
