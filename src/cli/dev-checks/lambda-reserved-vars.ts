/**
 * Lambda Reserved Environment Variables Check
 * Detects usage of reserved AWS Lambda environment variables in SST config
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import {
  findReservedVarsInSstConfig,
  formatReservedVarError,
  type ReservedVarViolation,
} from '../../lib/lambda-reserved-vars.js';

export function createLambdaReservedVarsCheck(
  projectRoot: string,
  verbose: boolean = false
): () => Promise<CheckResult> {
  return async () => {
    if (verbose) {
      console.log(chalk.gray('🔍 [DEBUG] Checking for reserved Lambda environment variables...'));
    } else {
      console.log(chalk.gray('🔍 Checking for reserved Lambda environment variables...'));
    }

    // Look for sst.config.ts or sst.config.js
    const configPaths = [
      join(projectRoot, 'sst.config.ts'),
      join(projectRoot, 'sst.config.js'),
    ];

    let configPath: string | null = null;
    let configContent: string | null = null;

    for (const path of configPaths) {
      if (existsSync(path)) {
        configPath = path;
        try {
          configContent = readFileSync(path, 'utf-8');
          break;
        } catch (error) {
          if (verbose) {
            console.log(chalk.yellow(`⚠️  [DEBUG] Could not read ${path}: ${(error as Error).message}`));
          }
        }
      }
    }

    if (!configPath || !configContent) {
      if (verbose) {
        console.log(chalk.yellow('⚠️  [DEBUG] No SST config file found, skipping check\n'));
      }
      console.log(chalk.green('✅ Skipped (no SST config found)\n'));
      return { passed: true };
    }

    if (verbose) {
      console.log(chalk.gray(`   [DEBUG] Parsing ${configPath}...`));
    }

    // Find reserved variables in the config
    const violations = findReservedVarsInSstConfig(configContent);

    if (violations.length === 0) {
      console.log(chalk.green('✅ No reserved variables detected\n'));
      return { passed: true };
    }

    // Found reserved variables - report error
    const errorMessage = formatReservedVarError(violations);

    if (verbose) {
      console.log(chalk.gray(`   [DEBUG] Found ${violations.length} violation(s)\n`));
    }

    return {
      passed: false,
      issue: `Reserved AWS Lambda environment variables detected in ${configPath.split('/').pop()}`,
      manualFix: errorMessage,
      canAutoFix: false, // Cannot auto-fix - requires manual code changes
    };
  };
}
