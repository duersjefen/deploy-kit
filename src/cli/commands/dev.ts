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
import { InteractiveWizard } from '../dev-checks/interactive-wizard.js';
import { getFormattedVersion } from '../utils/version.js';
import { DashboardServer } from '../../dashboard/server.js';
import { getEventEmitter } from '../../dashboard/event-emitter.js';
import { createDashboardReadyEvent } from '../../dashboard/index.js';
import { runLifecycleHook } from '../../lib/lifecycle-hooks.js';

// Re-export types for backward compatibility
export type { DevOptions } from '../dev-checks/sst-starter.js';
export type { CheckResult } from '../dev-checks/types.js';

/**
 * Start dashboard server with auto-increment on port conflict
 *
 * Tries to start the dashboard on ports startPort through startPort + maxAttempts - 1.
 * If a port is already in use, automatically tries the next port.
 *
 * @param startPort - Starting port to try (default: 5173)
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Dashboard server instance and connection info
 * @throws {Error} If all ports in range are occupied
 */
async function startDashboardWithAutoIncrement(
  startPort: number = 5173,
  maxAttempts: number = 10
): Promise<{ server: DashboardServer; url: string; port: number }> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const server = new DashboardServer({ port });

    try {
      const { url, port: actualPort } = await server.start();

      // Show warning if we had to increment
      if (i > 0) {
        console.log(chalk.yellow(`⚠️  Port ${startPort} was in use, using port ${actualPort} instead\n`));
      }

      return { server, url, port: actualPort };
    } catch (error) {
      lastError = error as Error;

      // Only retry if it's a port conflict
      if (lastError.message.includes('already in use')) {
        await server.stop().catch(() => {}); // Clean up
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // All ports exhausted
  throw new Error(
    `Dashboard ports ${startPort}-${startPort + maxAttempts - 1} are all in use. ` +
    `Try killing processes or use a different port range.`
  );
}

/**
 * Main dev command entry point
 * 
 * Orchestrates the development environment startup with automatic error detection:
 * 1. Load and validate project configuration from .deploy-config.json
 * 2. Run pre-flight checks (AWS credentials, SST locks, recursive invocation, etc.)
 * 3. Start SST dev server with optional port override
 * 
 * Pre-flight checks can be skipped with --skip-checks but this is not recommended
 * as checks catch common configuration errors early.
 * 
 * @param projectRoot - Absolute path to project root (defaults to process.cwd())
 * @param options - Command options with optional port, skipChecks, and verbose flags
 * @returns Promise that resolves when dev server starts (or rejects on error)
 * 
 * @throws {Error} If configuration is invalid or checks fail
 * 
 * @example
 * ```typescript
 * await handleDevCommand('/path/to/project', { port: 3001 });
 * // Runs checks and starts dev server on port 3001
 * ```
 */
export async function handleDevCommand(
  projectRoot: string = process.cwd(),
  options: DevOptions = {}
): Promise<void> {
  let dashboardServer: DashboardServer | null = null;

  try {
    printHeader();

    // Load config
    const config = loadProjectConfig(projectRoot);

    // Start dashboard server with auto-increment (5173-5182)
    const dashboardPort = await startDashboardWithAutoIncrement(5173, 10);
    dashboardServer = dashboardPort.server;
    const { url, port } = dashboardPort;

    // Emit dashboard ready event
    const emitter = getEventEmitter();
    emitter.emitEvent(createDashboardReadyEvent(url, port));

    // Run interactive wizard if requested
    if (options.interactive) {
      const wizard = new InteractiveWizard(projectRoot, config);
      const wizardResult = await wizard.run();

      if (!wizardResult || !wizardResult.proceed) {
        console.log(chalk.yellow('\n⚠️  Dev environment setup cancelled\n'));
        await dashboardServer.stop();
        process.exit(0);
      }

      // Apply wizard selections to options
      options.port = wizardResult.port;
    }

    // Run pre-flight checks unless skipped
    if (!options.skipChecks) {
      const requestedPort = options.port || 3000;
      const checksResult = await runDevChecks(projectRoot, config, requestedPort, options.verbose || false);

      if (!checksResult.allPassed) {
        printCheckFailureMessage();
        await dashboardServer.stop();
        process.exit(1);
      }
    }

    // Run preDev hook if defined (DEP-37)
    // Use 'dev' as stage for dev environment (lifecycle hooks expect a stage)
    const hookSuccess = await runLifecycleHook('pre-dev', {
      stage: 'staging', // Use 'staging' as placeholder (dev hooks don't use stage-specific versions)
      isDryRun: false,
      startTime: new Date(),
      projectRoot,
    });

    if (!hookSuccess) {
      console.log(chalk.red('\n❌ preDev hook failed - aborting dev server start\n'));
      await dashboardServer.stop();
      process.exit(1);
    }

    // Start SST dev
    await startSstDev(projectRoot, config, options);
  } catch (error) {
    console.error(chalk.red('\n❌ Dev command failed:'), error);
    if (dashboardServer) {
      await dashboardServer.stop();
    }
    process.exit(1);
  }
}

/**
 * Print ASCII art banner for development environment
   *
   * Displays a visual header showing the SST dev environment is starting.
   * Improves user experience with clear visual feedback.
   */
function printHeader(): void {
  const version = getFormattedVersion();
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║       🚀 SST Development Environment                       ║'));
  console.log(chalk.bold.cyan(`║       Deploy-Kit ${version.padEnd(43)} ║`));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
}

/**
 * Print helpful message when pre-flight checks fail
   * 
   * Displays failure summary and provides option to skip checks in future runs.
   * Helps users understand why dev command failed.
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
