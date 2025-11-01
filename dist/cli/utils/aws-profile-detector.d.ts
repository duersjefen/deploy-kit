/**
 * AWS Profile Auto-Detection for SST Projects
 * Reads AWS profile from sst.config.ts to avoid duplication in .deploy-config.json
 */
import type { ProjectConfig } from '../../types.js';
/**
 * Resolve the AWS profile to use with priority:
 * 1. Explicit awsProfile in .deploy-config.json (highest priority)
 * 2. Auto-detected from sst.config.ts (for SST projects)
 * 3. Default AWS profile (falls back to AWS SDK default)
 */
export declare function resolveAwsProfile(config: ProjectConfig, projectRoot: string): string | undefined;
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
export declare function detectProfileFromSstConfig(projectRoot: string): string | undefined;
/**
 * Log the AWS profile being used (for debugging/visibility)
 */
export declare function logAwsProfile(profile: string | undefined): void;
//# sourceMappingURL=aws-profile-detector.d.ts.map