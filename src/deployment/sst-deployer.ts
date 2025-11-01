/**
 * Enhanced SST Deployment with timeout detection and diagnostics
 *
 * Features:
 * - Timeout detection (fails after 15 minutes)
 * - Real-time output streaming
 * - CloudFormation event monitoring
 * - Automatic diagnostics on hang
 * - Detailed logging for debugging
 */

import { spawn } from 'child_process';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DeploymentStage, ProjectConfig } from '../types.js';

const execAsync = promisify(exec);

interface SSTDeploymentOptions {
  stage: DeploymentStage;
  projectRoot: string;
  config: ProjectConfig;
  awsProfile?: string;
  timeoutMinutes?: number;
  logFile?: string;
}

/**
 * Deploy with SST, including timeout detection and real-time monitoring
 */
export async function deploySSTWithMonitoring(
  options: SSTDeploymentOptions
): Promise<void> {
  const {
    stage,
    projectRoot,
    config,
    awsProfile,
    timeoutMinutes = 15,
    logFile = join(projectRoot, `.sst-deploy-${stage}-${Date.now()}.log`),
  } = options;

  const spinner = ora(`Deploying to ${stage}...`).start();
  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  let sstOutput = '';
  let deploymentCompleted = false;
  let deploymentError: Error | null = null;

  return new Promise((resolve, reject) => {
    // Timeout handler
    const timeoutHandle = setTimeout(async () => {
      if (deploymentCompleted) return; // Already finished

      spinner.fail(`⏱️  Deployment timeout (${timeoutMinutes}min)`);
      console.log(chalk.yellow('\n⚠️  Deployment is taking longer than expected...\n'));

      try {
        console.log(chalk.cyan('🔍 Running diagnostics...\n'));

        // Get stack status
        await getCloudFormationStatus(stage, projectRoot, config, awsProfile, logFile);

        // Get Pulumi lock status
        await getPulumiLockStatus(stage, projectRoot, logFile);

        // Suggest recovery
        suggestRecovery(stage, config);
      } catch (diagError) {
        // Diagnostics failed, but we still want to timeout
      }

      // Kill the SST process
      process.kill(-sst.pid!);

      deploymentError = new Error(
        `Deployment exceeded ${timeoutMinutes} minute timeout. CloudFormation may be stuck. ` +
        `Check logs: ${logFile}\nRun: make recover-${stage}`
      );
      reject(deploymentError);
    }, timeoutMs);

    // Start SST deployment
    const env = {
      ...process.env,
      ...(awsProfile && { AWS_PROFILE: awsProfile }),
    };

    const sst = spawn('npx', ['sst', 'deploy', '--stage', stage], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Stream stdout and stderr
    if (sst.stdout) {
      sst.stdout.on('data', (data) => {
        const output = data.toString();
        sstOutput += output;
        appendFileSync(logFile, output);

        // Show progress indicators
        if (output.includes('CREATE_IN_PROGRESS') || output.includes('UPDATE_IN_PROGRESS')) {
          spinner.text = `Deploying to ${stage}... (CloudFormation in progress)`;
        } else if (output.includes('CREATE_COMPLETE') || output.includes('UPDATE_COMPLETE')) {
          spinner.text = `Deploying to ${stage}... (nearly done)`;
        }
      });
    }

    if (sst.stderr) {
      sst.stderr.on('data', (data) => {
        const output = data.toString();
        sstOutput += output;
        appendFileSync(logFile, `[STDERR] ${output}`);
      });
    }

    sst.on('exit', (code) => {
      clearTimeout(timeoutHandle);
      deploymentCompleted = true;

      if (code === 0) {
        spinner.succeed(`✅ Deployed to ${stage}`);
        console.log(chalk.gray(`Logs saved to: ${logFile}\n`));
        resolve();
      } else {
        spinner.fail(`❌ Deployment to ${stage} failed (exit code: ${code})`);
        console.log(chalk.gray(`Logs saved to: ${logFile}\n`));

        if (deploymentError) {
          reject(deploymentError);
        } else {
          reject(
            new Error(
              `SST deployment failed with exit code ${code}. ` +
              `Check logs: ${logFile}\nRun: make recover-${stage}`
            )
          );
        }
      }
    });

    sst.on('error', (error) => {
      clearTimeout(timeoutHandle);
      deploymentCompleted = true;
      spinner.fail(`❌ Failed to start SST deployment: ${error.message}`);
      reject(error);
    });

    // Handle process group termination (for timeout recovery)
    process.on('SIGINT', () => {
      if (!deploymentCompleted) {
        clearTimeout(timeoutHandle);
        process.kill(-sst.pid!);
        deploymentCompleted = true;
        reject(new Error('Deployment interrupted by user'));
      }
    });
  });
}

/**
 * Get CloudFormation stack status
 */
async function getCloudFormationStatus(
  stage: DeploymentStage,
  projectRoot: string,
  config: ProjectConfig,
  awsProfile?: string,
  logFile?: string
): Promise<void> {
  try {
    const env = {
      ...process.env,
      ...(awsProfile && { AWS_PROFILE: awsProfile }),
    };

    // Get stack name
    const stackName = `${config.projectName}-${stage}`;

    // Query stack status and events
    const { stdout: statusOutput } = await execAsync(
      `aws cloudformation describe-stack-resources --stack-name ${stackName} --query 'StackResources[?ResourceStatus!=\`CREATE_COMPLETE\`&&ResourceStatus!=\`UPDATE_COMPLETE\`].{Type:ResourceType,LogicalId:LogicalResourceId,Status:ResourceStatus,Reason:ResourceStatusReason}' --output table`,
      { env }
    ).catch(() => ({ stdout: 'Could not fetch stack status' }));

    console.log(chalk.cyan('CloudFormation Stack Status:\n'));
    console.log(statusOutput);

    if (logFile && statusOutput) {
      appendFileSync(logFile, `\n[DIAGNOSTICS] CloudFormation Stack Status:\n${statusOutput}\n`);
    }

    // Get recent stack events
    const { stdout: eventsOutput } = await execAsync(
      `aws cloudformation describe-stack-events --stack-name ${stackName} --query 'StackEvents[0:10].{Timestamp:Timestamp,Status:ResourceStatus,Reason:ResourceStatusReason}' --output table`,
      { env }
    ).catch(() => ({ stdout: '' }));

    if (eventsOutput) {
      console.log(chalk.cyan('\nRecent CloudFormation Events:\n'));
      console.log(eventsOutput);

      if (logFile) {
        appendFileSync(logFile, `\n[DIAGNOSTICS] Recent CloudFormation Events:\n${eventsOutput}\n`);
      }
    }
  } catch (error) {
    // Silently fail - diagnostics are best-effort
  }
}

/**
 * Get Pulumi lock status
 */
async function getPulumiLockStatus(
  stage: DeploymentStage,
  projectRoot: string,
  logFile?: string
): Promise<void> {
  try {
    const { stdout } = await execAsync('npx sst status --stage ' + stage).catch(() => ({
      stdout: 'Could not fetch Pulumi status',
    }));

    console.log(chalk.cyan('\nPulumi/SST Status:\n'));
    console.log(stdout);

    if (logFile) {
      appendFileSync(logFile, `\n[DIAGNOSTICS] Pulumi Status:\n${stdout}\n`);
    }
  } catch (error) {
    // Silently fail
  }
}

/**
 * Suggest recovery based on deployment failure
 */
function suggestRecovery(stage: DeploymentStage, config: ProjectConfig): void {
  console.log(chalk.yellow('\n💡 Recovery Suggestions:\n'));
  console.log(chalk.gray('1. Run: make recover-' + stage));
  console.log(chalk.gray('   This will unlock Pulumi state and clear deployment locks\n'));
  console.log(chalk.gray('2. Check CloudFormation stack in AWS Console:'));
  console.log(chalk.gray(`   Stack name: ${config.projectName}-${stage}\n`));
  console.log(chalk.gray('3. If Lambda provisioning seems stuck:'));
  console.log(chalk.gray('   Try: npx sst remove --stage ' + stage + ' && make deploy-' + stage + '\n'));
  console.log(chalk.gray('4. Check CloudFront distribution status:'));
  console.log(chalk.gray('   Look for distributions in "pending" or "in progress" state\n'));
}
