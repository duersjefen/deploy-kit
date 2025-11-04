/**
 * SST Link + Permissions Conflict Validator
 *
 * Detects common SST configuration issues that cause silent permission failures:
 * 1. Link + Permissions conflicts (explicit permissions override link permissions)
 * 2. Missing DynamoDB GSI permissions patterns
 * 3. Pulumi Output misuse in template literals
 *
 * Background: When both `link: [resource]` and explicit `permissions: [...]` are present
 * in sst.aws.Nextjs (or similar constructs), SST uses ONLY the explicit permissions array
 * and does NOT auto-grant linked resource permissions. This causes AccessDeniedExceptions.
 *
 * @see https://github.com/duersjefen/deploy-kit/issues/88
 */
/**
 * Find link + permissions conflicts in SST config
 *
 * Detects patterns like:
 * ```ts
 * new sst.aws.Nextjs("Site", {
 *   link: [table],
 *   permissions: [...]  // ← This overrides link permissions!
 * })
 * ```
 */
export function findLinkPermissionsConflicts(configContent) {
    const violations = [];
    // Pattern: Find SST resource constructs that have both link and permissions
    // Simple approach: find each construct and check for both properties
    const lines = configContent.split('\n');
    // Find lines with new aws.* or new sst.aws.* constructs (SST v2 and v3)
    const constructStarts = [];
    lines.forEach((line, index) => {
        if (/new\s+(sst\.)?aws\.\w+\s*\(/.test(line)) {
            constructStarts.push(index);
        }
    });
    // For each construct, find its config block and check for link + permissions
    for (const startLine of constructStarts) {
        // Find the config block (everything from { to matching })
        let braceCount = 0;
        let configBlock = '';
        let started = false;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('{')) {
                started = true;
                braceCount += (line.match(/\{/g) || []).length;
            }
            if (started) {
                configBlock += line + '\n';
            }
            if (line.includes('}')) {
                braceCount -= (line.match(/\}/g) || []).length;
            }
            if (started && braceCount === 0) {
                break;
            }
        }
        // Check if both link and permissions exist in this block
        const hasLink = /link\s*:\s*\[/.test(configBlock);
        const hasPermissions = /permissions\s*:\s*\[/.test(configBlock);
        if (hasLink && hasPermissions) {
            // Extract linked resources for better error message
            const linkMatch = configBlock.match(/link\s*:\s*\[\s*([^\]]+)\s*\]/);
            const linkedResources = linkMatch ? linkMatch[1].trim() : 'resources';
            violations.push({
                type: 'link-permissions-conflict',
                message: `SST construct has both link and permissions - link permissions will be ignored`,
                lineNumber: startLine + 1, // Line numbers are 1-indexed
                suggestion: `When both \`link: [${linkedResources}]\` and \`permissions: [...]\` are present, SST uses ONLY the explicit permissions array. Add explicit DynamoDB/resource permissions to the permissions array, or remove the permissions array to use auto-linking.`,
                severity: 'warning',
            });
        }
    }
    return violations;
}
/**
 * Find missing DynamoDB GSI permissions patterns
 *
 * Detects permissions that include table ARN but miss the GSI pattern:
 * ```ts
 * permissions: [{
 *   actions: ["dynamodb:Query"],
 *   resources: [table.arn]  // ← Missing: `${table.arn}/index/*`
 * }]
 * ```
 */
export function findMissingGSIPermissions(configContent) {
    const violations = [];
    // Find permissions blocks with DynamoDB actions
    // Use a simpler approach: find "permissions: [" then scan until matching ]
    const lines = configContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/permissions\s*:\s*\[/.test(line)) {
            // Find the entire permissions block
            let permissionsBlock = '';
            let bracketCount = 0;
            let started = false;
            for (let j = i; j < lines.length; j++) {
                const blockLine = lines[j];
                if (blockLine.includes('[')) {
                    started = true;
                    bracketCount += (blockLine.match(/\[/g) || []).length;
                }
                if (started) {
                    permissionsBlock += blockLine + '\n';
                }
                if (blockLine.includes(']')) {
                    bracketCount -= (blockLine.match(/\]/g) || []).length;
                }
                if (started && bracketCount === 0) {
                    break;
                }
            }
            // Check if this block has DynamoDB Query/Scan actions
            const hasDynamoDBQuery = /dynamodb:(Query|Scan)/.test(permissionsBlock);
            if (hasDynamoDBQuery) {
                // Check if resources include a table ARN pattern but NOT the GSI pattern
                const hasTableArn = /\.arn/.test(permissionsBlock);
                const hasGSIPattern = /\/index\/\*/.test(permissionsBlock);
                if (hasTableArn && !hasGSIPattern) {
                    violations.push({
                        type: 'missing-gsi-permissions',
                        message: 'DynamoDB permissions missing GSI pattern - GSI queries will fail',
                        lineNumber: i + 1,
                        suggestion: 'DynamoDB Query/Scan on GSIs requires permissions for both the table AND indexes. Add `$interpolate\\`\\${table.arn}/index/*\\`` to your resources array.',
                        severity: 'warning',
                    });
                }
            }
        }
    }
    return violations;
}
/**
 * Find Pulumi Output misuse in template literals
 *
 * Detects incorrect usage like:
 * ```ts
 * resources: [`${table.arn}/index/*`]  // ← Wrong: uses template literal
 * ```
 *
 * Should be:
 * ```ts
 * resources: [$interpolate`${table.arn}/index/*`]  // ← Correct: uses $interpolate
 * ```
 */
export function findPulumiOutputMisuse(configContent) {
    const violations = [];
    // Pattern: Find template literals with .arn access inside arrays (likely permissions/resources)
    // This catches: resources: [`${something.arn}...`]
    const templateLiteralPattern = /resources\s*:\s*\[\s*`\$\{[^}]*\.arn[^}]*\}[^`]*`/g;
    const matches = configContent.matchAll(templateLiteralPattern);
    for (const match of matches) {
        const startIndex = match.index || 0;
        const lineNumber = configContent.substring(0, startIndex).split('\n').length;
        // Check if this is NOT using $interpolate
        const context = configContent.substring(Math.max(0, startIndex - 20), startIndex);
        const usesInterpolate = context.includes('$interpolate');
        if (!usesInterpolate) {
            violations.push({
                type: 'pulumi-output-misuse',
                message: 'Pulumi Output in template literal - deployment will fail',
                lineNumber,
                suggestion: 'Pulumi Outputs cannot be used in regular template literals. Use `$interpolate\\`\\${resource.arn}\\`` instead of \\``\\${resource.arn}\\``. Regular template literals evaluate at config-time; $interpolate evaluates at deployment-time.',
                severity: 'error',
            });
        }
    }
    return violations;
}
/**
 * Run all SST config validations
 */
export function validateSSTConfig(configContent) {
    return [
        ...findLinkPermissionsConflicts(configContent),
        ...findMissingGSIPermissions(configContent),
        ...findPulumiOutputMisuse(configContent),
    ];
}
/**
 * Format violations into user-friendly error message
 */
export function formatValidationErrors(violations) {
    if (violations.length === 0) {
        return '';
    }
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');
    let message = '';
    if (errors.length > 0) {
        message += '❌ SST Config Errors:\n\n';
        for (const violation of errors) {
            message += `  • ${violation.message}`;
            if (violation.lineNumber) {
                message += ` (line ~${violation.lineNumber})`;
            }
            message += `\n    → ${violation.suggestion}\n\n`;
        }
    }
    if (warnings.length > 0) {
        message += '⚠️  SST Config Warnings:\n\n';
        for (const violation of warnings) {
            message += `  • ${violation.message}`;
            if (violation.lineNumber) {
                message += ` (line ~${violation.lineNumber})`;
            }
            message += `\n    → ${violation.suggestion}\n\n`;
        }
    }
    message += '\nThese issues can cause silent permission failures or deployment errors.\n';
    message += 'See: https://github.com/duersjefen/deploy-kit/issues/88';
    return message;
}
