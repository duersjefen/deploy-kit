/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */

import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import type { ProjectConfig } from '../../types.js';
import { handleSstDevError } from './error-handler.js';
import { SstOutputHandler } from './sst-output-handler.js';

export interface DevOptions {
  skipChecks?: boolean;  // Skip pre-flight checks (for advanced users)
  port?: number;         // Custom port (default: 3000)
  verbose?: boolean;     // Verbose output
  quiet?: boolean;       // Minimal output (only errors)
  native?: boolean;      // Use native SST output (no filtering)
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

  const args = ['sst', 'dev'];

  // Determine if we should use output handler
  // Use output handler when: NOT quiet AND NOT native
  const useOutputHandler = !options.quiet && !options.native;

  // When using output handler, add --mode=mono for clean sequential output
  // (better for parsing and filtering)
  if (useOutputHandler) {
    args.push('--mode=mono');
  }

  if (selectedPort !== 3000) {
    args.push(`--port=${selectedPort}`);
  }

  const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;

  try {
    // Use 'inherit' for quiet/native mode, otherwise capture for processing
    const stdio: 'inherit' | ['inherit', 'pipe', 'pipe'] = useOutputHandler
      ? ['inherit', 'pipe', 'pipe']
      : 'inherit';

    const child: ChildProcess = spawn('npx', args, {
      stdio,
      shell: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(profile && { AWS_PROFILE: profile }),
      },
    });

    // Set up output handler if not in quiet mode
    let outputHandler: SstOutputHandler | null = null;
    if (useOutputHandler && child.stdout && child.stderr) {
      outputHandler = new SstOutputHandler({
        verbose: options.verbose || false,
        projectRoot,
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
