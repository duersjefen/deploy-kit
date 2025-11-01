/**
 * SST Development Command with Pre-flight Checks
 * Wraps `sst dev` with automatic error detection and recovery
 *
 * This is a thin orchestrator that delegates to specialized check modules.
 * Individual checks are in src/cli/dev-checks/
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectConfig } from '../../types.js';
import { runDevChecks } from '../dev-checks/registry.js';
import { startSstDev, type DevOptions } from '../dev-checks/sst-starter.js';

// Re-export types for backward compatibility
export type { DevOptions } from '../dev-checks/sst-starter.js';
export type { CheckResult } from '../dev-checks/types.js';

/**
 * Main dev command entry point
 *
 * Orchestrates the development environment startup:
 * 1. Load project configuration
 * 2. Run pre-flight checks (unless skipped)
 * 3. Start SST dev server
 *
 * @param projectRoot - Absolute path to project root (defaults to cwd)
 * @param options - Command options (skipChecks, port, verbose)
 *
 * @example
 * ```typescript
 * await handleDevCommand('/path/to/project', { port: 3001 });
 * ```
 */
export async function handleDevCommand(
  projectRoot: string = process.cwd(),
  options: DevOptions = {}
): Promise<void> {
  try {
    printHeader();

    // Load config
    const config = loadProjectConfig(projectRoot);

    // Run pre-flight checks unless skipped
    if (!options.skipChecks) {
      console.log(chalk.bold('⚙️  Pre-Flight Checks\n'));
      const requestedPort = options.port || 3000;
      const checksResult = await runDevChecks(projectRoot, config, requestedPort);

      if (!checksResult.allPassed) {
        printCheckFailureMessage();
        process.exit(1);
      }

      console.log(chalk.bold.green('✨ All pre-flight checks passed!\n'));
    }

    // Start SST dev
    await startSstDev(projectRoot, config, options);
  } catch (error) {
    console.error(chalk.red('\n❌ Dev command failed:'), error);
    process.exit(1);
  }
}

/**
 * Print development environment header
 */
function printHeader(): void {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║       🚀 SST Development Environment                       ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
}

/**
 * Print check failure message
 */
function printCheckFailureMessage(): void {
  console.log(chalk.red('\n❌ Pre-flight checks failed. See above for details.'));
  console.log(chalk.gray('\nRun with --skip-checks to bypass (not recommended)\n'));
}

/**
 * Load project configuration from .deploy-config.json
 *
 * @param projectRoot - Project root directory
 * @returns Parsed config or null if not found
 */
function loadProjectConfig(projectRoot: string): ProjectConfig | null {
  const configPath = join(projectRoot, '.deploy-config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Could not parse .deploy-config.json, proceeding without config'));
    return null;
  }
}
