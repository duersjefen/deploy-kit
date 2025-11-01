/**
 * Deployment Orchestration Coordinator
 *
 * High-level coordination of deployment workflow.
 * Orchestrates the sequence of: build → deploy → extract outputs
 */
import type { ProjectConfig, DeploymentStage } from '../types.js';
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
export declare function isSSTProject(projectRoot: string): boolean;
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
export declare function runBuild(projectRoot: string, config: ProjectConfig): Promise<void>;
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
export declare function executeDeploy(stage: DeploymentStage, projectRoot: string, config: ProjectConfig, options?: {
    isDryRun?: boolean;
}): Promise<string | null>;
//# sourceMappingURL=orchestration-coordinator.d.ts.map