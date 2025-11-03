import { existsSync } from 'fs';
import { resolve } from 'path';
/**
 * Detect which package manager is being used in a project
 * by checking for lock files in order of preference
 */
export function detectPackageManager(projectPath = process.cwd()) {
    // Check for lock files in order of preference
    if (existsSync(resolve(projectPath, 'pnpm-lock.yaml'))) {
        return {
            name: 'pnpm',
            installCommand: 'pnpm install',
            runCommand: 'pnpm',
            executeCommand: 'pnpm',
        };
    }
    if (existsSync(resolve(projectPath, 'yarn.lock'))) {
        return {
            name: 'yarn',
            installCommand: 'yarn install',
            runCommand: 'yarn',
            executeCommand: 'yarn',
        };
    }
    if (existsSync(resolve(projectPath, 'bun.lockb'))) {
        return {
            name: 'bun',
            installCommand: 'bun install',
            runCommand: 'bun',
            executeCommand: 'bun',
        };
    }
    // Default to npm if no lock file found
    return {
        name: 'npm',
        installCommand: 'npm install',
        runCommand: 'npm run',
        executeCommand: 'npm',
    };
}
/**
 * Format a command for the detected package manager
 */
export function formatCommand(command, projectPath = process.cwd()) {
    const pm = detectPackageManager(projectPath);
    // Handle different command types
    if (command.startsWith('npm install')) {
        const args = command.replace('npm install', '').trim();
        return `${pm.installCommand}${args ? ' ' + args : ''}`;
    }
    if (command.startsWith('npm run')) {
        const script = command.replace('npm run', '').trim();
        return `${pm.runCommand} ${script}`;
    }
    // Generic npm command
    if (command.startsWith('npm')) {
        return command.replace('npm', pm.executeCommand);
    }
    return command;
}
/**
 * Get formatted examples for user-facing messages
 */
export function getPackageManagerExamples(projectPath = process.cwd()) {
    const pm = detectPackageManager(projectPath);
    return {
        install: pm.installCommand,
        run: (script) => {
            if (pm.name === 'npm') {
                return `npm run ${script}`;
            }
            return `${pm.runCommand} ${script}`;
        },
        execute: (script) => `${pm.executeCommand} ${script}`,
    };
}
