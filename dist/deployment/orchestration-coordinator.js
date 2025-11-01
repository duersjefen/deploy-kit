/**
 * Deployment Orchestration Coordinator
 *
 * High-level coordination of deployment workflow.
 * Orchestrates the sequence of: build → deploy → extract outputs
 */
import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
import { extractCloudFrontDistributionId } from './aws-state-manager.js';
const execAsync = promisify(exec);
/**
 * Detect if a project uses SST by checking for sst.config file
 *
 * @param projectRoot - Root directory of the project
 * @returns True if sst.config.ts or sst.config.js exists
 *
 * @example
 * ```typescript
 * if (isSSTProject('/path/to/project')) {
 *   // Project uses SST
 * }
 * ```
 */
export function isSSTProject(projectRoot) {
    return (existsSync(join(projectRoot, 'sst.config.ts')) ||
        existsSync(join(projectRoot, 'sst.config.js')));
}
/**
 * Run the build command for the project
 *
 * For non-SST projects, executes npm run build or custom hook.
 * SST projects handle building internally during deployment.
 *
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @throws {Error} If build command fails
 *
 * @example
 * ```typescript
 * try {
 *   await runBuild('/project', config);
 *   console.log('Build successful');
 * } catch (error) {
 *   console.error('Build failed:', error.message);
 * }
 * ```
 */
export async function runBuild(projectRoot, config) {
    const spinner = ora('Building application...').start();
    try {
        if (config.hooks?.postBuild) {
            const { stdout } = await execAsync(config.hooks.postBuild, {
                cwd: projectRoot,
            });
            spinner.info(`Build output: ${stdout}`);
        }
        else {
            // Default: npm run build
            await execAsync('npm run build', {
                cwd: projectRoot,
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
 * Execute deployment and extract CloudFront distribution ID
 *
 * Runs SST deployment with real-time streaming output.
 * Extracts the CloudFront distribution ID from the output if found.
 *
 * @param stage - Deployment stage (development, staging, production)
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @returns CloudFront distribution ID if found, null otherwise
 * @throws {Error} If deployment fails
 *
 * @example
 * ```typescript
 * const distId = await executeDeploy('staging', '/project', config);
 * if (distId) {
 *   console.log(`CloudFront ID: ${distId}`);
 * }
 * ```
 */
export async function executeDeploy(stage, projectRoot, config) {
    const spinner = ora(`Deploying to ${stage}...`).start();
    try {
        const stageConfig = config.stageConfig[stage];
        const sstStage = (stageConfig && 'sstStageName' in stageConfig && stageConfig.sstStageName) || stage;
        let deployOutput = '';
        if (config.customDeployScript) {
            // Use custom deployment script
            const { stdout } = await execAsync(`bash ${config.customDeployScript} ${stage}`, {
                cwd: projectRoot,
            });
            deployOutput = stdout;
            spinner.succeed(`✅ Deployed to ${stage}`);
        }
        else {
            // Default: SST deploy with streaming output
            deployOutput = await runSSTDeployWithStreaming(stage, sstStage, projectRoot, config, spinner);
            spinner.succeed(`✅ Deployed to ${stage}`);
        }
        // Extract CloudFront distribution ID from deployment output
        const distId = extractCloudFrontDistributionId(deployOutput);
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
 * @param projectRoot - Root directory of the project
 * @param config - Project configuration
 * @param spinner - Ora spinner instance for status updates
 * @returns Complete stdout from SST deployment
 * @throws {Error} If SST deploy exits with non-zero code
 *
 * @internal
 */
async function runSSTDeployWithStreaming(stage, sstStage, projectRoot, config, spinner) {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            ...(config.awsProfile && {
                AWS_PROFILE: config.awsProfile,
            }),
        };
        const child = spawn('npx', ['sst', 'deploy', '--stage', sstStage], {
            cwd: projectRoot,
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
