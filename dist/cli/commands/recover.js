/**
 * Recovery Command
 *
 * Handles stuck SST deployments and state machine issues.
 * This command is specifically designed to prevent and fix the issue:
 * "CloudFront update fails → SST continues → IAM roles never update → stuck state"
 *
 * Usage:
 *   deploy-kit recover cloudfront  # Fix stuck CloudFront distributions
 *   deploy-kit recover state       # Fix corrupted Pulumi state
 *   deploy-kit recover dev         # General dev environment recovery
 */
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import prompt from 'prompts';
import { CloudFrontAPIClient } from '../../lib/cloudfront/client.js';
import { validateConfig } from '../utils/config-validator.js';
/**
 * Recover from stuck CloudFront distributions
 */
async function recoverCloudFront(projectRoot, config) {
    const spinner = ora('Checking CloudFront distributions...').start();
    const actions = [];
    try {
        if (!config) {
            spinner.fail('No deploy-kit configuration found');
            return {
                success: false,
                message: 'Need .deploy-config.json to check CloudFront',
                actions: [],
            };
        }
        const awsRegion = config.stageConfig?.staging?.awsRegion || 'eu-north-1';
        const awsProfile = config.awsProfile || process.env.AWS_PROFILE;
        const client = new CloudFrontAPIClient(awsRegion, awsProfile);
        const distributions = await client.listDistributions();
        // Find distributions for this project
        const projectDistributions = distributions.filter(dist => {
            const comment = dist.Comment?.toLowerCase() || '';
            const projectName = config.projectName?.toLowerCase() || '';
            return comment.includes(projectName) || comment.includes('sst');
        });
        spinner.text = `Found ${projectDistributions.length} distribution(s) for this project`;
        // Check for stuck distributions
        // Note: "Deployed" is healthy, "Deploying" or "InProgress" indicates stuck
        const stuckDistributions = projectDistributions.filter(dist => dist.Status === 'InProgress' ||
            (dist.Status.includes('Deploy') && dist.Status !== 'Deployed'));
        if (stuckDistributions.length === 0) {
            spinner.succeed('No stuck CloudFront distributions found');
            return {
                success: true,
                message: 'All distributions are healthy',
                actions: ['No action needed'],
            };
        }
        spinner.warn(`Found ${stuckDistributions.length} stuck distribution(s)`);
        console.log(chalk.yellow('\n⚠️  Stuck CloudFront Distributions:\n'));
        stuckDistributions.forEach(dist => {
            console.log(chalk.yellow(`   • ${dist.Id}`));
            console.log(chalk.gray(`     Status: ${dist.Status}`));
            console.log(chalk.gray(`     Domains: ${dist.AliasedDomains.join(', ') || 'none'}`));
            console.log();
        });
        // Ask user what to do
        const response = await prompt({
            type: 'select',
            name: 'action',
            message: 'How do you want to proceed?',
            choices: [
                {
                    title: 'Wait for CloudFront (recommended)',
                    value: 'wait',
                    description: 'CloudFront operations take 5-15 minutes to complete',
                },
                {
                    title: 'Clean .sst state and retry',
                    value: 'clean',
                    description: 'Remove .sst directory and force SST to rebuild state',
                },
                {
                    title: 'Manual intervention needed',
                    value: 'manual',
                    description: 'Show steps for manual AWS Console fixes',
                },
            ],
        });
        if (response.action === 'wait') {
            actions.push('Waiting for CloudFront to finish (this can take 5-15 minutes)');
            actions.push('Check status: aws cloudfront get-distribution --id <dist-id>');
            actions.push('Once status is "Deployed", retry your deployment');
            return {
                success: true,
                message: 'Wait for CloudFront to complete',
                actions,
            };
        }
        if (response.action === 'clean') {
            const confirmClean = await prompt({
                type: 'confirm',
                name: 'value',
                message: 'Delete .sst directory? This will force SST to rebuild state.',
                initial: false,
            });
            if (confirmClean.value) {
                const sstDir = join(projectRoot, '.sst');
                if (existsSync(sstDir)) {
                    execSync(`rm -rf ${sstDir}`);
                    actions.push('Deleted .sst directory');
                    actions.push('Run: make dev (or sst dev) to rebuild state');
                }
            }
            return {
                success: true,
                message: 'Cleaned .sst state',
                actions,
            };
        }
        if (response.action === 'manual') {
            console.log(chalk.cyan('\n📋 Manual Recovery Steps:\n'));
            console.log(chalk.white('1. Open AWS Console → CloudFront'));
            console.log(chalk.white('2. Find your distribution (ID from above)'));
            console.log(chalk.white('3. Check "Behaviors" tab'));
            console.log(chalk.white('4. If KeyValueStore is attached, detach it'));
            console.log(chalk.white('5. Wait for distribution status to change to "Deployed"'));
            console.log(chalk.white('6. Retry your deployment\n'));
            actions.push('Manual intervention instructions provided');
            return {
                success: true,
                message: 'Follow manual steps above',
                actions,
            };
        }
        return {
            success: false,
            message: 'No action taken',
            actions: [],
        };
    }
    catch (error) {
        spinner.fail(`CloudFront recovery failed: ${error.message}`);
        return {
            success: false,
            message: error.message,
            actions: [],
        };
    }
}
/**
 * Recover from corrupted Pulumi state
 */
async function recoverState(projectRoot) {
    const spinner = ora('Checking Pulumi state...').start();
    const actions = [];
    try {
        const sstDir = join(projectRoot, '.sst');
        if (!existsSync(sstDir)) {
            spinner.info('No .sst directory found - nothing to recover');
            return {
                success: true,
                message: 'No .sst directory (first run)',
                actions: ['No action needed'],
            };
        }
        // Check for obvious corruption signs
        const pulumiDir = join(sstDir, '.pulumi');
        const issues = [];
        if (!existsSync(pulumiDir)) {
            issues.push('Missing .pulumi directory');
        }
        // Check for stale locks
        const lockDir = join(pulumiDir, 'locks');
        if (existsSync(lockDir)) {
            try {
                const locks = readdirSync(lockDir);
                if (locks.length > 0) {
                    issues.push(`Found ${locks.length} Pulumi lock file(s)`);
                }
            }
            catch (error) {
                issues.push('Cannot read Pulumi locks directory');
            }
        }
        if (issues.length === 0) {
            spinner.succeed('Pulumi state looks healthy');
            return {
                success: true,
                message: 'State is healthy',
                actions: ['No action needed'],
            };
        }
        spinner.warn(`Found ${issues.length} state issue(s)`);
        console.log(chalk.yellow('\n⚠️  State Issues:\n'));
        issues.forEach(issue => console.log(chalk.yellow(`   • ${issue}`)));
        console.log();
        // Ask user what to do
        const response = await prompt({
            type: 'select',
            name: 'action',
            message: 'How do you want to recover?',
            choices: [
                {
                    title: 'Clear locks only',
                    value: 'locks',
                    description: 'Remove stale Pulumi lock files (safe)',
                },
                {
                    title: 'Full state rebuild',
                    value: 'rebuild',
                    description: 'Delete .sst and rebuild from AWS (drastic)',
                },
                {
                    title: 'Backup and investigate',
                    value: 'backup',
                    description: 'Create backup and show investigation steps',
                },
            ],
        });
        if (response.action === 'locks') {
            const lockDir = join(sstDir, '.pulumi', 'locks');
            if (existsSync(lockDir)) {
                const locks = readdirSync(lockDir);
                locks.forEach(lock => {
                    unlinkSync(join(lockDir, lock));
                    actions.push(`Removed lock: ${lock}`);
                });
                spinner.succeed(`Removed ${locks.length} lock file(s)`);
            }
            actions.push('Retry your deployment');
            return {
                success: true,
                message: 'Cleared stale locks',
                actions,
            };
        }
        if (response.action === 'rebuild') {
            const confirmRebuild = await prompt({
                type: 'confirm',
                name: 'value',
                message: 'Delete entire .sst directory? SST will rebuild state from AWS (might take a while).',
                initial: false,
            });
            if (confirmRebuild.value) {
                // Backup first
                const backupDir = join(projectRoot, `.sst.backup.${Date.now()}`);
                execSync(`cp -r ${sstDir} ${backupDir}`);
                actions.push(`Backed up to: ${backupDir}`);
                // Delete
                execSync(`rm -rf ${sstDir}`);
                actions.push('Deleted .sst directory');
                actions.push('Run: make dev (or sst dev) to rebuild state from AWS');
                spinner.succeed('Rebuilt state directory');
            }
            return {
                success: true,
                message: 'State rebuilt',
                actions,
            };
        }
        if (response.action === 'backup') {
            const backupDir = join(projectRoot, `.sst.backup.${Date.now()}`);
            execSync(`cp -r ${sstDir} ${backupDir}`);
            actions.push(`Backed up to: ${backupDir}`);
            console.log(chalk.cyan('\n📋 Investigation Steps:\n'));
            console.log(chalk.white(`1. Check backup: ls -la ${backupDir}`));
            console.log(chalk.white('2. Check Pulumi state files'));
            console.log(chalk.white('3. Look for errors in .sst/error.log'));
            console.log(chalk.white('4. Compare .sst state with AWS Console'));
            console.log(chalk.white('5. If corrupted, delete .sst and redeploy\n'));
            spinner.succeed('Backup created');
            return {
                success: true,
                message: 'Created backup for investigation',
                actions,
            };
        }
        return {
            success: false,
            message: 'No action taken',
            actions: [],
        };
    }
    catch (error) {
        spinner.fail(`State recovery failed: ${error.message}`);
        return {
            success: false,
            message: error.message,
            actions: [],
        };
    }
}
/**
 * General dev environment recovery
 */
async function recoverDev(projectRoot) {
    const spinner = ora('Running dev environment recovery...').start();
    const actions = [];
    try {
        // Run comprehensive checks
        spinner.text = 'Checking for stale SST processes...';
        try {
            const sstProcesses = execSync('ps aux | grep -i "[s]st dev"', { encoding: 'utf-8' });
            if (sstProcesses) {
                const pids = sstProcesses
                    .trim()
                    .split('\n')
                    .map(line => line.split(/\s+/)[1]);
                if (pids.length > 0) {
                    console.log(chalk.yellow(`\nFound ${pids.length} running SST process(es):`));
                    pids.forEach(pid => console.log(chalk.gray(`   • PID ${pid}`)));
                    const killConfirm = await prompt({
                        type: 'confirm',
                        name: 'value',
                        message: 'Kill these processes?',
                        initial: true,
                    });
                    if (killConfirm.value) {
                        pids.forEach(pid => {
                            execSync(`kill ${pid}`);
                            actions.push(`Killed process ${pid}`);
                        });
                    }
                }
            }
        }
        catch (error) {
            // No processes found - that's good
        }
        // Check for Pulumi locks
        spinner.text = 'Checking for Pulumi locks...';
        const sstDir = join(projectRoot, '.sst');
        if (existsSync(sstDir)) {
            const lockDir = join(sstDir, '.pulumi', 'locks');
            if (existsSync(lockDir)) {
                const locks = readdirSync(lockDir);
                if (locks.length > 0) {
                    locks.forEach(lock => {
                        unlinkSync(join(lockDir, lock));
                        actions.push(`Removed lock: ${lock}`);
                    });
                }
            }
        }
        // Check port availability
        spinner.text = 'Checking port 3000...';
        try {
            execSync('lsof -ti:3000', { encoding: 'utf-8' });
            console.log(chalk.yellow('\n⚠️  Port 3000 is in use'));
            actions.push('Port 3000 occupied - SST will use 3001');
        }
        catch (error) {
            // Port free - that's good
        }
        spinner.succeed('Dev environment recovery complete');
        if (actions.length === 0) {
            actions.push('No issues found - environment is healthy');
        }
        return {
            success: true,
            message: 'Dev environment recovered',
            actions,
        };
    }
    catch (error) {
        spinner.fail(`Dev recovery failed: ${error.message}`);
        return {
            success: false,
            message: error.message,
            actions: [],
        };
    }
}
/**
 * Main recovery command handler
 */
export async function recover(target, projectRoot = process.cwd()) {
    console.log(chalk.bold.cyan('\n🔧 Deploy-Kit Recovery\n'));
    let result;
    // Load config (needed for CloudFront recovery)
    let config = null;
    try {
        const configPath = join(projectRoot, '.deploy-config.json');
        if (existsSync(configPath)) {
            const content = readFileSync(configPath, 'utf-8');
            const unvalidatedConfig = JSON.parse(content);
            const validation = validateConfig(unvalidatedConfig);
            if (validation.valid) {
                config = unvalidatedConfig;
            }
        }
    }
    catch (error) {
        // Config not found - some recovery operations don't need it
    }
    switch (target.toLowerCase()) {
        case 'cloudfront':
            result = await recoverCloudFront(projectRoot, config);
            break;
        case 'state':
            result = await recoverState(projectRoot);
            break;
        case 'dev':
            result = await recoverDev(projectRoot);
            break;
        default:
            console.log(chalk.red(`\n❌ Unknown recovery target: ${target}`));
            console.log(chalk.gray('\nAvailable targets:'));
            console.log(chalk.cyan('  cloudfront  ') + '- Fix stuck CloudFront distributions');
            console.log(chalk.cyan('  state       ') + '- Fix corrupted Pulumi state');
            console.log(chalk.cyan('  dev         ') + '- General dev environment recovery\n');
            return;
    }
    // Show results
    console.log();
    if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
    }
    else {
        console.log(chalk.red(`❌ ${result.message}`));
    }
    if (result.actions.length > 0) {
        console.log(chalk.gray('\nActions taken:'));
        result.actions.forEach(action => console.log(chalk.gray(`  • ${action}`)));
    }
    console.log();
}
