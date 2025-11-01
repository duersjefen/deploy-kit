/**
 * Config validation command
 * Checks .deploy-config.json for errors and issues
 */

import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { validateConfig, printValidationResult, type UnvalidatedConfig } from '../utils/config-validator.js';

export async function handleValidateCommand(projectRoot: string = process.cwd()): Promise<void> {
  const configPath = join(projectRoot, '.deploy-config.json');

  // Check if config exists
  if (!existsSync(configPath)) {
    console.error(chalk.red('\n❌ .deploy-config.json not found in current directory'));
    console.error(chalk.gray('   Run: npx deploy-kit init\n'));
    process.exit(1);
  }

  // Parse config
  let config: UnvalidatedConfig;
  try {
    const content = readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch (error) {
    console.error(chalk.red('\n❌ Invalid JSON in .deploy-config.json'));
    console.error(chalk.gray(`   Error: ${(error as any).message}\n`));
    process.exit(1);
  }

  // Validate config
  const result = validateConfig(config);

  // Print header
  console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.cyan('🔍 Configuration Validation'));
  console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');

  // Print config summary
  console.log(chalk.bold('Configuration Summary:'));
  console.log(`  Project: ${chalk.cyan(config.projectName)}`);
  console.log(`  Infrastructure: ${chalk.cyan(config.infrastructure)}`);
  console.log(`  Stages: ${chalk.cyan(config.stages.join(', '))}`);
  if (config.mainDomain) {
    console.log(`  Main Domain: ${chalk.cyan(config.mainDomain)}`);
  }
  if (config.awsProfile) {
    console.log(`  AWS Profile: ${chalk.cyan(config.awsProfile)}`);
  }
  console.log();

  // Print validation result
  printValidationResult(result, true);

  // Print stage configs
  console.log(chalk.bold('\nStage Configuration:'));
  for (const stage of config.stages) {
    const stageConfig = config.stageConfig[stage];
    console.log(`  ${chalk.green(stage)}:`);
    if (stageConfig.domain) {
      console.log(`    Domain: ${chalk.cyan(stageConfig.domain)}`);
    }
    if (stageConfig.requiresConfirmation) {
      console.log(`    Requires confirmation: ${chalk.yellow('yes')}`);
    }
  }

  // Print health checks
  if (config.healthChecks && config.healthChecks.length > 0) {
    console.log(chalk.bold('\nHealth Checks:'));
    for (let i = 0; i < config.healthChecks.length; i++) {
      const check = config.healthChecks[i];
      console.log(`  ${i + 1}. ${check.name || 'Unnamed check'}`);
      console.log(`     URL: ${chalk.cyan(check.url)}`);
      if (check.expectedStatus) {
        console.log(`     Expected status: ${chalk.cyan(check.expectedStatus)}`);
      }
    }
  }

  console.log('\\n' + chalk.bold.cyan('═'.repeat(60)) + '\\n');

  // Exit with appropriate code
  if (result.valid) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}
