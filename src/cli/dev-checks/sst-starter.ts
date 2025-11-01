/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */

import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import type { ProjectConfig } from '../../types.js';
import { handleSstDevError } from './error-handler.js';

export interface DevOptions {
  skipChecks?: boolean;  // Skip pre-flight checks (for advanced users)
  port?: number;         // Custom port (default: 3000)
  verbose?: boolean;     // Verbose output
}

/**
 * Start SST dev server with proper environment and error handling
 */
export async function startSstDev(
  projectRoot: string,
  config: ProjectConfig | null,
  options: DevOptions
): Promise<void> {
  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.cyan('🚀 Starting SST dev server...\n'));

  const args = ['sst', 'dev'];

  if (options.port) {
    args.push(`--port=${options.port}`);
  }

  const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;

  try {
    const child: ChildProcess = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(profile && { AWS_PROFILE: profile }),
      },
    });

    // Handle graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow('\n\n🛑 Stopping SST dev server...'));
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
    await handleSstDevError(error as Error);
    process.exit(1);
  }
}
