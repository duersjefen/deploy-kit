#!/usr/bin/env node
/**
 * Deploy-Kit CLI Entry Point
 * Production deployment orchestration for SST + Next.js + DynamoDB
 */

import { DeploymentKit } from './deployer.js';
import { getStatusChecker } from './status/checker.js';
import { getRecoveryManager } from './recovery/manager.js';
import { runInit } from './cli/init.js';
import { handleCloudFrontCommand } from './cli/commands/cloudfront.js';
import { handleValidateCommand } from './cli/commands/validate.js';
import { handleDoctorCommand } from './cli/commands/doctor.js';
import type { DeploymentStage } from './types.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const stage = args[1] as DeploymentStage;

// Handle commands that don't require config file
if (command === 'init') {
  runInit(process.cwd()).catch(error => {
    console.error(chalk.red('\\nInit error:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
  process.exit(0);
}

if (command === 'validate') {
  handleValidateCommand(process.cwd()).catch(error => {
    console.error(chalk.red('\\nValidation error:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
  process.exit(0);
}

if (command === 'doctor') {
  handleDoctorCommand(process.cwd()).catch(error => {
    console.error(chalk.red('\\nDoctor error:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
  process.exit(0);
}

if (command === '--help' || command === '-h' || command === 'help') {
  printHelpMessage();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  const version = '1.4.0';
  console.log(`deploy-kit ${version}`);
  process.exit(0);
}

// Load config from current directory
let config: any;
let projectRoot: string;
try {
  const configPath = resolve(process.cwd(), '.deploy-config.json');
  projectRoot = dirname(configPath);
  const configContent = readFileSync(configPath, 'utf-8');
  config = JSON.parse(configContent);
} catch (error) {
  console.error(chalk.red('Error: .deploy-config.json not found in current directory'));
  process.exit(1);
}

const kit = new DeploymentKit(config, projectRoot);

async function main() {
  switch (command) {
    case 'deploy':
      if (!stage) {
        console.error(chalk.red('\\nUsage: deploy-kit deploy <stage>'));
        console.error(chalk.gray('  Example: deploy-kit deploy staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\\nInvalid stage: ${stage}`));
        console.error(chalk.gray('  Valid stages: staging, production'));
        process.exit(1);
      }

      const result = await kit.deploy(stage);
      process.exit(result.success ? 0 : 1);
      break;

    case 'status':
      if (!stage) {
        console.log(chalk.bold.cyan('\\nChecking all deployment statuses...'));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkAllStages();
      } else {
        console.log(chalk.bold.cyan(`\\nChecking ${stage} deployment status...`));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkStage(stage);
      }
      break;

    case 'recover':
      if (!stage) {
        console.error(chalk.red('\\nUsage: deploy-kit recover <stage>'));
        console.error(chalk.gray('  Example: deploy-kit recover staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\\nInvalid stage: ${stage}`));
        console.error(chalk.gray('  Valid stages: staging, production'));
        process.exit(1);
      }

      console.log(chalk.bold.yellow(`\\nRecovering ${stage} deployment...`));
      const recovery = getRecoveryManager(config, projectRoot);
      await recovery.performFullRecovery(stage);
      console.log(chalk.green('\\nRecovery complete - ready to redeploy\\n'));
      break;

    case 'health':
      if (!stage) {
        console.error(chalk.red('\\nUsage: deploy-kit health <stage>'));
        console.error(chalk.gray('  Example: deploy-kit health staging'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan(`\\nRunning health checks for ${stage}...`));
      const healthy = await kit.validateHealth(stage);

      if (healthy) {
        console.log(chalk.green('\\nAll health checks passed\\n'));
        process.exit(0);
      } else {
        console.log(chalk.red('\\nSome health checks failed\\n'));
        process.exit(1);
      }
      break;

    case 'cloudfront':
      const cfSubcommand = stage;
      const cfArgs = args.slice(2);
      await handleCloudFrontCommand(cfSubcommand, cfArgs, config, projectRoot);
      process.exit(0);
      break;

    default:
      if (command) {
        console.error(chalk.red(`\\nUnknown command: ${command}`));
      } else {
        console.error(chalk.red('\\nNo command specified'));
      }
      console.error(chalk.gray('Run: deploy-kit --help\\n'));
      process.exit(1);
  }
}

function printHelpMessage(): void {
  console.log(chalk.bold.cyan('\\nDeploy-Kit: Sophisticated Deployment Toolkit\\n'));
  console.log(chalk.bold('COMMANDS'));
  console.log(chalk.green('  init') + ' - Initialize a new project');
  console.log(chalk.green('  validate') + ' - Validate .deploy-config.json');
  console.log(chalk.green('  doctor') + ' - Pre-deployment health check');
  console.log(chalk.green('  deploy <stage>') + ' - Deploy to a stage');
  console.log(chalk.green('  status [stage]') + ' - Check deployment status');
  console.log(chalk.green('  recover <stage>') + ' - Recover from failed deployment');
  console.log(chalk.green('  health <stage>') + ' - Run health checks');
  console.log(chalk.green('  cloudfront <cmd>') + ' - Manage CloudFront distributions');
  console.log(chalk.green('  --help, -h') + ' - Show this help');
  console.log(chalk.green('  --version, -v') + ' - Show version\\n');
}

main().catch(error => {
  console.error(chalk.red('\\nDeployment error:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});
