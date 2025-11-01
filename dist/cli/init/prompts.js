/**
 * Interactive prompts for init command
 */
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import prompt from 'prompts';
import { detectProfileFromSstConfig } from '../utils/aws-profile-detector.js';
/**
 * Ask user for project configuration
 */
export async function askQuestions(projectRoot = process.cwd()) {
    // Check if this is an SST project and try to auto-detect profile
    let detectedProfile;
    let showProfileQuestion = true;
    const sstConfigExists = existsSync(join(projectRoot, 'sst.config.ts'));
    if (sstConfigExists) {
        detectedProfile = detectProfileFromSstConfig(projectRoot);
        if (detectedProfile) {
            console.log(chalk.cyan(`\n📝 Found AWS profile in sst.config.ts: ${chalk.bold(detectedProfile)}`));
            console.log(chalk.gray('   This profile will be auto-detected, so you can skip specifying it here.\n'));
            showProfileQuestion = false;
        }
    }
    const questions = [
        {
            type: 'text',
            name: 'projectName',
            message: 'Project name (kebab-case)',
            initial: 'my-awesome-app',
            validate: (val) => /^[a-z0-9-]+$/.test(val) ? true : 'Use lowercase letters, numbers, and hyphens only',
        },
        {
            type: 'text',
            name: 'mainDomain',
            message: 'Main domain (e.g., myapp.com)',
            initial: 'myapp.com',
            validate: (val) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(val) ? true : 'Please enter a valid domain',
        },
    ];
    // Only ask for AWS profile if not auto-detected from SST
    if (showProfileQuestion) {
        questions.push({
            type: 'text',
            name: 'awsProfile',
            message: 'AWS profile name (for credentials)',
            initial: 'my-awesome-app',
        });
    }
    questions.push({
        type: 'text',
        name: 'stagingDomain',
        message: 'Staging domain',
        initial: (prev) => `staging.${prev}`,
    }, {
        type: 'text',
        name: 'productionDomain',
        message: 'Production domain',
        initial: (prev, values) => values.mainDomain,
    }, {
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
    }, {
        type: 'confirm',
        name: 'runTests',
        message: 'Run tests before deploy?',
        initial: true,
    });
    const answers = await prompt(questions);
    // If profile was auto-detected from SST, include it in answers
    if (detectedProfile && !answers.awsProfile) {
        answers.awsProfile = detectedProfile;
    }
    return answers;
}
/**
 * Print beautiful init banner
 */
export function printBanner() {
    console.log('\n' + chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║                                                            ║'));
    console.log(chalk.bold.cyan('║       🚀 Deploy-Kit: Interactive Project Setup             ║'));
    console.log(chalk.bold.cyan('║                                                            ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
    console.log(chalk.gray('This wizard will guide you through setting up deploy-kit for your project.\n'));
}
/**
 * Print setup summary
 */
export function printSummary(answers, optionalFiles) {
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
    if (optionalFiles?.createQualityTools) {
        console.log('  ✅ Installed quality tools (Husky, lint-staged, tsc-files)');
        console.log('  ✅ Configured pre-commit hooks');
        console.log('  ✅ Updated .gitignore with SST entries');
    }
    console.log('\n🚀 Next Steps:\n');
    console.log(chalk.green('  1. Review .deploy-config.json to verify settings'));
    console.log(chalk.green('  2. Install dependencies: npm install'));
    if (optionalFiles?.createScripts) {
        console.log(chalk.green('  3. Deploy to staging: npm run deploy:staging'));
    }
    else {
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
