/**
 * AWS Profile Auto-Detection for SST Projects
 * Reads AWS profile from sst.config.ts to avoid duplication in .deploy-config.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectConfig } from '../../types.js';

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
    const detectedProfile = detectProfileFromSstConfig(projectRoot);
    if (detectedProfile) {
      console.log(`📝 Using AWS profile from sst.config.ts: ${detectedProfile}`);
      return detectedProfile;
    }
  }

  // 3. Return undefined - AWS SDK will use default profile
  return undefined;
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
 */
export function detectProfileFromSstConfig(projectRoot: string): string | undefined {
  try {
    const sstConfigPath = join(projectRoot, 'sst.config.ts');
    
    // Check if file exists
    if (!existsSync(sstConfigPath)) {
      return undefined;
    }

    // Read file content
    const content = readFileSync(sstConfigPath, 'utf-8');
    
    // Match profile in AWS provider configuration
    // Patterns:
    // - profile: "my-profile"
    // - profile: 'my-profile'
    // - profile: 'my-profile' (with spaces)
    const match = content.match(/profile\s*:\s*["']([^"']+)["']/);
    
    if (match && match[1]) {
      return match[1];
    }

    return undefined;
  } catch (error) {
    // Silently fail if file cannot be read
    return undefined;
  }
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
