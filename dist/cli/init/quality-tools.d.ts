/**
 * Quality tools setup (Husky, lint-staged, tsc-files)
 */
/**
 * Create .lintstagedrc.js configuration file
 */
export declare function createLintStagedConfig(projectRoot: string): void;
/**
 * Create .husky/pre-commit hook
 */
export declare function createHuskyPreCommitHook(projectRoot: string): void;
/**
 * Update .gitignore with SST-specific entries
 */
export declare function updateGitIgnore(projectRoot: string): void;
/**
 * Install quality tools dependencies
 */
export declare function installQualityTools(projectRoot: string): Promise<void>;
/**
 * Add prepare script to package.json for Husky
 */
export declare function addPrepareScript(projectRoot: string): void;
//# sourceMappingURL=quality-tools.d.ts.map