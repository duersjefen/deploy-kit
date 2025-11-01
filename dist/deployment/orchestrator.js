import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
const execAsync = promisify(exec);
/**
 * Deployment orchestrator - manages the high-level deployment workflow
 *
 * Responsible for:
 * - Coordinating deployment stages
 * - Running build commands
 * - Executing SST deployments with real-time output
 * - Extracting deployment artifacts (CloudFront IDs, etc.)
 *
 * @example
 * ```typescript
 * const orchestrator = new DeploymentOrchestrator(config, '/path/to/project');
 * const result = await orchestrator.executeDeploy(stage, {
 *   onStart: () => console.log('Starting...'),
 *   onComplete: (distId) => console.log('Done!', distId),
 * });
 * ```
 */
export class DeploymentOrchestrator {
    constructor(config, projectRoot = process.cwd()) {
        this.config = config;
        this.projectRoot = projectRoot;
    }
    /**
     * Detect if this is an SST project by checking for sst.config file
     *
     * @returns True if sst.config.ts or sst.config.js exists
     */
    isSSTProject() {
        return existsSync(join(this.projectRoot, 'sst.config.ts')) ||
            existsSync(join(this.projectRoot, 'sst.config.js'));
    }
    /**
     * Run build command (for non-SST projects)
     * SST projects handle building internally during deployment
     *
     * @throws {Error} If build command fails
     */
    async runBuild() {
        const spinner = ora('Building application...').start();
        try {
            if (this.config.hooks?.postBuild) {
                const { stdout } = await execAsync(this.config.hooks.postBuild, {
                    cwd: this.projectRoot,
                });
                spinner.info(`Build output: ${stdout}`);
            }
            else {
                // Default: npm run build
                await execAsync('npm run build', {
                    cwd: this.projectRoot,
                });
            }
            spinner.succeed('✅ Build successful');
        }
        catch (error) {
            spinner.fail('❌ Build failed');
            throw error;
        }
    }
    /**
     * Execute deployment command and extract CloudFront distribution ID
     *
     * @param stage - Deployment stage (development, staging, production)
     * @returns CloudFront distribution ID if found, null otherwise
     * @throws {Error} If deployment fails
     */
    async executeDeploy(stage) {
        const spinner = ora(`Deploying to ${stage}...`).start();
        try {
            const stageConfig = this.config.stageConfig[stage];
            const sstStage = stageConfig.sstStageName || stage;
            let deployOutput = '';
            if (this.config.customDeployScript) {
                // Use custom deployment script
                const { stdout } = await execAsync(`bash ${this.config.customDeployScript} ${stage}`, {
                    cwd: this.projectRoot,
                });
                deployOutput = stdout;
                spinner.succeed(`✅ Deployed to ${stage}`);
            }
            else {
                // Default: SST deploy with streaming output
                deployOutput = await this.runSSTDeployWithStreaming(stage, sstStage, spinner);
                spinner.succeed(`✅ Deployed to ${stage}`);
            }
            // Extract CloudFront distribution ID from deployment output
            const distId = this.extractCloudFrontDistributionId(deployOutput);
            if (distId) {
                spinner.info(`CloudFront distribution ID: ${distId}`);
            }
            return distId;
        }
        catch (error) {
            spinner.fail(`❌ Deployment to ${stage} failed`);
            throw error;
        }
    }
    /**
     * Run SST deploy with real-time streaming output
     *
     * Shows the last 4 lines of deployment output with smart formatting:
     * - Blue for building/bundling operations
     * - Green for resource creation
     * - Red for errors
     * - Yellow for applying/installing
     * - Cyan for waiting states
     *
     * @param stage - Deployment stage name
     * @param sstStage - SST-specific stage name
     * @param spinner - Ora spinner instance for status updates
     * @returns Complete stdout from SST deployment
     * @throws {Error} If SST deploy exits with non-zero code
     *
     * @private
     */
    async runSSTDeployWithStreaming(stage, sstStage, spinner) {
        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                ...(this.config.awsProfile && {
                    AWS_PROFILE: this.config.awsProfile,
                }),
            };
            const child = spawn('npx', ['sst', 'deploy', '--stage', sstStage], {
                cwd: this.projectRoot,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            const outputLines = [];
            const maxLines = 4; // Reduced for narrow terminals
            let lastUpdateTime = Date.now();
            // Detect terminal width (default to 80 if not available)
            const terminalWidth = process.stdout.columns || 80;
            // Reserve space for indicator (2 chars) and padding
            const maxLineLength = Math.max(40, terminalWidth - 8);
            // Helper to clean ANSI codes and truncate smartly
            const formatLine = (line) => {
                const clean = line.replace(/\x1B\[[0-9;]*m/g, '').trim();
                // Extract the operation type for coloring
                if (clean.includes('Building') || clean.includes('Bundling')) {
                    return chalk.blue(truncate(clean, maxLineLength));
                }
                else if (clean.includes('Created')) {
                    return chalk.green(truncate(clean, maxLineLength));
                }
                else if (clean.includes('Error') || clean.includes('Failed')) {
                    return chalk.red(truncate(clean, maxLineLength));
                }
                else if (clean.includes('Applying') || clean.includes('Installing')) {
                    return chalk.yellow(truncate(clean, maxLineLength));
                }
                else if (clean.includes('Waiting')) {
                    return chalk.cyan(truncate(clean, maxLineLength));
                }
                return truncate(clean, maxLineLength);
            };
            const truncate = (str, len) => {
                if (str.length <= len)
                    return str;
                return str.substring(0, len - 1) + '…';
            };
            // Handle stdout
            child.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const formatted = formatLine(line);
                    if (formatted && formatted.length > 0) {
                        outputLines.push(formatted);
                        if (outputLines.length > maxLines) {
                            outputLines.shift();
                        }
                    }
                }
                // Update spinner with smart formatting
                const now = Date.now();
                if (now - lastUpdateTime > 250 && outputLines.length > 0) {
                    lastUpdateTime = now;
                    const displayText = outputLines
                        .map((l, i) => {
                        const indicator = i === outputLines.length - 1 ? '▸' : '·';
                        return `  ${chalk.dim(indicator)} ${l}`;
                    })
                        .join('\n');
                    spinner.text = `Deploying to ${stage}...\n\n${displayText}\n`;
                }
            });
            // Handle stderr
            child.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const formatted = chalk.red(truncate(line.replace(/\x1B\[[0-9;]*m/g, '').trim(), maxLineLength));
                    if (formatted && formatted.length > 0) {
                        outputLines.push(formatted);
                        if (outputLines.length > maxLines) {
                            outputLines.shift();
                        }
                    }
                }
                const now = Date.now();
                if (now - lastUpdateTime > 250 && outputLines.length > 0) {
                    lastUpdateTime = now;
                    const displayText = outputLines
                        .map((l, i) => {
                        const indicator = i === outputLines.length - 1 ? '▸' : '·';
                        return `  ${chalk.dim(indicator)} ${l}`;
                    })
                        .join('\n');
                    spinner.text = `Deploying to ${stage}...\n\n${displayText}\n`;
                }
            });
            // Handle process exit
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                }
                else {
                    reject(new Error(`SST deploy failed with exit code ${code}\n${stderr}`));
                }
            });
            child.on('error', (error) => {
                reject(error);
            });
        });
    }
    /**
     * Extract CloudFront distribution ID from SST deployment output
     *
     * Looks for patterns like:
     * - CloudFront URLs: https://d1234abcd.cloudfront.net
     * - JSON output with distributionId field
     *
     * @param output - Complete stdout from SST deployment
     * @returns Distribution ID (e.g., "d1234abcd") or null if not found
     *
     * @example
     * ```typescript
     * const distId = extractCloudFrontDistributionId(sstOutput);
     * // Returns: "d1muqpyoeowt1o"
     * ```
     */
    extractCloudFrontDistributionId(output) {
        // SST outputs CloudFront URLs in format: https://d1234abcd.cloudfront.net
        // Extract the distribution ID (the 'dXXXXabcd' part)
        const cloudFrontMatch = output.match(/https:\/\/([a-z0-9]+)\.cloudfront\.net/i);
        if (cloudFrontMatch && cloudFrontMatch[1]) {
            // The distribution ID starts with 'd' (or 'D')
            // For example: d1234abcd from d1234abcd.cloudfront.net
            return cloudFrontMatch[1];
        }
        // Fallback: Look for distribution ID in JSON output (some SST versions output JSON)
        try {
            // Try to find JSON output that contains distribution info
            const jsonMatch = output.match(/\{[\s\S]*?"distributionId"[\s\S]*?\}/);
            if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                if (json.distributionId) {
                    return json.distributionId;
                }
            }
        }
        catch {
            // JSON parsing failed, continue to next method
        }
        // Fallback: Query CloudFront for recent distributions
        // This is slower but more reliable if output parsing fails
        // We'll implement this if the above methods don't work
        return null;
    }
    /**
     * Print deployment summary on success
     *
     * @param result - Deployment result object
     * @param stageTimings - Array of stage timing information
     */
    printDeploymentSummary(result, stageTimings) {
        console.log('\n' + chalk.bold.green('═'.repeat(60)));
        console.log(chalk.bold.green('✨ DEPLOYMENT SUCCESSFUL'));
        console.log(chalk.bold.green('═'.repeat(60)));
        console.log('\n📊 Deployment Summary:');
        console.log(chalk.green(`  Stage: ${result.stage}`));
        console.log(chalk.green(`  Total Duration: ${result.durationSeconds}s`));
        console.log(chalk.green(`  Status: ✅ All checks passed\n`));
        if (stageTimings.length > 0) {
            console.log('⏱️  Stage Timing Breakdown:');
            for (const timing of stageTimings) {
                const durationMs = timing.duration;
                const durationSecs = (durationMs / 1000).toFixed(1);
                const barLength = Math.round((durationMs / 5000)); // Scale: 5s = full bar
                const bar = '█'.repeat(Math.min(barLength, 20));
                console.log(`  ${timing.name.padEnd(25)} ${bar.padEnd(20)} ${durationSecs}s`);
            }
            console.log('');
        }
        console.log(chalk.green(`✅ Application is now live on ${result.stage}`));
        console.log(chalk.gray(`   Deployment completed at ${result.endTime.toLocaleTimeString()}\n`));
    }
    /**
     * Print deployment summary on failure
     *
     * @param result - Deployment result object
     * @param stageTimings - Array of stage timing information
     */
    printDeploymentFailureSummary(result, stageTimings) {
        console.log('\n' + chalk.bold.red('═'.repeat(60)));
        console.log(chalk.bold.red('❌ DEPLOYMENT FAILED'));
        console.log(chalk.bold.red('═'.repeat(60)));
        console.log('\n❌ Deployment Summary:');
        console.log(chalk.red(`  Stage: ${result.stage}`));
        console.log(chalk.red(`  Duration: ${(result.endTime.getTime() - result.startTime.getTime()) / 1000}s`));
        console.log(chalk.red(`  Error: ${result.error}\n`));
        console.log(chalk.yellow('🔧 Recovery Options:'));
        console.log(chalk.yellow(`  1. Review error message above`));
        console.log(chalk.yellow(`  2. Fix the issue locally`));
        console.log(chalk.yellow(`  3. Retry deployment: npx deploy-kit deploy ${result.stage}`));
        console.log(chalk.yellow(`  4. Or force recovery: npx deploy-kit recover ${result.stage}\n`));
    }
}
