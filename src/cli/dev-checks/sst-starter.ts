/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */

import chalk from 'chalk';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import type { ProjectConfig } from '../../types.js';
import { handleSstDevError } from './error-handler.js';
import { SstProcessManager } from './sst-process-manager.js';

export interface DevOptions {
  skipChecks?: boolean;   // Skip pre-flight checks (for advanced users)
  port?: number;          // Custom port (default: 3000)
  interactive?: boolean;  // Run interactive wizard
  verbose?: boolean;      // Enable verbose output for checks
}

/**
 * Start SST dev server with proper environment and error handling
 * Now includes dashboard integration for real-time monitoring
 */
export async function startSstDev(
  projectRoot: string,
  config: ProjectConfig | null,
  options: DevOptions
): Promise<void> {
  // Determine which port to use (priority: user flag > auto-selected > default 3000)
  const selectedPort = options.port
    || (process.env.DEPLOY_KIT_SELECTED_PORT ? parseInt(process.env.DEPLOY_KIT_SELECTED_PORT) : null)
    || 3000;

  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.cyan('🚀 Starting SST dev server...\n'));

  // Build command string (all args are static, safe for shell)
  // Use --mode=mono for single-stream output with progress indicators
  // (better than --mode=basic which is too bare-bones, more stable than full TUI)
  let command = 'npx sst dev --mode=mono';

  if (selectedPort !== 3000) {
    command += ` --port=${selectedPort}`;
  }

  const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;

  try {
    // Create SST process manager with dashboard integration
    const manager = new SstProcessManager({
      projectRoot,
      command,
      port: selectedPort,
      env: {
        ...(profile && { AWS_PROFILE: profile }),
      },
      verbose: options.verbose,
    });

    // Start the process (handles output parsing and event emission)
    await manager.start();

    // Wait for process to exit
    const exitCode = await manager.waitForExit();

    if (exitCode !== 0) {
      throw new Error(`SST exited with code ${exitCode}`);
    }
  } catch (error) {
    console.error(chalk.red('\n❌ SST dev failed\n'));
    await handleSstDevError(error as Error, projectRoot);
    process.exit(1);
  }
}
