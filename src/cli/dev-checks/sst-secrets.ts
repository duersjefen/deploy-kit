/**
 * SST Secrets Validation for Development
 *
 * Validates that all declared SST secrets exist before starting dev server.
 * Prevents cryptic RangeError failures during infrastructure initialization.
 *
 * Related to DEP-38 (secret validation for deployments)
 */

import chalk from 'chalk';
import type { CheckResult } from './types.js';
import { validateSstSecrets, projectUsesSecrets } from '../../safety/sst-secret-validator.js';

/**
 * Create SST secrets validation check for dev mode
 *
 * Checks the "dev" stage by default, since most projects use:
 * - sst dev → stage: "dev" (or username)
 * - sst deploy --stage staging → stage: "staging"
 * - sst deploy --stage production → stage: "production"
 *
 * @param projectRoot - Absolute path to project root
 * @param stage - Stage to validate (defaults to user's system username for dev)
 * @returns Function that validates secrets and returns CheckResult
 */
export function createSstSecretsCheck(
  projectRoot: string,
  stage: string = process.env.USER || 'dev'
): () => Promise<CheckResult> {
  return async () => {
    // Skip if project doesn't use secrets
    if (!projectUsesSecrets(projectRoot)) {
      return {
        passed: true,
        message: 'No SST secrets declared (check skipped)',
      };
    }

    try {
      // Validate secrets for dev stage
      const result = await validateSstSecrets(projectRoot, stage as any);

      if (!result.valid) {
        return {
          passed: false,
          issue: `Missing ${result.missingSecrets.length} SST secret(s) for stage "${stage}"`,
          manualFix: result.error || `Missing secrets: ${result.missingSecrets.join(', ')}`,
        };
      }

      return {
        passed: true,
      };
    } catch (error) {
      // If validation itself fails (e.g., SST CLI not available), warn but don't block
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        passed: true,
        issue: `Could not validate secrets: ${errorMessage}`,
        manualFix: 'Ensure SST is installed and sst.config.ts is valid. Continuing anyway...',
      };
    }
  };
}
