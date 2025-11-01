/**
 * Configuration validation and merging utilities
 */
import chalk from 'chalk';
import { execSync } from 'child_process';
/**
 * Validate configuration structure and return validation results
 *
 * Checks required fields (projectName, infrastructure, stages, stageConfig),
 * domain formats, AWS profile availability, and health check definitions.
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
export function validateConfig(config) {
    const errors = [];
    const warnings = [];
    // Required fields
    if (!config.projectName) {
        errors.push('Missing required field: projectName');
    }
    else if (!/^[a-z0-9-]+$/.test(config.projectName)) {
        errors.push('projectName must be lowercase with hyphens only');
    }
    if (!config.infrastructure) {
        errors.push('Missing required field: infrastructure');
    }
    else if (!['sst-serverless', 'ec2-docker', 'custom'].includes(config.infrastructure)) {
        errors.push('infrastructure must be: sst-serverless, ec2-docker, or custom');
    }
    if (!config.stages || !Array.isArray(config.stages) || config.stages.length === 0) {
        errors.push('Missing required field: stages (must be a non-empty array)');
    }
    else {
        // Check for reserved SST stage names
        const reservedStages = ['local', 'dev'];
        const invalidStages = config.stages.filter((s) => reservedStages.includes(s));
        if (invalidStages.length > 0) {
            errors.push(`Stages contain reserved names: ${invalidStages.join(', ')}`);
        }
    }
    if (!config.stageConfig || typeof config.stageConfig !== 'object') {
        errors.push('Missing required field: stageConfig (must be an object)');
    }
    else {
        // Validate each stage has a config
        if (config.stages) {
            for (const stage of config.stages) {
                if (!config.stageConfig[stage]) {
                    errors.push(`Stage "${stage}" missing from stageConfig`);
                }
                else {
                    if (!config.stageConfig[stage].domain) {
                        warnings.push(`Stage "${stage}" missing domain (required for health checks)`);
                    }
                    if (config.stageConfig[stage].domain && !isValidDomain(config.stageConfig[stage].domain)) {
                        errors.push(`Invalid domain for stage "${stage}": ${config.stageConfig[stage].domain}`);
                    }
                }
            }
        }
    }
    // Validate domains
    if (config.mainDomain && !isValidDomain(config.mainDomain)) {
        errors.push(`Invalid mainDomain: ${config.mainDomain}`);
    }
    // Validate health checks
    if (config.healthChecks && Array.isArray(config.healthChecks)) {
        for (let i = 0; i < config.healthChecks.length; i++) {
            const check = config.healthChecks[i];
            if (!check.url) {
                errors.push(`Health check ${i}: missing url`);
            }
            if (check.expectedStatus && typeof check.expectedStatus !== 'number') {
                errors.push(`Health check ${i}: expectedStatus must be a number`);
            }
        }
    }
    // Check AWS profile exists (if specified)
    // For SST projects, awsProfile is optional (can be auto-detected from sst.config.ts)
    // For non-SST projects, awsProfile is required
    if (config.awsProfile) {
        try {
            const profilesStr = execSync('aws configure list-profiles', { encoding: 'utf-8' });
            const profiles = profilesStr.trim().split('\n');
            if (!profiles.includes(config.awsProfile)) {
                warnings.push(`AWS profile "${config.awsProfile}" not found in local AWS config`);
            }
        }
        catch {
            warnings.push('Could not verify AWS profiles (AWS CLI not available)');
        }
    }
    else if (config.infrastructure !== 'sst-serverless') {
        // Non-SST projects should specify awsProfile explicitly
        warnings.push('awsProfile not specified. Will use default AWS profile. ' +
            'For SST projects, profile can be auto-detected from sst.config.ts');
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
/**
 * Check if a domain string is valid DNS format
 *
 * Validates domain against RFC 1123-compliant pattern. Accepts subdomains.
 *
 * @param domain - Domain string to validate (e.g., 'example.com' or 'api.staging.example.com')
 * @returns true if domain is valid format, false otherwise
 *
 * @example
 * ```typescript
 * isValidDomain('example.com')           // => true
 * isValidDomain('api.example.com')       // => true
 * isValidDomain('example')               // => false (no TLD)
 * isValidDomain('example.c')             // => false (TLD too short)
 * isValidDomain('-invalid.com')          // => false (starts with hyphen)
 * ```
 */
function isValidDomain(domain) {
    return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}
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
export function mergeConfigs(existingConfig, templateConfig) {
    // Keep all existing settings
    const merged = { ...existingConfig };
    // Add any missing fields from template
    for (const key of Object.keys(templateConfig)) {
        if (!(key in merged)) {
            merged[key] = templateConfig[key];
        }
    }
    // Merge stageConfig: keep existing stage configs, add new ones from template
    if (templateConfig.stageConfig) {
        for (const stage of Object.keys(templateConfig.stageConfig)) {
            if (!(stage in merged.stageConfig)) {
                merged.stageConfig[stage] = templateConfig.stageConfig[stage];
            }
        }
    }
    // Merge health checks: keep existing, add new ones from template
    if (templateConfig.healthChecks && existingConfig.healthChecks) {
        // Deduplicate by URL
        const existingUrls = new Set(existingConfig.healthChecks.map((h) => h.url));
        const newChecks = templateConfig.healthChecks.filter((h) => !existingUrls.has(h.url));
        merged.healthChecks = [...existingConfig.healthChecks, ...newChecks];
    }
    else if (templateConfig.healthChecks && !existingConfig.healthChecks) {
        merged.healthChecks = templateConfig.healthChecks;
    }
    return merged;
}
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
export function printValidationResult(result, verbose = false) {
    if (result.errors.length > 0) {
        console.log(chalk.red('\n❌ Configuration errors:'));
        for (const error of result.errors) {
            console.log(chalk.red(`   • ${error}`));
        }
    }
    if (result.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Configuration warnings:'));
        for (const warning of result.warnings) {
            console.log(chalk.yellow(`   • ${warning}`));
        }
    }
    if (result.valid && result.warnings.length === 0) {
        console.log(chalk.green('\n✅ Configuration is valid'));
    }
    else if (result.valid) {
        console.log(chalk.green('\n✅ Configuration is valid (with warnings)'));
    }
}
