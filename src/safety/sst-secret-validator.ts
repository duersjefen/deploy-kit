/**
 * SST Secret Validation - Pre-deployment Check
 *
 * Addresses DEP-38: Detects missing SST secrets before deployment
 * to prevent cryptic RangeError failures during infrastructure creation.
 *
 * When SST tries to access `Resource.SecretName.value` but the secret doesn't exist,
 * it causes Pulumi Output serialization to fail with "RangeError: Invalid string length"
 * instead of a helpful "secret not found" message.
 *
 * This validator:
 * 1. Parses sst.config.ts to find all `new sst.Secret("Name")` declarations
 * 2. Runs `sst secret list --stage <stage>` to get existing secrets
 * 3. Compares and reports missing secrets with actionable fix commands
 *
 * @example
 * ```typescript
 * import { validateSstSecrets } from './safety/sst-secret-validator.js';
 *
 * const result = await validateSstSecrets('/path/to/project', 'production');
 * if (!result.valid) {
 *   console.error(result.error);
 *   process.exit(1);
 * }
 * ```
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import type { DeploymentStage } from '../types.js';

export interface SecretValidationResult {
  valid: boolean;
  error?: string;
  missingSecrets: string[];
  existingSecrets: string[];
  declaredSecrets: string[];
}

/**
 * Extract secret names from sst.config.ts
 *
 * Parses the config file looking for:
 * - `new sst.Secret("SecretName")`
 * - `new Secret("SecretName")`
 * - `sst.Secret("SecretName")`
 *
 * @param projectRoot - Absolute path to project root
 * @returns Array of secret names declared in config
 */
export function extractSecretNames(projectRoot: string): string[] {
  const configPaths = [
    join(projectRoot, 'sst.config.ts'),
    join(projectRoot, 'sst.config.js'),
  ];

  let configContent = '';
  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      configContent = readFileSync(configPath, 'utf-8');
      break;
    }
  }

  if (!configContent) {
    return []; // No SST config found
  }

  const secretNames: string[] = [];

  // Patterns to match:
  // 1. new sst.Secret("SecretName")
  // 2. new Secret("SecretName")
  // 3. sst.Secret("SecretName")
  const patterns = [
    /new\s+sst\.Secret\s*\(\s*["']([^"']+)["']\s*\)/g,
    /new\s+Secret\s*\(\s*["']([^"']+)["']\s*\)/g,
    /sst\.Secret\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(configContent)) !== null) {
      const secretName = match[1];
      if (!secretNames.includes(secretName)) {
        secretNames.push(secretName);
      }
    }
  }

  return secretNames;
}

/**
 * Get existing SST secrets for a stage
 *
 * Runs `sst secret list --stage <stage>` and parses output.
 *
 * Example output:
 * ```
 * TelegramBotToken = 123456:ABC-DEF...
 * DatabaseUrl = postgres://...
 * ```
 *
 * @param projectRoot - Absolute path to project root
 * @param stage - Deployment stage
 * @returns Array of secret names that exist
 */
export function getExistingSecrets(
  projectRoot: string,
  stage: DeploymentStage
): string[] {
  try {
    // Run sst secret list
    const output = execSync(`npx sst secret list --stage ${stage}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse output - each line is "SecretName = value"
    const lines = output.split('\n');
    const secretNames: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip header/footer lines
      if (trimmed.includes('Secrets for') || trimmed.includes('===')) continue;

      // Extract secret name (before the "=" sign)
      const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/);
      if (match) {
        secretNames.push(match[1]);
      }
    }

    return secretNames;
  } catch (error) {
    // If command fails (e.g., no secrets found), return empty array
    // SST returns exit code 1 when no secrets exist
    return [];
  }
}

/**
 * Validate that all declared secrets exist for a stage
 *
 * Comprehensive validation that:
 * 1. Finds all secret declarations in sst.config.ts
 * 2. Checks which secrets actually exist via `sst secret list`
 * 3. Reports missing secrets with actionable fix commands
 *
 * @param projectRoot - Absolute path to project root
 * @param stage - Deployment stage
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = await validateSstSecrets('/path/to/project', 'production');
 * if (!result.valid) {
 *   console.error(result.error);
 *   process.exit(1);
 * }
 * ```
 */
export async function validateSstSecrets(
  projectRoot: string,
  stage: DeploymentStage
): Promise<SecretValidationResult> {
  // Extract secret names from config
  const declaredSecrets = extractSecretNames(projectRoot);

  // If no secrets declared, validation passes
  if (declaredSecrets.length === 0) {
    return {
      valid: true,
      missingSecrets: [],
      existingSecrets: [],
      declaredSecrets: [],
    };
  }

  // Get existing secrets
  const existingSecrets = getExistingSecrets(projectRoot, stage);

  // Find missing secrets
  const missingSecrets = declaredSecrets.filter(
    (name) => !existingSecrets.includes(name)
  );

  // If all secrets exist, validation passes
  if (missingSecrets.length === 0) {
    return {
      valid: true,
      missingSecrets: [],
      existingSecrets,
      declaredSecrets,
    };
  }

  // Build error message with actionable fixes
  const errorMessage = buildSecretErrorMessage(
    missingSecrets,
    existingSecrets,
    stage,
    projectRoot
  );

  return {
    valid: false,
    error: errorMessage,
    missingSecrets,
    existingSecrets,
    declaredSecrets,
  };
}

/**
 * Build actionable error message for missing secrets
 *
 * @param missingSecrets - Secret names that don't exist
 * @param existingSecrets - Secret names that do exist
 * @param stage - Deployment stage
 * @param projectRoot - Project root path
 * @returns Formatted error message with fix commands
 */
function buildSecretErrorMessage(
  missingSecrets: string[],
  existingSecrets: string[],
  stage: DeploymentStage,
  projectRoot: string
): string {
  const lines: string[] = [];

  lines.push(chalk.red('❌ SST Secret Validation Failed\n'));
  lines.push(`Missing secrets for stage ${chalk.cyan(stage)}:\n`);

  for (const secretName of missingSecrets) {
    lines.push(`  ${chalk.red('✗')} ${chalk.yellow(secretName)}`);
  }

  if (existingSecrets.length > 0) {
    lines.push(`\nExisting secrets (${existingSecrets.length}):`);
    for (const secretName of existingSecrets) {
      lines.push(`  ${chalk.green('✓')} ${chalk.dim(secretName)}`);
    }
  }

  lines.push(`\n${chalk.cyan('Fix:')}`);
  lines.push(`Run these commands to set missing secrets:\n`);

  // Generate fix commands
  for (const secretName of missingSecrets) {
    lines.push(
      chalk.gray(`  npx sst secret set ${secretName} "your-value-here" --stage ${stage}`)
    );
  }

  lines.push(`\n${chalk.dim('Or set all secrets interactively:')}`);
  lines.push(chalk.gray(`  npx sst secret set --stage ${stage}`));

  lines.push(`\n${chalk.dim('To view all secrets:')}`);
  lines.push(chalk.gray(`  npx sst secret list --stage ${stage}`));

  lines.push(`\n${chalk.yellow('⚠️  Warning:')}`);
  lines.push(
    `Without these secrets, deployment will fail with cryptic "RangeError: Invalid string length" errors.`
  );

  return lines.join('\n');
}

/**
 * Check if a project uses SST secrets
 *
 * Quick check to determine if secret validation is needed.
 *
 * @param projectRoot - Absolute path to project root
 * @returns true if project declares any SST secrets
 */
export function projectUsesSecrets(projectRoot: string): boolean {
  const secretNames = extractSecretNames(projectRoot);
  return secretNames.length > 0;
}
