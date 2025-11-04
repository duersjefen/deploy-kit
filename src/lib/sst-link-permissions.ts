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

export interface LinkPermissionsViolation {
  type: 'link-permissions-conflict' | 'missing-gsi-permissions' | 'pulumi-output-misuse' | 's3-lifecycle-schema' | 'aws-resource-string-reference';
  message: string;
  lineNumber?: number;
  suggestion: string;
  severity: 'error' | 'warning';
}

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
export function findLinkPermissionsConflicts(configContent: string): LinkPermissionsViolation[] {
  const violations: LinkPermissionsViolation[] = [];

  // Pattern: Find SST resource constructs that have both link and permissions
  // Simple approach: find each construct and check for both properties
  const lines = configContent.split('\n');

  // Find lines with new aws.* or new sst.aws.* constructs (SST v2 and v3)
  const constructStarts: number[] = [];
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
export function findMissingGSIPermissions(configContent: string): LinkPermissionsViolation[] {
  const violations: LinkPermissionsViolation[] = [];

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
 * sourceArn: `arn:aws:events:...:${aws.getCallerIdentityOutput().accountId}:...`  // ← Wrong
 * ```
 *
 * Should be:
 * ```ts
 * resources: [$interpolate`${table.arn}/index/*`]  // ← Correct: uses $interpolate
 * sourceArn: $interpolate`arn:aws:events:...:${aws.getCallerIdentityOutput().accountId}:...`  // ← Correct
 * ```
 */
export function findPulumiOutputMisuse(configContent: string): LinkPermissionsViolation[] {
  const violations: LinkPermissionsViolation[] = [];
  const lines = configContent.split('\n');

  // Patterns to detect Pulumi Output usage in template literals:
  const pulumiOutputPatterns = [
    // Pattern 1: aws.getCallerIdentityOutput() or any *Output() function
    { regex: /`[^`]*\$\{[^}]*Output\([^)]*\)[^}]*\}[^`]*`/, name: 'Output function call' },
    // Pattern 2: .arn property access
    { regex: /`[^`]*\$\{[^}]*\.arn[^}]*\}[^`]*`/, name: '.arn property' },
    // Pattern 3: .id property access
    { regex: /`[^`]*\$\{[^}]*\.id[^}]*\}[^`]*`/, name: '.id property' },
    // Pattern 4: .name property access
    { regex: /`[^`]*\$\{[^}]*\.name[^}]*\}[^`]*`/, name: '.name property' },
  ];

  lines.forEach((line, index) => {
    for (const pattern of pulumiOutputPatterns) {
      if (pattern.regex.test(line)) {
        // Check if this line already uses $interpolate
        const usesInterpolate = /\$interpolate\s*`/.test(line);

        if (!usesInterpolate) {
          // Extract a snippet of what's being used incorrectly
          const match = line.match(/`([^`]+)`/);
          const snippet = match ? match[1].substring(0, 50) : 'template literal';

          violations.push({
            type: 'pulumi-output-misuse',
            message: `Pulumi Output (${pattern.name}) in template literal - deployment will fail`,
            lineNumber: index + 1,
            suggestion: `Pulumi Outputs cannot be used in regular template literals. Wrap with $interpolate: $interpolate\`${snippet}...\`. Regular template literals evaluate at config-time; $interpolate evaluates at deployment-time when Output values are available.`,
            severity: 'error',
          });

          // Only report once per line
          break;
        }
      }
    }
  });

  return violations;
}

/**
 * Find S3 lifecycle rule schema issues
 *
 * Detects common schema mistakes in S3 bucket lifecycle rules:
 * 1. Using `expiration` (object) instead of `expirations` (array)
 * 2. Using unsupported `abortIncompleteMultipartUploads` in BucketV2 transform
 *
 * Example errors:
 * ```ts
 * lifecycleRules: [{
 *   expiration: { days: 180 }  // ❌ Should be 'expirations' (array)
 * }]
 * ```
 */
export function findS3LifecycleRuleIssues(configContent: string): LinkPermissionsViolation[] {
  const violations: LinkPermissionsViolation[] = [];
  const lines = configContent.split('\n');

  // Find lifecycleRules blocks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/lifecycleRules\s*[:=]\s*\[/.test(line)) {
      // Find the entire lifecycleRules block
      let rulesBlock = '';
      let bracketCount = 0;
      let started = false;

      for (let j = i; j < lines.length; j++) {
        const blockLine = lines[j];

        if (blockLine.includes('[')) {
          started = true;
          bracketCount += (blockLine.match(/\[/g) || []).length;
        }

        if (started) {
          rulesBlock += blockLine + '\n';
        }

        if (blockLine.includes(']')) {
          bracketCount -= (blockLine.match(/\]/g) || []).length;
        }

        if (started && bracketCount === 0) {
          break;
        }
      }

      // Check for common schema errors
      const blockLines = rulesBlock.split('\n');

      blockLines.forEach((blockLine, idx) => {
        const lineNum = i + idx + 1;

        // Error 1: Using 'expiration' (object) instead of 'expirations' (array)
        if (/expiration\s*:\s*\{/.test(blockLine)) {
          violations.push({
            type: 's3-lifecycle-schema',
            message: 'S3 lifecycle rule uses "expiration" (object) - should be "expirations" (array)',
            lineNumber: lineNum,
            suggestion: 'BucketV2 requires "expirations: [{ days: 180 }]" not "expiration: { days: 180 }". Change singular to plural and wrap in array.',
            severity: 'error',
          });
        }

        // Error 2: Using unsupported abortIncompleteMultipartUploads
        if (/abortIncompleteMultipartUploads/.test(blockLine)) {
          violations.push({
            type: 's3-lifecycle-schema',
            message: 'S3 lifecycle rule uses unsupported "abortIncompleteMultipartUploads"',
            lineNumber: lineNum,
            suggestion: '"abortIncompleteMultipartUploads" is not supported in BucketV2 transform. Remove this rule or use aws.s3.BucketLifecycleConfigurationV2 directly.',
            severity: 'error',
          });
        }
      });
    }
  }

  return violations;
}

/**
 * Find AWS resource string references that should use resource properties
 *
 * Detects patterns where resource names are hardcoded as strings instead of
 * referencing the actual resource property:
 * ```ts
 * const rule = new aws.cloudwatch.EventRule("DeletionWarning", {
 *   name: `${stage}-deletion-warning`
 * });
 *
 * new aws.cloudwatch.EventTarget("Target", {
 *   rule: "DeletionWarning",  // ❌ String reference - should be rule.name
 *   arn: func.arn
 * });
 * ```
 */
export function findAWSResourceStringReferences(configContent: string): LinkPermissionsViolation[] {
  const violations: LinkPermissionsViolation[] = [];
  const lines = configContent.split('\n');

  // Build a map of AWS resource names from "new aws.*.*(\"ResourceName\")"
  const resourceNames = new Set<string>();
  lines.forEach(line => {
    const match = line.match(/new\s+aws\.\w+\.\w+\s*\(\s*["']([^"']+)["']/);
    if (match) {
      resourceNames.add(match[1]);
    }
  });

  // Check for string references to those resource names in common properties
  const stringRefProperties = ['rule', 'targetGroupArn', 'securityGroupId', 'vpcId', 'subnetId'];

  lines.forEach((line, index) => {
    for (const prop of stringRefProperties) {
      // Match: property: "ResourceName" where ResourceName is a known resource
      const regex = new RegExp(`${prop}\\s*:\\s*["']([^"']+)["']`);
      const match = line.match(regex);

      if (match && resourceNames.has(match[1])) {
        violations.push({
          type: 'aws-resource-string-reference',
          message: `AWS resource property uses string reference "${match[1]}" instead of resource property`,
          lineNumber: index + 1,
          suggestion: `String "${match[1]}" references a resource defined elsewhere. Use the resource's property (e.g., resource.name, resource.arn, resource.id) instead of hardcoding the name. This ensures the correct runtime value is used.`,
          severity: 'warning',
        });
      }
    }
  });

  return violations;
}

/**
 * Run all SST config validations
 */
export function validateSSTConfig(configContent: string): LinkPermissionsViolation[] {
  return [
    ...findLinkPermissionsConflicts(configContent),
    ...findMissingGSIPermissions(configContent),
    ...findPulumiOutputMisuse(configContent),
    ...findS3LifecycleRuleIssues(configContent),
    ...findAWSResourceStringReferences(configContent),
  ];
}

/**
 * Format violations into user-friendly error message
 */
export function formatValidationErrors(violations: LinkPermissionsViolation[]): string {
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
