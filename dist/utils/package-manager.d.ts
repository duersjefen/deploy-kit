export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun';
export interface PackageManagerInfo {
    name: PackageManager;
    installCommand: string;
    runCommand: string;
    executeCommand: string;
}
/**
 * Detect which package manager is being used in a project
 * by checking for lock files in order of preference
 */
export declare function detectPackageManager(projectPath?: string): PackageManagerInfo;
/**
 * Format a command for the detected package manager
 */
export declare function formatCommand(command: string, projectPath?: string): string;
/**
 * Get formatted examples for user-facing messages
 */
export declare function getPackageManagerExamples(projectPath?: string): {
    install: string;
    run: (script: string) => string;
    execute: (script: string) => string;
};
//# sourceMappingURL=package-manager.d.ts.map