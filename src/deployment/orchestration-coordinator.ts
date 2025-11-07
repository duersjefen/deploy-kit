/**
 * Deployment Orchestration Coordinator
 *
 * High-level coordination of deployment workflow.
 * Orchestrates the sequence of: build → deploy → extract outputs
 */

import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import chalk from 'chalk';
import { formatCommand } from '../utils/package-manager.js';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';

import type { ProjectConfig, DeploymentStage } from '../types.js';
import { extractCloudFrontDistributionId } from './aws-state-manager.js';

const execAsync = promisify(exec);

/**
 * Detect if a project uses SST by checking for sst.config file
 *
 * @param projectRoot - Root directory of the project
 * @returns True if sst.config.ts or sst.config.js exists
 *
 * @example
 * ```typescript
 * if (isSSTProject('/path/to/project')) {
 *   // Project uses SST
 * }
 * ```
 */
export function isSSTProject(projectRoot: string): boolean {
  return (
    existsSync(join(projectRoot, 'sst.config.ts')) ||
    existsSync(join(projectRoot, 'sst.config.js'))
  );
}

/**
 * Run the build command for the project
 *
 * For non-SST projects, executes npm run build or custom hook.
 * SST projects handle building internally during deployment.
 *
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @throws {Error} If build command fails
 *
 * @example
 * ```typescript
 * try {
 *   await runBuild('/project', config);
 *   console.log('Build successful');
 * } catch (error) {
 *   console.error('Build failed:', error.message);
 * }
 * ```
 */
export async function runBuild(projectRoot: string, config: ProjectConfig): Promise<void> {
  const spinner = ora('Building application...').start();

  try {
    if (config.hooks?.postBuild) {
      const { stdout } = await execAsync(config.hooks.postBuild, {
        cwd: projectRoot,
      });
      spinner.info(`Build output: ${stdout}`);
    } else {
      // Default: use detected package manager
      const buildCmd = formatCommand('npm run build', projectRoot);
      await execAsync(buildCmd, {
        cwd: projectRoot,
      });
    }

    spinner.succeed('✅ Build successful');
  } catch (error) {
    spinner.fail('❌ Build failed');
    throw error;
  }
}

/**
 * Execute deployment and extract CloudFront distribution ID
 *
 * Runs SST deployment with real-time streaming output.
 * Extracts the CloudFront distribution ID from the output if found.
 *
 * @param stage - Deployment stage (development, staging, production)
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @returns CloudFront distribution ID if found, null otherwise
 * @throws {Error} If deployment fails
 *
 * @example
 * ```typescript
 * const distId = await executeDeploy('staging', '/project', config);
 * if (distId) {
 *   console.log(`CloudFront ID: ${distId}`);
 * }
 * ```
 */
export async function executeDeploy(
  stage: DeploymentStage,
  projectRoot: string,
  config: ProjectConfig,
  options?: { isDryRun?: boolean }
): Promise<string | null> {
  const isDryRun = options?.isDryRun || false;

  // If dry-run mode, show preview and return early WITHOUT deploying
  if (isDryRun) {
    console.log(chalk.bold.cyan('\n🔍 DRY-RUN MODE: Preview Only'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.yellow('\n⚠️  No AWS resources will be created or modified\n'));

    console.log(chalk.bold('Deployment Configuration:'));
    console.log(chalk.gray('  Stage: ') + chalk.cyan(stage));
    console.log(chalk.gray('  Infrastructure: ') + chalk.cyan(config.infrastructure));

    const stageConfig = config.stageConfig[stage];
    if (stageConfig) {
      if ('domain' in stageConfig && stageConfig.domain) {
        console.log(chalk.gray('  Domain: ') + chalk.cyan(stageConfig.domain));
      }
      if ('awsRegion' in stageConfig && stageConfig.awsRegion) {
        console.log(chalk.gray('  AWS Region: ') + chalk.cyan(stageConfig.awsRegion));
      }
      if ('sstStageName' in stageConfig && stageConfig.sstStageName) {
        console.log(chalk.gray('  SST Stage: ') + chalk.cyan(stageConfig.sstStageName));
      }
    }

    if (config.awsProfile) {
      console.log(chalk.gray('  AWS Profile: ') + chalk.cyan(config.awsProfile));
    }

    if (config.database) {
      console.log(chalk.gray('  Database: ') + chalk.cyan(config.database));
    }

    if (config.healthChecks && config.healthChecks.length > 0) {
      console.log(chalk.gray('  Health Checks: ') + chalk.cyan(`${config.healthChecks.length} configured`));
    }

    console.log(chalk.bold('\n✅ Dry-run complete'));
    console.log(chalk.gray('To execute this deployment, run without --dry-run flag'));
    console.log(chalk.gray('═'.repeat(60) + '\n'));

    return null;
  }

  const spinnerText = `Deploying to ${stage}...`;
  const spinner = ora(spinnerText).start();

  try {
    const stageConfig = config.stageConfig[stage];
    const sstStage = (stageConfig && 'sstStageName' in stageConfig && stageConfig.sstStageName) || stage;

    let deployOutput = '';

    if (config.customDeployScript) {
      // Use custom deployment script
      const { stdout } = await execAsync(`bash ${config.customDeployScript} ${stage}`, {
        cwd: projectRoot,
      });
      deployOutput = stdout;
      spinner.succeed(`✅ Deployed to ${stage}`);
    } else {
      // Default: SST deploy with streaming output
      deployOutput = await runSSTDeployWithStreaming(stage, sstStage, projectRoot, config, spinner);
      spinner.succeed(`✅ Deployed to ${stage}`);
    }

    // Extract CloudFront distribution ID from deployment output
    const distId = extractCloudFrontDistributionId(deployOutput);

    if (distId) {
      spinner.info(`CloudFront distribution ID: ${distId}`);
    }

    return distId;
  } catch (error) {
    spinner.fail(`❌ Deployment to ${stage} failed`);
    throw error;
  }
}

/**
 * Run SST deploy with real-time streaming output
 *
 * Shows the last 4 lines of deployment output with smart formatting:
 * - Blue for building/bundling operations
 * - Green for resource creation
 * - Red for errors
 * - Yellow for applying/installing
 * - Cyan for waiting states
 *
 * @param stage - Deployment stage name
 * @param sstStage - SST-specific stage name
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @param spinner - Ora spinner instance for status updates
 * @returns Complete stdout from SST deployment
 * @throws {Error} If SST deploy exits with non-zero code
 *
 * @internal
 */
async function runSSTDeployWithStreaming(
  stage: DeploymentStage,
  sstStage: string,
  projectRoot: string,
  config: ProjectConfig,
  spinner: ReturnType<typeof ora>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...(config.awsProfile && {
        AWS_PROFILE: config.awsProfile,
      }),
    };

    // Build SST deploy command
    const args = ['sst', 'deploy', '--stage', sstStage];

    const child = spawn('npx', args, {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const outputLines: string[] = [];
    const maxLines = 4; // Reduced for narrow terminals
    let lastUpdateTime = Date.now();

    // Detect terminal width (default to 80 if not available)
    const terminalWidth = process.stdout.columns || 80;
    // Reserve space for indicator (2 chars) and padding
    const maxLineLength = Math.max(40, terminalWidth - 8);

    // Helper to clean ANSI codes and truncate smartly
    const formatLine = (line: string): string => {
      const clean = line.replace(/\x1B\[[0-9;]*m/g, '').trim();

      // Extract the operation type for coloring
      if (clean.includes('Building') || clean.includes('Bundling')) {
        return chalk.blue(truncate(clean, maxLineLength));
      } else if (clean.includes('Created')) {
        return chalk.green(truncate(clean, maxLineLength));
      } else if (clean.includes('Error') || clean.includes('Failed')) {
        return chalk.red(truncate(clean, maxLineLength));
      } else if (clean.includes('Applying') || clean.includes('Installing')) {
        return chalk.yellow(truncate(clean, maxLineLength));
      } else if (clean.includes('Waiting')) {
        return chalk.cyan(truncate(clean, maxLineLength));
      }
      return truncate(clean, maxLineLength);
    };

    const truncate = (str: string, len: number): string => {
      if (str.length <= len) return str;
      return str.substring(0, len - 1) + '…';
    };

    // Handle stdout
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      const lines = chunk.split('\n');
      for (const line of lines) {
        const formatted = formatLine(line);
        if (formatted && formatted.length > 0) {
          outputLines.push(formatted);
          if (outputLines.length > maxLines) {
            outputLines.shift();
          }
        }
      }

      // Update spinner with smart formatting
      const now = Date.now();
      if (now - lastUpdateTime > 250 && outputLines.length > 0) {
        lastUpdateTime = now;
        const displayText = outputLines
          .map((l, i) => {
            const indicator = i === outputLines.length - 1 ? '▸' : '·';
            return `  ${chalk.dim(indicator)} ${l}`;
          })
          .join('\n');

        spinner.text = `Deploying to ${stage}...\n\n${displayText}\n`;
      }
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;

      const lines = chunk.split('\n');
      for (const line of lines) {
        const formatted = chalk.red(truncate(line.replace(/\x1B\[[0-9;]*m/g, '').trim(), maxLineLength));
        if (formatted && formatted.length > 0) {
          outputLines.push(formatted);
          if (outputLines.length > maxLines) {
            outputLines.shift();
          }
        }
      }

      const now = Date.now();
      if (now - lastUpdateTime > 250 && outputLines.length > 0) {
        lastUpdateTime = now;
        const displayText = outputLines
          .map((l, i) => {
            const indicator = i === outputLines.length - 1 ? '▸' : '·';
            return `  ${chalk.dim(indicator)} ${l}`;
          })
          .join('\n');

        spinner.text = `Deploying to ${stage}...\n\n${displayText}\n`;
      }
    });

    // Handle process exit
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        // Build detailed error message with context from both stdout and stderr
        let errorMessage = `SST deployment failed (exit code ${code})\n\n`;

        // Extract last relevant lines from stdout (SST errors often appear there)
        const stdoutLines = stdout.split('\n').filter(l => l.trim().length > 0);
        const relevantStdout = stdoutLines.slice(-15); // Last 15 non-empty lines

        // Extract error lines from stderr
        const stderrLines = stderr.split('\n').filter(l => l.trim().length > 0);

        // Show stderr if present (typically has AWS SDK errors)
        if (stderrLines.length > 0) {
          errorMessage += '━━━ Error Output (stderr) ━━━\n';
          errorMessage += stderrLines.slice(-20).join('\n') + '\n\n';
        }

        // Show recent stdout (SST deployment progress + errors)
        if (relevantStdout.length > 0) {
          errorMessage += '━━━ Recent Deployment Output ━━━\n';
          errorMessage += relevantStdout.join('\n') + '\n\n';
        }

        // Add helpful context
        errorMessage += '━━━ Troubleshooting ━━━\n';
        errorMessage += '• Check AWS credentials and permissions\n';
        errorMessage += '• Review sst.config.ts for configuration errors\n';
        errorMessage += '• Check CloudWatch logs for Lambda errors\n';
        errorMessage += '• Verify domain and DNS settings if applicable\n';

        reject(new Error(errorMessage));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}
