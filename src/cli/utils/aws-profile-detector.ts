/**
 * AWS Profile Auto-Detection and SST Config Analysis
 *
 * NOTE: This module now delegates to src/lib/sst-config-parser.ts
 * which is the single source of truth for all SST config parsing.
 *
 * This file maintains backward compatibility while using the unified parser.
 */

import type { ProjectConfig } from '../../types.js';
import {
  analyzeSstConfig as _analyzeSstConfig,
  detectProfileFromSstConfig as _detectProfileFromSstConfig,
  type SstConfigAnalysis,
} from '../../lib/sst-config-parser.js';

// Re-export the interface for backward compatibility
export type { SstConfigAnalysis };

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

  // 2. For SST projects, auto-detect from sst.config.ts (via unified parser)
  if (config.infrastructure === 'sst-serverless') {
    const analysis = _analyzeSstConfig(projectRoot);
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
 * Delegates to unified parser in src/lib/sst-config-parser.ts
 *
 * @param projectRoot - Project root directory
 * @returns SstConfigAnalysis object with extracted values
 */
export function analyzeSstConfig(projectRoot: string): SstConfigAnalysis {
  return _analyzeSstConfig(projectRoot);
}

/**
 * Read AWS profile from sst.config.ts
 *
 * Delegates to unified parser in src/lib/sst-config-parser.ts
 *
 * @param projectRoot - Project root directory
 * @returns AWS profile name or undefined
 * @deprecated Use analyzeSstConfig() instead for more complete analysis
 */
export function detectProfileFromSstConfig(projectRoot: string): string | undefined {
  return _detectProfileFromSstConfig(projectRoot);
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
