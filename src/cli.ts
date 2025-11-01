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
    console.error(chalk.red('\n❌ Init error:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
  process.exit(0);
}

if (command === 'validate') {
  handleValidateCommand(process.cwd()).catch(error => {
    console.error(chalk.red('\n❌ Validation error:'));
    console.error(chalk.red(error.message));
    process.exit(1);
  });
  process.exit(0);
}

if (command === 'doctor') {
  handleDoctorCommand(process.cwd()).catch(error => {
    console.error(chalk.red('\n❌ Doctor error:'));
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
  // Version is managed in package.json and updated during builds
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
  console.error(chalk.red('❌ Error: .deploy-config.json not found in current directory'));
  process.exit(1);
}

// Initialize kit with the project root where the config file is located
const kit = new DeploymentKit(config, projectRoot);

async function main() {
  switch (command) {
    case 'deploy':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit deploy <stage>'));
        console.error(chalk.gray('   Example: deploy-kit deploy staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\n❌ Invalid stage: ${stage}`));
        console.error(chalk.gray('   Valid stages: staging, production'));
        process.exit(1);
      }

      const result = await kit.deploy(stage);

      // Deployment result is now printed by the deployer itself
      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
      break;

    case 'status':
      if (!stage) {
        console.log(chalk.bold.cyan('\n📊 Checking all deployment statuses...'));
        console.log(chalk.gray('Analyzing deployment state across all stages\n'));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkAllStages();
      } else {
        console.log(chalk.bold.cyan(`\n📊 Checking ${stage} deployment status...`));
        console.log(chalk.gray('Analyzing current deployment state\n'));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkStage(stage);
      }
      break;

    case 'recover':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit recover <stage>'));
        console.error(chalk.gray('   Example: deploy-kit recover staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\n❌ Invalid stage: ${stage}`));
        console.error(chalk.gray('   Valid stages: staging, production'));
        process.exit(1);
      }

      console.log(chalk.bold.yellow(`\n🔧 Recovering ${stage} deployment...`));
      console.log(chalk.gray('Clearing locks and preparing for retry\n'));
      const recovery = getRecoveryManager(config, projectRoot);
      await recovery.performFullRecovery(stage);
      console.log(chalk.green('\n✅ Recovery complete - ready to redeploy\n'));
      break;

    case 'health':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit health <stage>'));
        console.error(chalk.gray('   Example: deploy-kit health staging'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan(`\n🏥 Running health checks for ${stage}...`));
      console.log(chalk.gray('Testing deployed application health\n'));
      const healthy = await kit.validateHealth(stage);

      if (healthy) {
        console.log(chalk.green('\n✅ All health checks passed\n'));
        process.exit(0);
      } else {
        console.log(chalk.red('\n❌ Some health checks failed\n'));
        process.exit(1);
      }
      break;

    case 'cloudfront':
      const cfSubcommand = stage; // For cloudfront, second arg is subcommand
      const cfArgs = args.slice(2);
      await handleCloudFrontCommand(cfSubcommand, cfArgs, config, projectRoot);
      process.exit(0);
      break;

    default:
      if (command) {
        console.error(chalk.red(`\n❌ Unknown command: ${command}`));
      } else {
        console.error(chalk.red('\n❌ No command specified'));
      }
      console.error(chalk.gray('Run: deploy-kit --help\n'));
      process.exit(1);
  }
}

function printHelpMessage(): void {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║       🚀 Deploy-Kit: Sophisticated Deployment Toolkit     ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.bold('USAGE'));
  console.log(chalk.gray('  deploy-kit <command> [stage]\n'));

  console.log(chalk.bold('COMMANDS'));
  console.log(chalk.green('  init'));
  console.log(chalk.gray('    Interactive setup wizard for new projects'));
  console.log(chalk.gray('    Creates .deploy-config.json, Makefile, and npm scripts'));
  console.log(chalk.gray('    Example: deploy-kit init\n'));

  console.log(chalk.green('  validate'));
  console.log(chalk.gray('    Validate .deploy-config.json configuration'));
  console.log(chalk.gray('    Checks: syntax, required fields, domains, health checks'));
  console.log(chalk.gray('    Example: deploy-kit validate\n'));

  console.log(chalk.green('  doctor'));
  console.log(chalk.gray('    Comprehensive pre-deployment health check'));
  console.log(chalk.gray('    Checks: config, git, AWS, SST, Node.js, tests'));
  console.log(chalk.gray('    Example: deploy-kit doctor\n'));

  console.log(chalk.green('  deploy <stage>'));
  console.log(chalk.gray('    Deploy to specified stage with full safety checks'));
  console.log(chalk.gray('    Stages: staging, production'));
  console.log(chalk.gray('    Example: deploy-kit deploy staging\n'));

  console.log(chalk.green('  status [stage]'));
  console.log(chalk.gray('    Check deployment status for all stages or specific stage'));
  console.log(chalk.gray('    Detects: active locks, Pulumi state, previous failures'));
  console.log(chalk.gray('    Example: deploy-kit status\n'));

  console.log(chalk.green('  recover <stage>'));
  console.log(chalk.gray('    Recover from failed deployment'));
  console.log(chalk.gray('    Clears locks and prepares for retry'));
  console.log(chalk.gray('    Example: deploy-kit recover staging\n'));

  console.log(chalk.green('  health <stage>'));
  console.log(chalk.gray('    Run health checks for deployed application'));
  console.log(chalk.gray('    Tests: connectivity, database, API endpoints'));
  console.log(chalk.gray('    Example: deploy-kit health production\n'));

  console.log(chalk.green('  cloudfront <subcommand>'));
  console.log(chalk.gray('    Manage and audit CloudFront distributions'));
  console.log(chalk.gray('    Subcommands: audit, cleanup, report'));
  console.log(chalk.gray('    Example: deploy-kit cloudfront audit\n'));

  console.log(chalk.green('  --help, -h'));
  console.log(chalk.gray('    Show this help message\n'));

  console.log(chalk.green('  --version, -v'));
  console.log(chalk.gray('    Show version\n'));

  console.log(chalk.bold('FEATURES'));
  console.log(chalk.gray('  ✅ 5-stage automated deployment pipeline'));
  console.log(chalk.gray('  ✅ Integrated SSL certificate management'));
  console.log(chalk.gray('  ✅ Pre-deployment safety checks (git, tests, AWS)'));
  console.log(chalk.gray('  ✅ Post-deployment health validation'));
  console.log(chalk.gray('  ✅ Dual-lock deployment safety system'));
  console.log(chalk.gray('  ✅ CloudFront cache invalidation'));
  console.log(chalk.gray('  ✅ Comprehensive error recovery\n'));

  console.log(chalk.bold('EXAMPLES'));
  console.log(chalk.cyan('  # Initialize a new project'));
  console.log(chalk.gray('  $ deploy-kit init\n'));

  console.log(chalk.cyan('  # Validate configuration'));
  console.log(chalk.gray('  $ deploy-kit validate\n'));

  console.log(chalk.cyan('  # Run pre-deployment checks'));
  console.log(chalk.gray('  $ deploy-kit doctor\n'));

  console.log(chalk.cyan('  # Deploy to staging with full checks'));
  console.log(chalk.gray('  $ deploy-kit deploy staging\n'));

  console.log(chalk.cyan('  # Check deployment status'));
  console.log(chalk.gray('  $ deploy-kit status\n'));

  console.log(chalk.cyan('  # Recover from failure'));
  console.log(chalk.gray('  $ deploy-kit recover staging\n'));

  console.log(chalk.cyan('  # Validate health'));
  console.log(chalk.gray('  $ deploy-kit health production\n'));

  console.log(chalk.bold('DOCUMENTATION'));
  console.log(chalk.gray('  GitHub: https://github.com/duersjefen/deploy-kit'));
  console.log(chalk.gray('  Issues: https://github.com/duersjefen/deploy-kit/issues\n'));
}

main().catch(error => {
  console.error(chalk.red('\n❌ Deployment error:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});
