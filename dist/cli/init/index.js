/**
 * Main init command orchestrator
 */
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import prompt from 'prompts';
// Import sub-modules
import { askQuestions, printBanner, printSummary } from './prompts.js';
import { createDeployConfig, updatePackageJson, generateDeployConfig } from './templates.js';
import { createLintStagedConfig, createHuskyPreCommitHook, updateGitIgnore, installQualityTools, addPrepareScript, } from './quality-tools.js';
/**
 * Generate InitAnswers from non-interactive flags
 */
function generateAnswersFromFlags(flags, projectRoot) {
    // Try to auto-detect project name from package.json or directory name
    let projectName = flags.projectName;
    if (!projectName) {
        try {
            const packagePath = join(projectRoot, 'package.json');
            const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
            projectName = packageJson.name || projectRoot.split('/').pop() || 'my-app';
        }
        catch {
            projectName = projectRoot.split('/').pop() || 'my-app';
        }
    }
    // Ensure projectName is always a string
    projectName = projectName || 'my-app';
    const domain = flags.domain || `${projectName}.com`;
    const awsProfile = flags.awsProfile || projectName;
    const awsRegion = flags.awsRegion || 'eu-north-1';
    return {
        projectName,
        mainDomain: domain,
        awsProfile: awsProfile,
        stagingDomain: `staging.${domain}`,
        productionDomain: domain,
        awsRegion,
        runTests: true,
    };
}
/**
 * Main init command
 */
export async function runInit(projectRoot = process.cwd(), flags = {}) {
    try {
        // Handle non-interactive mode (for Claude Code automation)
        if (flags.nonInteractive) {
            console.log(chalk.bold.cyan('\n🚀 Deploy-Kit: Non-Interactive Project Setup\n'));
            const answers = generateAnswersFromFlags(flags, projectRoot);
            console.log(chalk.cyan('Using defaults:'));
            console.log(chalk.gray(`  Project: ${answers.projectName}`));
            console.log(chalk.gray(`  Domain: ${answers.mainDomain}`));
            console.log(chalk.gray(`  AWS Profile: ${answers.awsProfile}`));
            console.log(chalk.gray(`  Region: ${answers.awsRegion}`));
            console.log(chalk.gray(`  Quality Tools: ${flags.withQualityTools ? '✅ enabled' : '❌ disabled'}\n`));
            // Create config
            createDeployConfig(answers, projectRoot);
            // Update package.json with scripts
            updatePackageJson(answers, projectRoot);
            // Setup quality tools if requested
            if (flags.withQualityTools) {
                console.log();
                await installQualityTools(projectRoot);
                createLintStagedConfig(projectRoot);
                createHuskyPreCommitHook(projectRoot);
                addPrepareScript(projectRoot);
                updateGitIgnore(projectRoot);
            }
            // Print summary
            console.log('\n' + chalk.bold.green('═'.repeat(60)));
            console.log(chalk.bold.green('✅ Setup Complete!'));
            console.log(chalk.bold.green('═'.repeat(60)));
            console.log(chalk.green('\n✅ Created .deploy-config.json'));
            console.log(chalk.green('✅ Updated package.json'));
            if (flags.withQualityTools) {
                console.log(chalk.green('✅ Installed quality tools (Husky, lint-staged, tsc-files)'));
                console.log(chalk.green('✅ Configured pre-commit hooks'));
                console.log(chalk.green('✅ Updated .gitignore'));
            }
            console.log(chalk.yellow('\n⚠️  Next: Review .deploy-config.json and update domain settings'));
            console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
            return;
        }
        // If only updating scripts, load existing config
        if (flags.scriptsOnly) {
            const configPath = join(projectRoot, '.deploy-config.json');
            if (!existsSync(configPath)) {
                console.error(chalk.red('❌ Error: .deploy-config.json not found'));
                console.error(chalk.gray('   Run "npx deploy-kit init" without flags to create a new configuration'));
                process.exit(1);
            }
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            console.log(chalk.cyan('\n📝 Updating npm scripts in package.json...\n'));
            updatePackageJson(config, projectRoot);
            console.log(chalk.green('✅ npm scripts updated\n'));
            return;
        }
        // For config-only or full init, show banner
        if (!flags.scriptsOnly) {
            printBanner();
        }
        const configPath = join(projectRoot, '.deploy-config.json');
        let answers;
        let existingConfig = null;
        // Check if .deploy-config.json already exists
        if (existsSync(configPath)) {
            try {
                existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
                console.log(chalk.green('✅ Found existing .deploy-config.json\n'));
                // Import validation after file ops
                const { validateConfig, printValidationResult, mergeConfigs } = await import('../utils/config-validator.js');
                const validation = validateConfig(existingConfig);
                if (!validation.valid) {
                    console.log(chalk.yellow('⚠️  Configuration has errors:'));
                    printValidationResult(validation, true);
                    console.log();
                }
                else {
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
                ]);
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
                            name: 'updateQualityTools',
                            message: 'Setup pre-commit validation (Husky + lint-staged)?',
                            initial: false,
                        },
                    ]);
                    if (updateScripts.updateScripts) {
                        updatePackageJson(existingConfig, projectRoot);
                    }
                    if (updateScripts.updateQualityTools) {
                        console.log();
                        await installQualityTools(projectRoot);
                        createLintStagedConfig(projectRoot);
                        createHuskyPreCommitHook(projectRoot);
                        addPrepareScript(projectRoot);
                        updateGitIgnore(projectRoot);
                    }
                    console.log('\n' + chalk.bold.green('═'.repeat(60)));
                    console.log(chalk.bold.green('✅ Setup Complete!'));
                    console.log(chalk.bold.green('═'.repeat(60)));
                    console.log(chalk.green('\n✅ Existing configuration preserved'));
                    if (updateScripts.updateScripts) {
                        console.log(chalk.green('✅ npm scripts updated'));
                    }
                    if (updateScripts.updateQualityTools) {
                        console.log(chalk.green('✅ Installed quality tools (Husky, lint-staged, tsc-files)'));
                        console.log(chalk.green('✅ Configured pre-commit hooks'));
                        console.log(chalk.green('✅ Updated .gitignore with SST entries'));
                    }
                    console.log('\n' + chalk.bold.cyan('═'.repeat(60)) + '\n');
                    return;
                }
                else if (action.action === 'merge') {
                    // Ask new questions and merge
                    console.log();
                    const newAnswers = await askQuestions(projectRoot);
                    const newConfig = JSON.parse(generateDeployConfig(newAnswers));
                    const { mergeConfigs } = await import('../utils/config-validator.js');
                    const merged = mergeConfigs(existingConfig, newConfig);
                    answers = newAnswers;
                    existingConfig = merged;
                }
                else {
                    // Overwrite: ask questions fresh
                    console.log();
                    answers = await askQuestions(projectRoot);
                    existingConfig = null;
                }
            }
            catch (error) {
                console.error(chalk.red('❌ Error reading existing config:'), error);
                process.exit(1);
            }
        }
        else {
            // No existing config, ask questions fresh
            answers = await askQuestions(projectRoot);
        }
        console.log();
        // Generate files
        createDeployConfig(answers, projectRoot, existingConfig);
        // If --config-only flag is set, skip scripts and Makefile
        if (flags.configOnly) {
            console.log(chalk.bold.green('═'.repeat(60)));
            console.log(chalk.bold.green('✅ Configuration Created!'));
            console.log(chalk.bold.green('═'.repeat(60)));
            console.log(chalk.green('\n✅ .deploy-config.json created successfully'));
            console.log(chalk.gray('\n💡 To add npm scripts:'));
            console.log(chalk.gray('   npx deploy-kit init --scripts-only\n'));
            return;
        }
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
                name: 'createQualityTools',
                message: 'Setup pre-commit validation (Husky + lint-staged)?',
                initial: false,
            },
        ]);
        if (optionalFiles.createScripts) {
            updatePackageJson(answers, projectRoot);
        }
        if (optionalFiles.createQualityTools) {
            console.log();
            await installQualityTools(projectRoot);
            createLintStagedConfig(projectRoot);
            createHuskyPreCommitHook(projectRoot);
            addPrepareScript(projectRoot);
            updateGitIgnore(projectRoot);
        }
        // Print summary
        printSummary(answers, optionalFiles);
    }
    catch (error) {
        if (error.isTtyError) {
            console.error(chalk.red('❌ Interactive prompts could not be rendered in this environment'));
        }
        else {
            console.error(chalk.red('❌ Setup failed:'), error);
        }
        process.exit(1);
    }
}
