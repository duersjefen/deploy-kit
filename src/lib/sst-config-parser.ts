/**
 * Unified SST Config Parser - Single Source of Truth
 *
 * Consolidates all SST config parsing logic across deploy-kit.
 * Used by: dk init, dk deploy, dk doctor, dk validate
 *
 * Previously scattered across:
 * - src/cli/utils/aws-profile-detector.ts (analyzeSstConfig)
 * - src/lib/sst-deployment-validator.ts (parseSSTDomainConfig)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DeploymentStage } from '../types.js';

/**
 * Comprehensive SST configuration data
 */
export interface SSTConfigData {
  // File metadata
  exists: boolean;
  filePath: string;

  // App configuration
  appName?: string;
  awsProfile?: string;
  awsRegion?: string;

  // Domain configuration per stage
  domains: {
    [stage: string]: {
      name?: string;
      hasOverride: boolean;
      hasExplicitZone: boolean;
      zoneId?: string;
    };
  };

  // Validation metadata
  hasDomain: boolean;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    location?: string;
  }>;
}

/**
 * Parse and validate SST config file
 *
 * Single source of truth for all SST config analysis.
 * Extracts all relevant configuration and validates structure.
 *
 * @param projectRoot - Project root directory
 * @param stage - Optional deployment stage for stage-specific analysis
 * @returns Complete SST configuration data
 */
export function parseAndValidateSSTConfig(
  projectRoot: string,
  stage?: DeploymentStage
): SSTConfigData {
  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  const result: SSTConfigData = {
    exists: false,
    filePath: sstConfigPath,
    domains: {},
    hasDomain: false,
    issues: [],
  };

  // Check if file exists
  if (!existsSync(sstConfigPath)) {
    return result;
  }

  result.exists = true;

  try {
    const content = readFileSync(sstConfigPath, 'utf-8');

    // Extract app name
    const appNameMatch = content.match(/name\s*:\s*["']([^"']+)["']/) ||
                         content.match(/\$app\.name\s*=\s*["']([^"']+)["']/);
    if (appNameMatch && appNameMatch[1]) {
      result.appName = appNameMatch[1];
    }

    // Extract AWS profile
    const profileMatch = content.match(/profile\s*:\s*["']([^"']+)["']/);
    if (profileMatch && profileMatch[1]) {
      result.awsProfile = profileMatch[1];
    }

    // Extract AWS region
    const regionMatch = content.match(/region\s*:\s*["']([^"']+)["']/);
    if (regionMatch && regionMatch[1]) {
      result.awsRegion = regionMatch[1];
    }

    // Extract domain configuration
    extractDomainConfig(content, result);

    // Extract DNS override settings
    extractDnsOverride(content, result, stage);

    // Extract explicit zone IDs
    extractZoneIds(content, result);

    // Validate configuration
    validateConfig(result);

    return result;
  } catch (error) {
    result.issues.push({
      type: 'parse_error',
      severity: 'error',
      message: `Failed to parse sst.config.ts: ${(error as Error).message}`,
    });
    return result;
  }
}

/**
 * Extract domain configuration from SST config
 */
function extractDomainConfig(content: string, result: SSTConfigData): void {
  // Pattern 1: Ternary for production vs staging
  const ternaryMatch = content.match(
    /stage\s*===\s*["']production["']\s*\?\s*["']([a-z0-9.-]+\.[a-z]{2,})["']\s*:\s*["']([a-z0-9.-]+\.[a-z]{2,})["']/i
  );
  if (ternaryMatch) {
    result.domains['production'] = {
      name: ternaryMatch[1],
      hasOverride: false,
      hasExplicitZone: false,
    };
    result.domains['staging'] = {
      name: ternaryMatch[2],
      hasOverride: false,
      hasExplicitZone: false,
    };
    result.hasDomain = true;
  }

  // Pattern 2: Domain object with name property
  if (!result.hasDomain) {
    const domainObjMatch = content.match(/domain\s*:\s*\{[^}]*name\s*:\s*["']([a-z0-9.-]+\.[a-z]{2,})["']/i);
    if (domainObjMatch && domainObjMatch[1]) {
      result.domains['production'] = {
        name: domainObjMatch[1],
        hasOverride: false,
        hasExplicitZone: false,
      };
      result.domains['staging'] = {
        name: `staging.${domainObjMatch[1]}`,
        hasOverride: false,
        hasExplicitZone: false,
      };
      result.hasDomain = true;
    }
  }

  // Pattern 3: Simple domain string
  if (!result.hasDomain) {
    const simpleDomainMatch = content.match(/\bdomain\s*:\s*["']([a-z0-9]+\.[a-z]{2,}(?:\.[a-z]{2,})?)["']/i);
    if (simpleDomainMatch && simpleDomainMatch[1] && !simpleDomainMatch[1].includes('retain')) {
      result.domains['production'] = {
        name: simpleDomainMatch[1],
        hasOverride: false,
        hasExplicitZone: false,
      };
      result.domains['staging'] = {
        name: `staging.${simpleDomainMatch[1]}`,
        hasOverride: false,
        hasExplicitZone: false,
      };
      result.hasDomain = true;
    }
  }
}

/**
 * Extract DNS override settings
 */
function extractDnsOverride(content: string, result: SSTConfigData, stage?: DeploymentStage): void {
  const overrideMatch = content.match(/override\s*:\s*true/i);

  if (overrideMatch && stage && result.domains[stage]) {
    result.domains[stage].hasOverride = true;
  } else if (overrideMatch) {
    Object.keys(result.domains).forEach(s => {
      result.domains[s].hasOverride = true;
    });
  }
}

/**
 * Extract explicit zone IDs
 */
function extractZoneIds(content: string, result: SSTConfigData): void {
  const zoneMatch = content.match(/zone\s*:\s*["'](Z[A-Z0-9]+)["']/);

  if (zoneMatch && zoneMatch[1]) {
    Object.keys(result.domains).forEach(stage => {
      result.domains[stage].hasExplicitZone = true;
      result.domains[stage].zoneId = zoneMatch[1];
    });
  }
}

/**
 * Validate SST config structure
 */
function validateConfig(result: SSTConfigData): void {
  if (!result.appName) {
    result.issues.push({
      type: 'missing_app_name',
      severity: 'warning',
      message: 'No app name found in sst.config.ts',
      location: 'app() function',
    });
  }

  if (!result.awsRegion) {
    result.issues.push({
      type: 'missing_region',
      severity: 'info',
      message: 'No AWS region specified, will use AWS default',
      location: 'providers.aws.region',
    });
  }

  Object.entries(result.domains).forEach(([stage, config]) => {
    if (config.name && !config.hasExplicitZone) {
      result.issues.push({
        type: 'missing_explicit_zone',
        severity: 'warning',
        message: `${stage}: Domain configured without explicit Route53 zone ID`,
        location: `domain configuration for ${stage}`,
      });
    }
  });
}

/**
 * Get domain configuration for a specific stage
 */
export function getDomainForStage(
  projectRoot: string,
  stage: DeploymentStage
): SSTConfigData['domains'][string] | undefined {
  const config = parseAndValidateSSTConfig(projectRoot, stage);
  return config.domains[stage];
}

/**
 * Check if SST config has any validation errors
 */
export function hasValidationErrors(projectRoot: string): boolean {
  const config = parseAndValidateSSTConfig(projectRoot);
  return config.issues.some(issue => issue.severity === 'error');
}

/**
 * Format validation issues for display
 */
export function formatValidationIssues(config: SSTConfigData): string {
  if (config.issues.length === 0) {
    return '';
  }

  const errors = config.issues.filter(i => i.severity === 'error');
  const warnings = config.issues.filter(i => i.severity === 'warning');
  const infos = config.issues.filter(i => i.severity === 'info');

  let output = '';

  if (errors.length > 0) {
    output += '\n❌ Errors:\n';
    errors.forEach(err => {
      output += `  • ${err.message}`;
      if (err.location) output += ` (${err.location})`;
      output += '\n';
    });
  }

  if (warnings.length > 0) {
    output += '\n⚠️  Warnings:\n';
    warnings.forEach(warn => {
      output += `  • ${warn.message}`;
      if (warn.location) output += ` (${warn.location})`;
      output += '\n';
    });
  }

  if (infos.length > 0) {
    output += '\nℹ️  Info:\n';
    infos.forEach(info => {
      output += `  • ${info.message}`;
      if (info.location) output += ` (${info.location})`;
      output += '\n';
    });
  }

  return output;
}
