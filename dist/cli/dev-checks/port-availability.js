/**
 * Port Availability Check with Auto-Increment
 * Ensures required ports are not already in use, with graceful fallback to next available port
 */
import chalk from 'chalk';
import { execSync } from 'child_process';
/**
 * Get process name from PID
 */
function getProcessName(pid) {
    try {
        const result = execSync(`ps -p ${pid} -o comm=`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return result.trim();
    }
    catch (error) {
        return 'unknown';
    }
}
/**
 * Check if a specific port is available
 */
function checkPort(port) {
    try {
        const result = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const pids = result.trim().split('\n').filter(p => p);
        if (pids.length > 0) {
            const processes = pids.map(pid => getProcessName(pid));
            return { port, available: false, pids, processes };
        }
    }
    catch (error) {
        // lsof returns error code if no process found (port is available)
    }
    return { port, available: true };
}
/**
 * Find first available port in range, with auto-increment
 *
 * @param startPort - Starting port to check (default: 3000)
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Port info for first available port, or null if all exhausted
 */
export function findAvailablePort(startPort = 3000, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const port = startPort + i;
        const info = checkPort(port);
        if (info.available) {
            return info;
        }
    }
    return null;
}
/**
 * Create port availability check with auto-increment support
 *
 * Behavior:
 * - If port available: Pass silently
 * - If port in use: Auto-increment to next available (3000 → 3001 → 3002...)
 * - If all ports exhausted (3000-3009): Fail with detailed process info
 */
export function createPortAvailabilityCheck(requestedPort = 3000) {
    return async () => {
        console.log(chalk.gray(`🔍 Checking port availability...`));
        const portInfo = checkPort(requestedPort);
        // Requested port is available
        if (portInfo.available) {
            console.log(chalk.green(`✅ Port ${requestedPort} available\n`));
            return { passed: true };
        }
        // Requested port in use - show info and auto-increment
        console.log(chalk.yellow(`⚠️  Port ${requestedPort} in use by:`));
        portInfo.processes?.forEach((proc, idx) => {
            const pid = portInfo.pids?.[idx];
            console.log(chalk.gray(`   • ${proc} (PID ${pid})`));
        });
        // Try to find next available port
        const availablePort = findAvailablePort(requestedPort + 1, 9);
        if (availablePort) {
            console.log(chalk.green(`✅ Using port ${availablePort.port}\n`));
            // Store the selected port for SST to use
            // This will be picked up by sst-starter.ts
            process.env.DEPLOY_KIT_SELECTED_PORT = availablePort.port.toString();
            return { passed: true };
        }
        // All ports exhausted - collect info on all occupied ports
        console.log(chalk.red(`\n❌ Port Conflict: Ports ${requestedPort}-${requestedPort + 9} are all in use\n`));
        console.log(chalk.yellow('Processes occupying ports:'));
        for (let i = 0; i < 10; i++) {
            const port = requestedPort + i;
            const info = checkPort(port);
            if (!info.available && info.processes && info.pids) {
                info.processes.forEach((proc, idx) => {
                    const pid = info.pids?.[idx];
                    console.log(chalk.gray(`  • Port ${port}: ${proc} (PID ${pid})`));
                });
            }
        }
        console.log();
        console.log(chalk.bold('Solutions:'));
        console.log(chalk.gray(`  1. Kill a process: kill ${portInfo.pids?.[0]}`));
        console.log(chalk.gray(`  2. Specify custom port: deploy-kit dev --port 4000`));
        console.log(chalk.gray(`  3. Kill all on port: lsof -ti:${requestedPort} | xargs kill\n`));
        return {
            passed: false,
            issue: `Ports ${requestedPort}-${requestedPort + 9} are all in use`,
            manualFix: `Kill a process or use --port flag`,
        };
    };
}
