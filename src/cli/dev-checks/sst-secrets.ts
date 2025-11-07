/**
 * SST Secrets Validation for Development
 *
 * Validates that all declared SST secrets exist before starting dev server.
 * Prevents cryptic RangeError failures during infrastructure initialization.
 *
 * Related to DEP-38 (secret validation for deployments)
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import type { ProjectConfig } from '../../types.js';
import { validateSstSecrets, projectUsesSecrets } from '../../safety/sst-secret-validator.js';

/**
 * Load AWS profile from deploy-config.json if it exists
 */
function loadAwsProfile(projectRoot: string): string | undefined {
  const configPath = join(projectRoot, '.deploy-config.json');

  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as ProjectConfig;
    return config.awsProfile;
  } catch (error) {
    return undefined;
  }
}

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
        // Build clear error message showing exactly what's missing
        const secretsList = result.missingSecrets.map(s => `  - ${s}`).join('\n');
        const fixCommands = result.missingSecrets
          .map(s => `  npx sst secret set ${s} "your-value" --stage ${stage}`)
          .join('\n');

        return {
          passed: false,
          issue: `Missing ${result.missingSecrets.length} secret${result.missingSecrets.length > 1 ? 's' : ''} for stage "${stage}"\n\nMissing secrets:\n${secretsList}`,
          manualFix: `Run these commands to set the missing secrets:\n\n${fixCommands}`,
          canAutoFix: true,
          autoFix: async () => {
            // Run SST CLI interactively for EACH missing secret
            const { execa } = await import('execa');

            // Load AWS profile from config
            const awsProfile = loadAwsProfile(projectRoot);

            // Set up environment with AWS_PROFILE if specified
            const env = {
              ...process.env,
              ...(awsProfile && {
                AWS_PROFILE: awsProfile,
              }),
            };

            console.log(chalk.cyan(`\n🔐 Setting ${result.missingSecrets.length} secret(s) for stage "${stage}"\n`));

            if (awsProfile) {
              console.log(chalk.gray(`Using AWS profile: ${awsProfile}\n`));
            }

            for (const secretName of result.missingSecrets) {
              console.log(chalk.bold(`\nEnter value for ${chalk.yellow(secretName)}:`));

              try {
                // Call SST secret set with the secret name - will prompt for value
                await execa('npx', ['sst', 'secret', 'set', secretName, '--stage', stage], {
                  cwd: projectRoot,
                  stdio: 'inherit', // Pass through stdin/stdout for interactive prompts
                  env,
                });
                console.log(chalk.green(`✓ Set ${secretName}`));
              } catch (error) {
                console.log(chalk.red(`✗ Failed to set ${secretName}`));
                throw error;
              }
            }

            console.log(chalk.green(`\n✅ All ${result.missingSecrets.length} secret(s) configured!\n`));
          },
          errorType: 'sst_secrets_missing', // Mark as safe auto-fix (user interaction required)
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
