/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import { handleSstDevError } from './error-handler.js';
/**
 * Start SST dev server with proper environment and error handling
 */
export async function startSstDev(projectRoot, config, options) {
    // Determine which port to use (priority: user flag > auto-selected > default 3000)
    const selectedPort = options.port
        || (process.env.DEPLOY_KIT_SELECTED_PORT ? parseInt(process.env.DEPLOY_KIT_SELECTED_PORT) : null)
        || 3000;
    console.log(chalk.bold.cyan('═'.repeat(60)));
    console.log(chalk.bold.cyan('🚀 Starting SST dev server...\n'));
    if (selectedPort !== 3000) {
        console.log(chalk.cyan(`   Frontend: http://localhost:${selectedPort}`));
        console.log(chalk.gray(`   SST Console: http://localhost:13561\n`));
    }
    const args = ['sst', 'dev'];
    if (selectedPort !== 3000) {
        args.push(`--port=${selectedPort}`);
    }
    const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;
    try {
        const child = spawn('npx', args, {
            stdio: 'inherit',
            shell: true,
            cwd: projectRoot,
            env: {
                ...process.env,
                ...(profile && { AWS_PROFILE: profile }),
            },
        });
        // Handle graceful shutdown
        const cleanup = () => {
            console.log(chalk.yellow('\n\n🛑 Stopping SST dev server...'));
            if (child.pid) {
                try {
                    process.kill(child.pid, 'SIGINT');
                }
                catch (err) {
                    // Process may have already exited
                }
            }
            process.exit(0);
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        await new Promise((resolve, reject) => {
            child.on('exit', (code) => {
                if (code === 0 || code === null) {
                    resolve();
                }
                else {
                    reject(new Error(`SST exited with code ${code}`));
                }
            });
            child.on('error', reject);
        });
    }
    catch (error) {
        console.error(chalk.red('\n❌ SST dev failed\n'));
        await handleSstDevError(error);
        process.exit(1);
    }
}
