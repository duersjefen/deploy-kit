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
    type: 'link-permissions-conflict' | 'missing-gsi-permissions' | 'pulumi-output-misuse';
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
 * ```
 *
 * Should be:
 * ```ts
 * resources: [$interpolate`${table.arn}/index/*`]  // ← Correct: uses $interpolate
 * ```
 */
export declare function findPulumiOutputMisuse(configContent: string): LinkPermissionsViolation[];
/**
 * Run all SST config validations
 */
export declare function validateSSTConfig(configContent: string): LinkPermissionsViolation[];
/**
 * Format violations into user-friendly error message
 */
export declare function formatValidationErrors(violations: LinkPermissionsViolation[]): string;
//# sourceMappingURL=sst-link-permissions.d.ts.map