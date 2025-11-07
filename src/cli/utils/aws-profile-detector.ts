/**
 * AWS Profile Auto-Detection and SST Config Analysis
 * Reads configuration from sst.config.ts to pre-fill values in .deploy-config.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectConfig } from '../../types.js';

export interface SstConfigAnalysis {
  awsProfile?: string;
  awsRegion?: string;
  domains?: {
    staging?: string;
    production?: string;
  };
  appName?: string;
}

/**
 * Resolve the AWS profile to use with priority:
 * 1. Explicit awsProfile in .deploy-config.json (highest priority)
 * 2. Auto-detected from sst.config.ts (for SST projects)
 * 3. Default AWS profile (falls back to AWS SDK default)
 */
export function resolveAwsProfile(config: ProjectConfig, projectRoot: string): string | undefined {
  // 1. Explicit config takes precedence
  if (config.awsProfile) {
    return config.awsProfile;
  }

  // 2. For SST projects, auto-detect from sst.config.ts
  if (config.infrastructure === 'sst-serverless') {
    const analysis = analyzeSstConfig(projectRoot);
    if (analysis.awsProfile) {
      console.log(`📝 Using AWS profile from sst.config.ts: ${analysis.awsProfile}`);
      return analysis.awsProfile;
    }
  }

  // 3. Return undefined - AWS SDK will use default profile
  return undefined;
}

/**
 * Analyze sst.config.ts and extract configuration values
 *
 * Extracts:
 * - AWS profile
 * - AWS region
 * - Domain names (staging, production)
 * - App name
 *
 * @param projectRoot - Project root directory
 * @returns SstConfigAnalysis object with extracted values
 */
export function analyzeSstConfig(projectRoot: string): SstConfigAnalysis {
  const result: SstConfigAnalysis = {};

  try {
    const sstConfigPath = join(projectRoot, 'sst.config.ts');

    // Check if file exists
    if (!existsSync(sstConfigPath)) {
      return result;
    }

    // Read file content
    const content = readFileSync(sstConfigPath, 'utf-8');

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

    // Extract app name from $app.name or name: "..."
    const appNameMatch = content.match(/name\s*:\s*["']([^"']+)["']/) ||
                         content.match(/\$app\.name\s*=\s*["']([^"']+)["']/);
    if (appNameMatch && appNameMatch[1]) {
      result.appName = appNameMatch[1];
    }

    // Extract domain names
    result.domains = {};

    // Look for ternary pattern: stage === "production" ? "example.com" : "staging.example.com"
    const ternaryMatch = content.match(/stage\s*===\s*["']production["']\s*\?\s*["']([a-z0-9.-]+\.[a-z]{2,})["']\s*:\s*["']([a-z0-9.-]+\.[a-z]{2,})["']/i);
    if (ternaryMatch) {
      result.domains.production = ternaryMatch[1];
      result.domains.staging = ternaryMatch[2];
    }

    // If ternary didn't work, try finding domain in name: property of domain object
    if (!result.domains.production) {
      const domainNameMatch = content.match(/domain\s*:\s*\{[^}]*name\s*:\s*["']([a-z0-9.-]+\.[a-z]{2,})["']/i);
      if (domainNameMatch && domainNameMatch[1]) {
        result.domains.production = domainNameMatch[1];
        result.domains.staging = `staging.${domainNameMatch[1]}`;
      }
    }

    // Last resort: look for simple domain: "..." pattern (but validate it's a real domain)
    if (!result.domains.production) {
      const simpleDomainMatch = content.match(/\bdomain\s*:\s*["']([a-z0-9]+\.[a-z]{2,}(?:\.[a-z]{2,})?)["']/i);
      if (simpleDomainMatch && simpleDomainMatch[1] && !simpleDomainMatch[1].includes('retain')) {
        result.domains.production = simpleDomainMatch[1];
        result.domains.staging = `staging.${simpleDomainMatch[1]}`;
      }
    }

    return result;
  } catch (error) {
    // Silently fail if file cannot be read
    return result;
  }
}

/**
 * Read AWS profile from sst.config.ts using regex pattern matching
 * Handles multiple formats:
 * - profile: 'my-profile'
 * - profile: "my-profile"
 * - profile: "my-profile" (with spaces)
 *
 * Returns undefined if:
 * - sst.config.ts doesn't exist
 * - profile is not found in the file
 * - file cannot be read
 *
 * @deprecated Use analyzeSstConfig() instead for more complete analysis
 */
export function detectProfileFromSstConfig(projectRoot: string): string | undefined {
  const analysis = analyzeSstConfig(projectRoot);
  return analysis.awsProfile;
}

/**
 * Log the AWS profile being used (for debugging/visibility)
 */
export function logAwsProfile(profile: string | undefined): void {
  if (profile) {
    console.log(`🔐 AWS Profile: ${profile}`);
  } else {
    console.log(`🔐 AWS Profile: default (from AWS_PROFILE env or ~/.aws/credentials)`);
  }
}
