/**
 * Pre-Deployment Check Runner
 *
 * Executes individual checks with timeout and streaming output
 */
import { spawn } from 'child_process';
import chalk from 'chalk';
import { CollapsibleOutput } from '../lib/collapsible-output.js';
/**
 * Run a single pre-deployment check
 *
 * Executes the check command with timeout protection and streams output to console.
 * The check fails if:
 * - Command exits with non-zero code
 * - Command times out
 * - Command cannot be spawned
 *
 * @param check - Check configuration with command and timeout
 * @param cwd - Working directory to run the check in
 * @returns Promise that resolves with check result
 *
 * @example
 * ```typescript
 * const result = await runCheck({
 *   name: 'Type Check',
 *   command: 'npm run typecheck',
 *   timeout: 30000
 * }, '/path/to/project');
 *
 * if (result.success) {
 *   console.log('Type check passed!');
 * }
 * ```
 */
export async function runCheck(check, cwd) {
    const startTime = Date.now();
    const checkName = check.name || check.command;
    // Create collapsible output section
    const collapsible = new CollapsibleOutput();
    // Start section with header and command
    const header = chalk.cyan(`\n▶ Running: ${checkName}`) + '\n' + chalk.gray(`  Command: ${check.command}\n`);
    collapsible.startSection(header);
    return new Promise((resolve) => {
        // Parse command and arguments
        const [command, ...args] = check.command.split(' ');
        // Spawn process with shell=true for npm scripts support
        const child = spawn(command, args, {
            cwd,
            shell: true,
            env: { ...process.env, CI: 'true' }, // Set CI flag for better test output
        });
        let stdout = '';
        let stderr = '';
        // Stream stdout to console and capture (de-emphasize with gray color)
        if (child.stdout) {
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                // Write through collapsible output (de-emphasized)
                collapsible.writeLine(chalk.gray(text));
            });
        }
        // Stream stderr to console and capture
        if (child.stderr) {
            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                // Write errors (keep visible, no gray)
                collapsible.writeLine(text);
            });
        }
        // Set timeout
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            const duration = Date.now() - startTime;
            const durationSecs = (duration / 1000).toFixed(1);
            const summary = chalk.red(`❌ ${checkName} timed out (${durationSecs}s)`);
            // Keep expanded on failure
            collapsible.keepExpanded(summary);
            resolve({
                name: checkName,
                success: false,
                duration,
                output: stdout,
                error: `Timeout after ${check.timeout}ms`,
            });
        }, check.timeout || 300000); // Default 5 minutes
        // Handle process exit
        child.on('close', (code) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            const durationSecs = (duration / 1000).toFixed(1);
            if (code === 0) {
                // Collapse to just success summary
                const summary = chalk.green(`✅ ${checkName} passed (${durationSecs}s)`);
                collapsible.collapse(summary);
                resolve({
                    name: checkName,
                    success: true,
                    duration,
                    output: stdout,
                });
            }
            else {
                // Keep expanded on failure
                const summary = chalk.red(`❌ ${checkName} failed (${durationSecs}s)`);
                collapsible.keepExpanded(summary);
                resolve({
                    name: checkName,
                    success: false,
                    duration,
                    output: stdout,
                    error: stderr || `Process exited with code ${code}`,
                });
            }
        });
        // Handle spawn errors
        child.on('error', (error) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            const durationSecs = (duration / 1000).toFixed(1);
            const summary = chalk.red(`❌ ${checkName} failed (${durationSecs}s)`);
            // Keep expanded on failure
            collapsible.keepExpanded(summary);
            resolve({
                name: checkName,
                success: false,
                duration,
                output: stdout,
                error: `Failed to spawn process: ${error.message}`,
            });
        });
    });
}
