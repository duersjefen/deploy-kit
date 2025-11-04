/**
 * Pre-Deployment Check Runner
 *
 * Executes individual checks with timeout and streaming output
 */
import { spawn } from 'child_process';
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
        // Stream stdout to console and capture
        if (child.stdout) {
            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                process.stdout.write(text); // Stream to console
            });
        }
        // Stream stderr to console and capture
        if (child.stderr) {
            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                process.stderr.write(text); // Stream to console
            });
        }
        // Set timeout
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                name: checkName,
                success: false,
                duration: Date.now() - startTime,
                output: stdout,
                error: `Timeout after ${check.timeout}ms`,
            });
        }, check.timeout || 300000); // Default 5 minutes
        // Handle process exit
        child.on('close', (code) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            if (code === 0) {
                resolve({
                    name: checkName,
                    success: true,
                    duration,
                    output: stdout,
                });
            }
            else {
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
            resolve({
                name: checkName,
                success: false,
                duration: Date.now() - startTime,
                output: stdout,
                error: `Failed to spawn process: ${error.message}`,
            });
        });
    });
}
