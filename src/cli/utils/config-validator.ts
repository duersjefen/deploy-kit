/**
 * Configuration validation and merging utilities
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

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
  healthChecks?: any[];
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
export function validateConfig(config: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!config.projectName) {
    errors.push('Missing required field: projectName');
  } else if (!/^[a-z0-9-]+$/.test(config.projectName)) {
    errors.push('projectName must be lowercase with hyphens only');
  }

  if (!config.infrastructure) {
    errors.push('Missing required field: infrastructure');
  } else if (!['sst-serverless', 'ec2-docker', 'custom'].includes(config.infrastructure)) {
    errors.push('infrastructure must be: sst-serverless, ec2-docker, or custom');
  }

  if (!config.stages || !Array.isArray(config.stages) || config.stages.length === 0) {
    errors.push('Missing required field: stages (must be a non-empty array)');
  } else {
    // Check for reserved SST stage names
    const reservedStages = ['local', 'dev'];
    const invalidStages = config.stages.filter((s: string) => reservedStages.includes(s));
    if (invalidStages.length > 0) {
      errors.push(`Stages contain reserved names: ${invalidStages.join(', ')}`);
    }
  }

  if (!config.stageConfig || typeof config.stageConfig !== 'object') {
    errors.push('Missing required field: stageConfig (must be an object)');
  } else {
    // Validate each stage has a config
    if (config.stages) {
      for (const stage of config.stages) {
        if (!config.stageConfig[stage]) {
          errors.push(`Stage "${stage}" missing from stageConfig`);
        } else {
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
  if (config.awsProfile) {
    try {
      const profiles = execSync('aws configure list-profiles', { encoding: 'utf-8' }).trim().split('\n');
      if (!profiles.includes(config.awsProfile)) {
        warnings.push(`AWS profile "${config.awsProfile}" not found in local AWS config`);
      }
    } catch {
      warnings.push('Could not verify AWS profiles (AWS CLI not available)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a domain is valid format
 */
function isValidDomain(domain: string): boolean {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

/**
 * Merge two configs, keeping user customizations from existing config
 */
export function mergeConfigs(existingConfig: DeployConfig, templateConfig: DeployConfig): DeployConfig {
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
    const existingUrls = new Set(existingConfig.healthChecks.map((h: any) => h.url));
    const newChecks = templateConfig.healthChecks.filter(
      (h: any) => !existingUrls.has(h.url)
    );
    merged.healthChecks = [...existingConfig.healthChecks, ...newChecks];
  } else if (templateConfig.healthChecks && !existingConfig.healthChecks) {
    merged.healthChecks = templateConfig.healthChecks;
  }

  return merged;
}

/**
 * Print validation result
 */
export function printValidationResult(result: ValidationResult, verbose: boolean = false): void {
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
  } else if (result.valid) {
    console.log(chalk.green('\n✅ Configuration is valid (with warnings)'));
  }
}
