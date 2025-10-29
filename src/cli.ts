#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { DeploymentKit } from './deployer.js';
import { ProjectConfig, DeploymentStage } from './types.js';

/**
 * CLI interface for deploy-kit
 *
 * Usage:
 *   npx martijn-deploy deploy <stage>
 *   npx martijn-deploy status [stage]
 *   npx martijn-deploy recover <stage>
 */

const args = process.argv.slice(2);
const command = args[0];
const stage = args[1] as DeploymentStage;

async function main() {
  try {
    // Load project config
    const configPath = join(process.cwd(), '.deploy-config.json');
    let config: ProjectConfig;

    try {
      const raw = readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch (error) {
      console.error(
        chalk.red(
          '❌ Error: .deploy-config.json not found\n' +
          'Create a .deploy-config.json file in your project root'
        )
      );
      process.exit(1);
    }

    const deployer = new DeploymentKit(config);

    // Commands
    switch (command) {
      case 'deploy': {
        if (!stage) {
          console.error(chalk.red('❌ Stage required. Usage: martijn-deploy deploy <stage>'));
          process.exit(1);
        }

        const result = await deployer.deploy(stage);
        console.log(`\n${result.message}`);
        console.log(`Duration: ${result.durationSeconds}s\n`);

        if (!result.success) {
          console.error(chalk.red(`Error: ${result.error}`));
          process.exit(1);
        }
        break;
      }

      case 'status': {
        if (stage) {
          await deployer.getStatus(stage);
        } else {
          for (const s of ['dev', 'staging', 'production'] as DeploymentStage[]) {
            await deployer.getStatus(s);
            console.log('');
          }
        }
        break;
      }

      case 'recover': {
        if (!stage) {
          console.error(chalk.red('❌ Stage required. Usage: martijn-deploy recover <stage>'));
          process.exit(1);
        }

        await deployer.recover(stage);
        break;
      }

      case 'health': {
        if (!stage) {
          console.error(chalk.red('❌ Stage required. Usage: martijn-deploy health <stage>'));
          process.exit(1);
        }

        const healthy = await deployer.validateHealth(stage);
        process.exit(healthy ? 0 : 1);
        break;
      }

      case '--help':
      case '-h':
      case 'help': {
        console.log(`
${chalk.bold('martijn-deploy')} - Deployment system for SST + Next.js projects

${chalk.bold('Usage:')}
  martijn-deploy <command> [stage]

${chalk.bold('Commands:')}
  deploy <stage>       Deploy to stage (dev, staging, production)
  status [stage]       Check deployment status
  recover <stage>      Recover from failed deployment
  health <stage>       Validate health checks
  help                 Show this help message

${chalk.bold('Examples:')}
  martijn-deploy deploy staging
  martijn-deploy status
  martijn-deploy recover production
        `);
        break;
      }

      default: {
        console.error(
          chalk.red(`❌ Unknown command: ${command}\n`) +
          chalk.gray('Run with --help for usage')
        );
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error}\n`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red(`\nFatal error: ${error}\n`));
  process.exit(1);
});
