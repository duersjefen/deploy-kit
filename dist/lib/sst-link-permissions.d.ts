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
export declare function findLinkPermissionsConflicts(configContent: string): LinkPermissionsViolation[];
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
export declare function findMissingGSIPermissions(configContent: string): LinkPermissionsViolation[];
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
export declare function findPulumiOutputMisuse(configContent: string): LinkPermissionsViolation[];
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
export declare function findS3LifecycleRuleIssues(configContent: string): LinkPermissionsViolation[];
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
export declare function findAWSResourceStringReferences(configContent: string): LinkPermissionsViolation[];
/**
 * Run all SST config validations
 */
export declare function validateSSTConfig(configContent: string): LinkPermissionsViolation[];
/**
 * Format violations into user-friendly error message
 */
export declare function formatValidationErrors(violations: LinkPermissionsViolation[]): string;
//# sourceMappingURL=sst-link-permissions.d.ts.map