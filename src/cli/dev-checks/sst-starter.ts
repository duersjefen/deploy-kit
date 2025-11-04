/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */

import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import type { ProjectConfig } from '../../types.js';
import { handleSstDevError } from './error-handler.js';
import { EnhancedOutputHandler } from './enhanced-output-handler.js';

export interface DevOptions {
  skipChecks?: boolean;   // Skip pre-flight checks (for advanced users)
  port?: number;          // Custom port (default: 3000)
  verbose?: boolean;      // Verbose output (overrides profile)
  quiet?: boolean;        // Minimal output (only errors) - DEPRECATED, use profile='silent'
  native?: boolean;       // Use native SST output (no filtering)
  profile?: 'silent' | 'normal' | 'verbose' | 'debug';  // Output profile
  hideInfo?: boolean;     // Suppress info/debug logs
  noGroup?: boolean;      // Disable message grouping
  interactive?: boolean;  // Run interactive wizard
}

/**
 * Start SST dev server with proper environment and error handling
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

  if (selectedPort !== 3000) {
    console.log(chalk.cyan(`   Frontend: http://localhost:${selectedPort}`));
    console.log(chalk.gray(`   SST Console: http://localhost:13561\n`));
  }

  // Determine if we should use output handler
  // Use output handler when: NOT quiet AND NOT native
  // (quiet is deprecated but still supported for backwards compatibility)
  const useOutputHandler = !options.quiet && !options.native;

  // Determine output profile
  let outputProfile: 'silent' | 'normal' | 'verbose' | 'debug' = 'normal';
  if (options.quiet) {
    outputProfile = 'silent';  // Backwards compatibility
  } else if (options.profile) {
    outputProfile = options.profile;
  }

  // Build command string (all args are static, safe for shell)
  // TEMPORARY: Removed --mode=basic to debug
  let command = 'npx sst dev';

  if (selectedPort !== 3000) {
    command += ` --port=${selectedPort}`;
  }

  const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;

  try {
    // TEMPORARY: Use 'inherit' for all stdio to debug
    // This bypasses our output handler to see if SST actually works
    const stdio = 'inherit';

    // Use shell with command string (safe - all args are static)
    // This allows SST to detect TTY properly even with piped stdio
    const child: ChildProcess = spawn(command, {
      stdio,
      shell: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(profile && { AWS_PROFILE: profile }),
      },
    });

    // Set up output handler if not in quiet/native mode
    let outputHandler: EnhancedOutputHandler | null = null;
    if (useOutputHandler && child.stdout && child.stderr) {
      outputHandler = new EnhancedOutputHandler({
        projectRoot,
        profile: outputProfile,
        verbose: options.verbose,
        hideInfo: options.hideInfo,
        noGroup: options.noGroup,
      });

      child.stdout.on('data', (data: Buffer) => {
        outputHandler!.processStdout(data);
      });

      child.stderr.on('data', (data: Buffer) => {
        outputHandler!.processStderr(data);
      });
    }

    // Handle graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow('\n\n🛑 Stopping SST dev server...'));
      if (outputHandler) {
        outputHandler.flush();
      }
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGINT');
        } catch (err) {
          // Process may have already exited
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (outputHandler) {
          outputHandler.flush();
        }
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`SST exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  } catch (error) {
    console.error(chalk.red('\n❌ SST dev failed\n'));
    await handleSstDevError(error as Error, projectRoot);
    process.exit(1);
  }
}
