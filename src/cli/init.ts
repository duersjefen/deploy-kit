/**
 * Interactive setup wizard for deploy-kit initialization
 * Creates .deploy-config.json, updates package.json, and creates Makefile
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import prompt from 'prompts';

interface InitAnswers {
  projectName: string;
  mainDomain: string;
  awsProfile: string;
  stagingDomain: string;
  productionDomain: string;
  awsRegion: string;
  runTests: boolean;
}

/**
 * Display beautiful init banner
 */
function printBanner(): void {
  console.log('\n' + chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║                                                            ║'));
  console.log(chalk.bold.cyan('║       🚀 Deploy-Kit: Interactive Project Setup             ║'));
  console.log(chalk.bold.cyan('║                                                            ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.gray('This wizard will guide you through setting up deploy-kit for your project.\n'));
}

/**
 * Ask user for project configuration
 */
async function askQuestions(): Promise<InitAnswers> {
  const answers = await prompt([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name (kebab-case)',
      initial: 'my-awesome-app',
      validate: (val: string) => /^[a-z0-9-]+$/.test(val) ? true : 'Use lowercase letters, numbers, and hyphens only',
    },
    {
      type: 'text',
      name: 'mainDomain',
      message: 'Main domain (e.g., myapp.com)',
      initial: 'myapp.com',
      validate: (val: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(val) ? true : 'Please enter a valid domain',
    },
    {
      type: 'text',
      name: 'awsProfile',
      message: 'AWS profile name (for credentials)',
      initial: 'my-awesome-app',
    },
    {
      type: 'text',
      name: 'stagingDomain',
      message: 'Staging domain',
      initial: (prev: string) => `staging.${prev}`,
    },
    {
      type: 'text',
      name: 'productionDomain',
      message: 'Production domain',
      initial: (prev: string, values: any) => values.mainDomain,
    },
    {
      type: 'select',
      name: 'awsRegion',
      message: 'AWS region',
      choices: [
        { title: 'US East 1 (N. Virginia)', value: 'us-east-1' },
        { title: 'US East 2 (Ohio)', value: 'us-east-2' },
        { title: 'EU North 1 (Stockholm)', value: 'eu-north-1' },
        { title: 'EU West 1 (Ireland)', value: 'eu-west-1' },
        { title: 'AP Southeast 1 (Singapore)', value: 'ap-southeast-1' },
      ],
      initial: 2,
    },
    {
      type: 'confirm',
      name: 'runTests',
      message: 'Run tests before deploy?',
      initial: true,
    },
  ]);

  return answers as InitAnswers;
}

/**
 * Generate .deploy-config.json content
 */
function generateDeployConfig(answers: InitAnswers): string {
  return JSON.stringify(
    {
      projectName: answers.projectName,
      displayName: answers.projectName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      infrastructure: 'sst-serverless',
      database: 'dynamodb',
      stages: ['staging', 'production'],
      mainDomain: answers.mainDomain,
      awsProfile: answers.awsProfile,
      requireCleanGit: true,
      runTestsBeforeDeploy: answers.runTests,
      stageConfig: {
        staging: {
          domain: answers.stagingDomain,
          requiresConfirmation: false,
          awsRegion: answers.awsRegion,
        },
        production: {
          domain: answers.productionDomain,
          requiresConfirmation: true,
          awsRegion: answers.awsRegion,
        },
      },
      healthChecks: [
        {
          url: '/',
          expectedStatus: 200,
          timeout: 5000,
          name: 'Homepage',
        },
        {
          url: '/api/health',
          expectedStatus: 200,
          timeout: 5000,
          name: 'Health endpoint',
        },
      ],
      hooks: {
        preDeploy: answers.runTests ? 'npm test' : '',
        postBuild: 'npm run build',
      },
    },
    null,
    2
  );
}

/**
 * Create .deploy-config.json
 */
function createDeployConfig(answers: InitAnswers, projectRoot: string, mergedConfig?: any): void {
  const spinner = ora('Creating .deploy-config.json...').start();

  try {
    const configPath = join(projectRoot, '.deploy-config.json');
    let content: string;

    if (mergedConfig) {
      content = JSON.stringify(mergedConfig, null, 2);
    } else {
      content = generateDeployConfig(answers);
    }

    writeFileSync(configPath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Created .deploy-config.json'));
  } catch (error) {
    spinner.fail('Failed to create .deploy-config.json');
    throw error;
  }
}

/**
 * Update package.json with deploy scripts
 */
function updatePackageJson(answers: InitAnswers, projectRoot: string): void {
  const spinner = ora('Updating package.json...').start();

  try {
    const packagePath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    packageJson.scripts['deploy:staging'] = 'npx @duersjefen/deploy-kit deploy staging';
    packageJson.scripts['deploy:prod'] = 'npx @duersjefen/deploy-kit deploy production';
    packageJson.scripts['deployment-status'] = 'npx @duersjefen/deploy-kit status';
    packageJson.scripts['recover:staging'] = 'npx @duersjefen/deploy-kit recover staging';
    packageJson.scripts['recover:prod'] = 'npx @duersjefen/deploy-kit recover production';
    packageJson.scripts['validate:config'] = 'npx @duersjefen/deploy-kit validate';
    packageJson.scripts['doctor'] = 'npx @duersjefen/deploy-kit doctor';

    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    spinner.succeed(chalk.green('✅ Updated package.json with deploy scripts'));
  } catch (error) {
    spinner.fail('Failed to update package.json');
    throw error;
  }
}

/**
 * Create Makefile with deploy targets
 */
function createMakefile(answers: InitAnswers, projectRoot: string): void {
  const spinner = ora('Creating Makefile...').start();

  try {
    const makefilePath = join(projectRoot, 'Makefile');
    const content = `.PHONY: deploy-staging deploy-prod deployment-status recover-staging recover-prod validate doctor help

help: ## Show this help message
\t@echo 'Deploy-Kit Makefile Targets'
\t@echo ''
\t@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-25s %s\\n", $$1, $$2}' $(MAKEFILE_LIST)

validate: ## Validate deploy-kit configuration
\tnpm run validate:config

doctor: ## Run pre-deployment health checks
\tnpm run doctor

deploy-staging: ## Deploy to staging (${answers.stagingDomain})
\tnpm run deploy:staging

deploy-prod: ## Deploy to production (${answers.productionDomain})
\tnpm run deploy:prod

deployment-status: ## Check deployment status for all stages
\tnpm run deployment-status

recover-staging: ## Recover from failed staging deployment
\tnpm run recover:staging

recover-prod: ## Recover from failed production deployment
\tnpm run recover:prod
`;

    writeFileSync(makefilePath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Created Makefile with deploy targets'));
  } catch (error) {
    spinner.fail('Failed to create Makefile');
    throw error;
  }
}

/**
 * Print setup summary
 */
function printSummary(answers: InitAnswers, optionalFiles?: any): void {
  console.log('\n' + chalk.bold.green('═'.repeat(60)));
  console.log(chalk.bold.green('✨ Setup Complete!'));
  console.log(chalk.bold.green('═'.repeat(60)));

  console.log('\n📋 Configuration Summary:\n');
  console.log(`  ${chalk.cyan('Project:')} ${answers.projectName}`);
  console.log(`  ${chalk.cyan('Main Domain:')} ${answers.mainDomain}`);
  console.log(`  ${chalk.cyan('AWS Profile:')} ${answers.awsProfile}`);
  console.log(`  ${chalk.cyan('AWS Region:')} ${answers.awsRegion}`);
  console.log(`  ${chalk.cyan('Staging Domain:')} ${answers.stagingDomain}`);
  console.log(`  ${chalk.cyan('Production Domain:')} ${answers.productionDomain}`);
  console.log(`  ${chalk.cyan('Run Tests Before Deploy:')} ${answers.runTests ? '✅ Yes' : '❌ No'}`);

  console.log('\n📦 Files Created/Updated:\n');
  console.log('  ✅ .deploy-config.json - Deployment configuration');
  if (optionalFiles?.createScripts !== false) {
    console.log('  ✅ Updated package.json - Added deploy scripts');
  }
  if (optionalFiles?.createMakefile) {
    console.log('  ✅ Makefile - User-friendly deployment targets');
  }

  console.log('\n🚀 Next Steps:\n');
  console.log(chalk.green('  1. Review .deploy-config.json to verify settings'));
  console.log(chalk.green('  2. Install dependencies: npm install'));
  if (optionalFiles?.createScripts) {
    console.log(chalk.green('  3. Deploy to staging: npm run deploy:staging'));
  } else {
    console.log(chalk.green('  3. Deploy to staging: npx deploy-kit deploy staging'));
  }

  if (optionalFiles?.createScripts) {
    console.log('\n📚 Deployment Commands (npm scripts):\n');
    console.log(chalk.cyan('  npm run validate:config         ') + 'Validate configuration');
    console.log(chalk.cyan('  npm run doctor                  ') + 'Pre-deployment health check');
    console.log(chalk.cyan('  npm run deploy:staging          ') + `Deploy to staging (${answers.stagingDomain})`);
    console.log(chalk.cyan('  npm run deploy:prod             ') + `Deploy to production (${answers.productionDomain})`);
    console.log(chalk.cyan('  npm run deployment-status       ') + 'Check status of all deployments');
    console.log(chalk.cyan('  npm run recover:staging         ') + 'Recover from failed staging deployment');
    console.log(chalk.cyan('  npm run recover:prod            ') + 'Recover from failed production deployment');
  }

  if (optionalFiles?.createMakefile) {
    console.log('\n📚 Deployment Commands (make targets):\n');
    console.log(chalk.cyan('  make help                 ') + 'Show all available make targets');
    console.log(chalk.cyan('  make validate             ') + 'Validate configuration');
    console.log(chalk.cyan('  make doctor               ') + 'Pre-deployment health check');
    console.log(chalk.cyan('  make deploy-staging       ') + `Deploy to staging (${answers.stagingDomain})`);
    console.log(chalk.cyan('  make deploy-prod          ') + `Deploy to production (${answers.productionDomain})`);
    console.log(chalk.cyan('  make deployment-status    ') + 'Check status of all deployments');
    console.log(chalk.cyan('  make recover-staging      ') + 'Recover from failed staging deployment');
    console.log(chalk.cyan('  make recover-prod         ') + 'Recover from failed production deployment');
  }

  console.log('\n💡 Tips:\n');
  console.log(chalk.gray('  • Ensure your AWS credentials are configured before deploying'));
  console.log(chalk.gray('  • Commit .deploy-config.json to version control'));
  console.log(chalk.gray('  • Use "npx deploy-kit validate" to check your configuration'));
  console.log(chalk.gray('  • Use "npx deploy-kit doctor" to diagnose deployment issues'));
  console.log(chalk.gray('  • Review https://github.com/duersjefen/deploy-kit for more info'));

  console.log('\n' + chalk.bold.cyan('═'.repeat(60)) + '\n');
}

/**
 * Main init command
 */
export async function runInit(projectRoot: string = process.cwd()): Promise<void> {
  try {
    printBanner();

    const configPath = join(projectRoot, '.deploy-config.json');
    let answers: InitAnswers;
    let existingConfig: any = null;

    // Check if .deploy-config.json already exists
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        console.log(chalk.green('✅ Found existing .deploy-config.json\n'));

        // Import validation after file ops
        const { validateConfig, printValidationResult, mergeConfigs } = await import('./utils/config-validator.js');
        const validation = validateConfig(existingConfig);

        if (!validation.valid) {
          console.log(chalk.yellow('⚠️  Configuration has errors:'));
          printValidationResult(validation, true);
          console.log();
        } else {
          console.log(chalk.gray('   Configuration is valid\n'));
        }

        // Ask what user wants to do
        const action = await prompt([
          {
            type: 'select',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { title: 'Keep config, update scripts/Makefile', value: 'keep' },
              { title: 'Merge: add missing fields from template', value: 'merge' },
              { title: 'Start over: replace with fresh config', value: 'overwrite' },
              { title: 'Cancel', value: 'cancel' },
            ],
            initial: 0,
          },
        ] as any);

        if (action.action === 'cancel') {
          console.log(chalk.gray('\nSetup cancelled.\n'));
          return;
        }

        if (action.action === 'keep') {
          // User wants to keep existing config, just update scripts
          console.log();
          const updateScripts = await prompt([
            {
              type: 'confirm',
              name: 'updateScripts',
              message: 'Update npm scripts in package.json?',
              initial: true,
            },
            {
              type: 'confirm',
              name: 'updateMakefile',
              message: 'Create/update Makefile?',
              initial: false,
            },
          ] as any);

          if (updateScripts.updateScripts) {
            updatePackageJson(existingConfig, projectRoot);
          }
          if (updateScripts.updateMakefile) {
            createMakefile(existingConfig, projectRoot);
          }

          console.log('\n' + chalk.bold.green('═'.repeat(60)));
          console.log(chalk.bold.green('✅ Setup Complete!'));
          console.log(chalk.bold.green('═'.repeat(60)));
          console.log(chalk.green('\n✅ Existing configuration preserved'));
          if (updateScripts.updateScripts) {
            console.log(chalk.green('✅ npm scripts updated'));
          }
          if (updateScripts.updateMakefile) {
            console.log(chalk.green('✅ Makefile created/updated'));
          }
          console.log('\n' + chalk.bold.cyan('═'.repeat(60)) + '\n');
          return;
        } else if (action.action === 'merge') {
          // Ask new questions and merge
          console.log();
          const newAnswers = await askQuestions();
          const newConfig = JSON.parse(generateDeployConfig(newAnswers));
          const merged = mergeConfigs(existingConfig, newConfig);
          answers = newAnswers;
          existingConfig = merged;
        } else {
          // Overwrite: ask questions fresh
          console.log();
          answers = await askQuestions();
          existingConfig = null;
        }
      } catch (error) {
        console.error(chalk.red('❌ Error reading existing config:'), error);
        process.exit(1);
      }
    } else {
      // No existing config, ask questions fresh
      answers = await askQuestions();
    }

    console.log();

    // Generate files
    createDeployConfig(answers, projectRoot, existingConfig);

    // Ask about optional files
    const optionalFiles = await prompt([
      {
        type: 'confirm',
        name: 'createScripts',
        message: 'Add npm scripts to package.json?',
        initial: true,
      },
      {
        type: 'confirm',
        name: 'createMakefile',
        message: 'Create a Makefile? (optional, adds convenience)',
        initial: false,
      },
    ] as any);

    if (optionalFiles.createScripts) {
      updatePackageJson(answers, projectRoot);
    }
    if (optionalFiles.createMakefile) {
      createMakefile(answers, projectRoot);
    }

    // Print summary
    printSummary(answers, optionalFiles);
  } catch (error) {
    if ((error as any).isTtyError) {
      console.error(chalk.red('❌ Interactive prompts could not be rendered in this environment'));
    } else {
      console.error(chalk.red('❌ Setup failed:'), error);
    }
    process.exit(1);
  }
}
