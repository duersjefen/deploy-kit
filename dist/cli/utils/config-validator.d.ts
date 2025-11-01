/**
 * Configuration validation and merging utilities
 */
import type { HealthCheck } from '../../types.js';
/**
 * Configuration before validation (from external sources like JSON files)
 * Uses Record<string, any> to indicate unvalidated structure while allowing property access
 */
export type UnvalidatedConfig = Record<string, any>;
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
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate configuration structure
 */
export declare function validateConfig(config: UnvalidatedConfig): ValidationResult;
/**
 * Merge two configs, keeping user customizations from existing config
 */
export declare function mergeConfigs(existingConfig: DeployConfig, templateConfig: DeployConfig): DeployConfig;
/**
 * Print validation result
 */
export declare function printValidationResult(result: ValidationResult, verbose?: boolean): void;
//# sourceMappingURL=config-validator.d.ts.map