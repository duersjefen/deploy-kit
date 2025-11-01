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
/**
 * Scan sst.config.ts for common Pulumi Output misuse patterns
 *
 * Detects:
 * 1. $interpolate wrapped around simple Output references without wildcards
 *    ❌ $interpolate`${table.arn}` → ✅ table.arn
 * 2. $interpolate used unnecessarily in arrays
 *    ❌ [$interpolate`${table.arn}`, ...] → ✅ [table.arn, ...]
 */
function detectPulumiIssues(content) {
    const lines = content.split('\n');
    const issues = [];
    const processedLines = new Set(); // Avoid duplicate reporting
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        // Skip if already processed this line
        if (processedLines.has(lineNum))
            return;
        // Pattern: $interpolate wrapped around simple Output references
        // Match: $interpolate`${something.arn}` or similar
        // But NOT: $interpolate`${something.arn}/*` (wildcards are legitimate)
        const hasUnnecessaryInterpolate = line.match(/\$interpolate`\$\{([^}]+\.(?:arn|name|id))\}`(?![\s/\*])/);
        if (hasUnnecessaryInterpolate) {
            const wrongCode = line.trim();
            // Generate correct code by removing unnecessary $interpolate wrappers
            // Only remove if not followed by wildcard patterns
            let correctCode = wrongCode;
            // Replace $interpolate`${output.arn}` with just output.arn
            // But keep $interpolate`${output.arn}/*` as is
            correctCode = correctCode.replace(/\$interpolate`\$\{([^}]+\.(?:arn|name|id))\}`(?![\s/\*])/g, '$1');
            // Only report if we actually made a change
            if (correctCode !== wrongCode) {
                processedLines.add(lineNum);
                issues.push({
                    line: lineNum,
                    pattern: 'unnecessary_interpolate_wrapper',
                    wrongCode,
                    correctCode,
                });
            }
        }
    });
    return issues;
}
export function createPulumiOutputUsageCheck(projectRoot) {
    return async () => {
        console.log(chalk.gray('🔍 Checking for Pulumi Output misuse in sst.config.ts...'));
        const sstConfigPath = join(projectRoot, 'sst.config.ts');
        if (!existsSync(sstConfigPath)) {
            console.log(chalk.green('✅ No issues detected\n'));
            return { passed: true };
        }
        const content = readFileSync(sstConfigPath, 'utf-8');
        const issues = detectPulumiIssues(content);
        if (issues.length === 0) {
            console.log(chalk.green('✅ No Pulumi Output issues detected\n'));
            return { passed: true };
        }
        // Display issues in clear before/after format
        console.log(chalk.red(`❌ Found ${issues.length} Pulumi Output issue(s):\n`));
        issues.forEach((issue, idx) => {
            console.log(chalk.gray(`Line ${issue.line}:`));
            console.log(chalk.red(`  ❌ ${issue.wrongCode}`));
            console.log(chalk.green(`  ✅ ${issue.correctCode}`));
            // Spacing between issues
            if (idx < issues.length - 1) {
                console.log();
            }
        });
        console.log();
        console.log(chalk.cyan('💡 Tip: Only use $interpolate when building patterns with wildcards'));
        console.log(chalk.cyan('   Example: $interpolate`${table.arn}/*` is correct\n'));
        return {
            passed: false,
            issue: 'Pulumi Outputs used incorrectly - will cause "Partition 1 is not valid" error',
            errorType: 'pulumi_output',
            manualFix: 'Fix the issues above or see: https://www.pulumi.com/docs/concepts/inputs-outputs',
        };
    };
}
