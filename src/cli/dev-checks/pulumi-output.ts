/**
 * Pulumi Output Misuse Check
 * Detects incorrect usage of Pulumi Outputs in sst.config.ts
 *
 * Common mistakes:
 * - Using Outputs directly in arrays without .apply()
 * - Using Outputs in template literals without pulumi.interpolate
 *
 * These cause the infamous "Partition 1 is not valid" error.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

interface PulumiIssue {
  line: number;
  pattern: string;
  code: string;
  suggestion: string;
}

/**
 * Scan sst.config.ts for common Pulumi Output misuse patterns
 */
function detectPulumiIssues(content: string): PulumiIssue[] {
  const lines = content.split('\n');
  const issues: PulumiIssue[] = [];

  lines.forEach((line, index) => {
    // Pattern 1: Direct Output in array without .apply()
    // Example: resources: [table.arn] or resources: [table.arn, ...]
    if (/resources:\s*\[.*?\.(arn|name|id)/.test(line)) {
      if (!line.includes('.apply(')) {
        issues.push({
          line: index + 1,
          pattern: 'direct_output_in_array',
          code: line.trim(),
          suggestion: 'Use .apply() to unwrap: table.arn.apply(arn => arn)',
        });
      }
    }

    // Pattern 2: Output in template literal without pulumi.interpolate
    // Example: `${table.arn}/*` instead of pulumi.interpolate`${table.arn}/*`
    if (/`[^`]*\$\{[^}]*\.(arn|name|id)[^}]*\}[^`]*`/.test(line)) {
      if (!line.includes('pulumi.interpolate') && !line.includes('.apply(')) {
        issues.push({
          line: index + 1,
          pattern: 'output_in_template',
          code: line.trim(),
          suggestion: 'Use pulumi.interpolate`...` or .apply()',
        });
      }
    }
  });

  return issues;
}

export function createPulumiOutputUsageCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking for Pulumi Output misuse in sst.config.ts...'));

    const sstConfigPath = join(projectRoot, 'sst.config.ts');

    if (!existsSync(sstConfigPath)) {
      console.log(chalk.green('✅ No issues detected\n'));
      return { passed: true };
    }

    const content = readFileSync(sstConfigPath, 'utf-8');
    const issues = detectPulumiIssues(content);

    if (issues.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${issues.length} Pulumi Output issue(s):\n`));

      issues.forEach(issue => {
        console.log(chalk.yellow(`   Line ${issue.line}: ${issue.code}`));
        console.log(chalk.gray(`   → ${issue.suggestion}`));
      });
      console.log();

      return {
        passed: false,
        issue: 'Pulumi Outputs used incorrectly - will cause "Partition 1 is not valid" error',
        errorType: 'pulumi_output',
        manualFix: 'Fix the issues above or see: https://www.pulumi.com/docs/concepts/inputs-outputs',
      };
    }

    console.log(chalk.green('✅ No Pulumi Output issues detected\n'));
    return { passed: true };
  };
}
