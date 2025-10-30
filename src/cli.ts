#!/usr/bin/env node
/**
 * Deploy-Kit CLI Entry Point
 * Production deployment orchestration for SST + Next.js + DynamoDB
 */

import { DeploymentKit } from './deployer.js';
import { getStatusChecker } from './status/checker.js';
import { getRecoveryManager } from './recovery/manager.js';
import type { DeploymentStage } from './types.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const stage = args[1] as DeploymentStage;

// Load config from current directory
let config: any;
try {
  const configPath = resolve(process.cwd(), '.deploy-config.json');
  const configContent = readFileSync(configPath, 'utf-8');
  config = JSON.parse(configContent);
} catch (error) {
  console.error(chalk.red('❌ Error: .deploy-config.json not found in current directory'));
  process.exit(1);
}

// Initialize kit
const kit = new DeploymentKit(config, process.cwd());

async function main() {
  switch (command) {
    case 'deploy':
      if (!stage) {
        console.error(chalk.red('❌ Usage: deploy-kit deploy <stage>'));
        console.error(chalk.gray('   Example: deploy-kit deploy staging'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan(`\n🚀 Deploying to ${stage}...\n`));
      const result = await kit.deploy(stage);

      console.log(chalk.bold('\n' + '='.repeat(50)));
      console.log(chalk.bold('Deployment Result'));
      console.log(chalk.bold('='.repeat(50)) + '\n');

      if (result.success) {
        console.log(chalk.green.bold(result.message));
      } else {
        console.log(chalk.red.bold(result.message));
        if (result.error) {
          console.log(chalk.red(`Error: ${result.error}`));
        }
      }

      console.log(chalk.gray(`\nDuration: ${result.durationSeconds}s`));
      if (result.details.backupPath) {
        console.log(chalk.gray(`Backup: ${result.details.backupPath}`));
      }
      console.log('\n');

      process.exit(result.success ? 0 : 1);
      break;

    case 'status':
      if (!stage) {
        console.log(chalk.bold.cyan('\n📊 Checking all deployment statuses...\n'));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkAllStages();
      } else {
        console.log(chalk.bold.cyan(`\n📊 Checking ${stage} status...\n`));
        const statusChecker = getStatusChecker(config, process.cwd());
        await statusChecker.checkStage(stage);
      }
      break;

    case 'recover':
      if (!stage) {
        console.error(chalk.red('❌ Usage: deploy-kit recover <stage>'));
        process.exit(1);
      }

      console.log(chalk.bold.yellow(`\n🔧 Recovering ${stage}...\n`));
      const recovery = getRecoveryManager(config);
      await recovery.performFullRecovery(stage);
      break;

    case 'health':
      if (!stage) {
        console.error(chalk.red('❌ Usage: deploy-kit health <stage>'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan(`\n🏥 Running health checks for ${stage}...\n`));
      const healthy = await kit.validateHealth(stage);
      process.exit(healthy ? 0 : 1);
      break;

    case '--version':
    case '-v':
      console.log('deploy-kit 1.0.0');
      break;

    case '--help':
    case '-h':
    case 'help':
      console.log(chalk.bold('\nDeploy-Kit CLI\n'));
      console.log('Usage: deploy-kit <command> [stage]\n');
      console.log('Commands:');
      console.log('  deploy <stage>   - Deploy to specified stage (staging|production)');
      console.log('  status [stage]   - Check deployment status (all stages or specific)');
      console.log('  recover <stage>  - Recover from failed deployment');
      console.log('  health <stage>   - Run health checks');
      console.log('  --help, -h       - Show this help message');
      console.log('  --version, -v    - Show version\n');
      console.log('Examples:');
      console.log('  deploy-kit deploy staging');
      console.log('  deploy-kit status');
      console.log('  deploy-kit recover production');
      console.log('  deploy-kit health staging\n');
      break;

    default:
      console.error(chalk.red(`❌ Unknown command: ${command}`));
      console.error(chalk.gray('Run: deploy-kit --help'));
      process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('\n❌ Deployment error:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});
