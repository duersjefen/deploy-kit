/**
 * Interactive Wizard
 * Guides users through dev environment setup (DEP-5)
 */
import prompts from 'prompts';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
export class InteractiveWizard {
    constructor(projectRoot, config) {
        this.projectRoot = projectRoot;
        this.config = config;
    }
    /**
     * Run the interactive wizard
     * Returns user's choices or null if cancelled
     */
    async run() {
        console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('║       🚀 Interactive Dev Environment Setup                 ║'));
        console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
        // Step 1: Select stage
        const stage = await this.selectStage();
        if (!stage)
            return null;
        // Step 2: Review git changes (if any)
        await this.showGitChanges();
        // Step 3: Select output profile
        const profile = await this.selectOutputProfile();
        if (!profile)
            return null;
        // Step 4: Select port
        const port = await this.selectPort();
        if (!port)
            return null;
        // Step 5: Confirm AWS profile (if configured)
        const awsConfirmed = await this.confirmAwsProfile();
        if (!awsConfirmed)
            return null;
        // Step 6: Final confirmation
        const proceed = await this.finalConfirmation(stage, port, profile);
        if (!proceed) {
            console.log(chalk.yellow('\n⚠️  Setup cancelled\n'));
            return null;
        }
        return {
            proceed: true,
            stage,
            port,
            profile,
        };
    }
    /**
     * Step 1: Select stage
     */
    async selectStage() {
        const response = await prompts({
            type: 'select',
            name: 'stage',
            message: 'Which stage are you developing for?',
            choices: [
                { title: 'Development (local)', value: 'dev', description: 'Local development environment' },
                { title: 'Staging', value: 'staging', description: 'Staging environment' },
                { title: 'Production', value: 'production', description: 'Production environment (careful!)' },
            ],
            initial: 0,
        });
        if (!response.stage) {
            return null;
        }
        if (response.stage === 'production') {
            const confirm = await prompts({
                type: 'confirm',
                name: 'value',
                message: chalk.yellow('⚠️  You selected PRODUCTION. This affects live users. Continue?'),
                initial: false,
            });
            if (!confirm.value) {
                return null;
            }
        }
        return response.stage;
    }
    /**
     * Step 2: Show git changes (if any)
     */
    async showGitChanges() {
        try {
            // Check if we're in a git repo
            if (!existsSync(join(this.projectRoot, '.git'))) {
                console.log(chalk.gray('\nℹ️  Not a git repository (skipping git status check)\n'));
                return;
            }
            const status = execSync('git status --short', {
                cwd: this.projectRoot,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            if (status) {
                console.log(chalk.bold('\n📝 Uncommitted Changes:\n'));
                console.log(chalk.gray(status));
                const response = await prompts({
                    type: 'confirm',
                    name: 'value',
                    message: 'Continue with uncommitted changes?',
                    initial: true,
                });
                if (!response.value) {
                    console.log(chalk.yellow('\n💡 Tip: Commit your changes first with: git add . && git commit\n'));
                }
            }
            else {
                console.log(chalk.green('\n✓ No uncommitted changes\n'));
            }
        }
        catch (error) {
            // Handle specific git errors with helpful messages
            if (error instanceof Error) {
                const errorMessage = error.message.toLowerCase();
                if (errorMessage.includes('not a git repository')) {
                    console.log(chalk.gray('\nℹ️  Not a git repository (skipping git status check)\n'));
                }
                else if (errorMessage.includes('git not found') || errorMessage.includes('command not found')) {
                    console.log(chalk.yellow('\n⚠️  Git is not installed or not in PATH (skipping git status check)\n'));
                }
                else {
                    // Log unexpected git errors for debugging
                    console.log(chalk.gray(`\nℹ️  Could not check git status: ${error.message}\n`));
                }
            }
            else {
                console.log(chalk.gray('\nℹ️  Could not check git status (non-git directory or git not available)\n'));
            }
        }
    }
    /**
     * Step 3: Select output profile
     */
    async selectOutputProfile() {
        const response = await prompts({
            type: 'select',
            name: 'profile',
            message: 'How much output do you want to see?',
            choices: [
                { title: 'Normal', value: 'normal', description: 'Balanced output (recommended)' },
                { title: 'Silent', value: 'silent', description: 'Errors and ready state only' },
                { title: 'Verbose', value: 'verbose', description: 'Show all messages' },
                { title: 'Debug', value: 'debug', description: 'Include debug logs' },
            ],
            initial: 0,
        });
        return response.profile || null;
    }
    /**
     * Step 4: Select port
     */
    async selectPort() {
        const response = await prompts({
            type: 'number',
            name: 'port',
            message: 'Which port should the dev server use?',
            initial: 3000,
            min: 1024,
            max: 65535,
            validate: (value) => {
                if (value < 1024 || value > 65535) {
                    return 'Port must be between 1024 and 65535';
                }
                return true;
            },
        });
        return response.port || null;
    }
    /**
     * Step 5: Confirm AWS profile
     */
    async confirmAwsProfile() {
        const awsProfile = this.config?.awsProfile || process.env.AWS_PROFILE;
        if (!awsProfile) {
            console.log(chalk.gray('\nℹ️  No AWS profile configured (using default)\n'));
            return true;
        }
        console.log(chalk.cyan(`\n🔐 AWS Profile: ${chalk.bold(awsProfile)}\n`));
        const response = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'Is this the correct AWS profile?',
            initial: true,
        });
        if (!response.value) {
            console.log(chalk.yellow('\n💡 Tip: Set AWS_PROFILE environment variable or update .deploy-config.json\n'));
            return false;
        }
        return true;
    }
    /**
     * Step 6: Final confirmation
     */
    async finalConfirmation(stage, port, profile) {
        console.log(chalk.bold.cyan('\n📋 Configuration Summary:\n'));
        console.log(`  Stage:   ${chalk.white(stage)}`);
        console.log(`  Port:    ${chalk.white(port)}`);
        console.log(`  Output:  ${chalk.white(profile)}`);
        if (this.config?.awsProfile) {
            console.log(`  AWS:     ${chalk.white(this.config.awsProfile)}`);
        }
        console.log('');
        const response = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'Start dev server with these settings?',
            initial: true,
        });
        return response.value || false;
    }
}
