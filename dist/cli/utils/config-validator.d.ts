/**
 * Configuration validation and merging utilities
 */
import type { HealthCheck } from '../../types.js';
/**
 * Configuration before validation (from external sources like JSON files, YAML, etc.)
 *
 * Uses Record<string, any> to indicate unvalidated structure while allowing flexible property access.
 * Must be validated with validateConfig() before use.
 */
export type UnvalidatedConfig = Record<string, any>;
/**
 * Validated deployment configuration structure
 *
 * Represents the complete configuration for a deploy-kit project after validation.
 * All required fields must be present and valid. See validateConfig() for validation rules.
 */
export interface DeployConfig {
    projectName: string;
    displayName?: string;
    infrastructure: 'sst-serverless' | 'ec2-docker' | 'custom';
    database?: string;
    stages: string[];
    mainDomain?: string;
    awsProfile?: string;
    requireCleanGit?: boolean;
    runTestsBeforeDeploy?: boolean;
    stageConfig: Record<string, any>;
    healthChecks?: HealthCheck[];
    hooks?: Record<string, string>;
    [key: string]: any;
}
/**
 * Result of validating a configuration object
 *
 * Contains validation outcome, errors that prevent deployment, and warnings
 * that should be reviewed but don't block deployment.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate configuration structure and return validation results (FAST synchronous version)
 *
 * Checks required fields (projectName, infrastructure, stages, stageConfig),
 * domain formats, and health check definitions. Skips expensive AWS CLI checks.
 *
 * For AWS profile validation, use validateConfigAsync() instead.
 *
 * @param config - Unvalidated configuration object from external source (JSON, YAML, etc.)
 * @returns ValidationResult with valid flag, errors array, and warnings array
 *
 * @example
 * ```typescript
 * const config = JSON.parse(configContent);
 * const result = validateConfig(config);
 *
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 * } else if (result.warnings.length > 0) {
 *   console.warn('Config warnings:', result.warnings);
 * }
 * ```
 */
export declare function validateConfig(config: UnvalidatedConfig): ValidationResult;
/**
 * Validate configuration AND verify AWS profile availability
 *
 * This is an async version that performs both structural validation and AWS profile checks.
 * Use this before actual deployment. For fast validation (e.g., during config load),
 * use validateConfig() instead.
 *
 * @param config - Unvalidated configuration object
 * @returns ValidationResult with both structural and AWS profile checks
 *
 * @example
 * ```typescript
 * const config = JSON.parse(configContent);
 * const result = await validateConfigAsync(config);
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export declare function validateConfigAsync(config: UnvalidatedConfig): Promise<ValidationResult>;
/**
 * Merge two configuration objects, preserving user customizations from existing config
 *
 * Strategy: Keep all settings from existing config, add new fields from template config
 * that don't exist. For stageConfig and healthChecks, merges entries (deduplicates health checks by URL).
 *
 * @param existingConfig - Current configuration (user's existing setup)
 * @param templateConfig - Template configuration (new defaults/fields to add)
 * @returns Merged configuration with existing settings preserved and new fields added
 *
 * @example
 * ```typescript
 * const existing = { projectName: 'my-app', infrastructure: 'sst-serverless', ... };
 * const template = { projectName: 'template', healthChecks: [...], ... };
 *
 * const merged = mergeConfigs(existing, template);
 * // Result: existing values preserved, template healthChecks added (if not duplicated by URL)
 * ```
 */
export declare function mergeConfigs(existingConfig: DeployConfig, templateConfig: DeployConfig): DeployConfig;
/**
 * Print validation result with colored output to console
 *
 * Displays errors in red, warnings in yellow, and success in green. Shows detailed
 * validation messages for debugging configuration issues.
 *
 * @param result - ValidationResult from validateConfig()
 * @param verbose - Whether to output in verbose mode (default: false)
 *
 * @example
 * ```typescript
 * const config = JSON.parse(configContent);
 * const result = validateConfig(config);
 *
 * printValidationResult(result);
 * // Output: ✅ Configuration is valid
 *
 * const result2 = validateConfig(badConfig);
 * printValidationResult(result2);
 * // Output: ❌ Configuration errors:
 * //         • Missing required field: projectName
 * //         • Invalid mainDomain: not-a-domain
 * ```
 */
export declare function printValidationResult(result: ValidationResult, verbose?: boolean): void;
//# sourceMappingURL=config-validator.d.ts.map