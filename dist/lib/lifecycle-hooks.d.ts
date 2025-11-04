/**
 * Lifecycle Hooks - Execute custom scripts during deployment
 *
 * Supports npm-style lifecycle hooks via package.json scripts:
 * - pre-deploy / pre-deploy:<stage>
 * - post-deploy / post-deploy:<stage>
 * - on-failure / on-failure:<stage>
 *
 * Stage-specific hooks take precedence over generic hooks.
 */
import type { DeploymentStage } from '../types.js';
export type LifecycleHookType = 'pre-deploy' | 'post-deploy' | 'on-failure';
export interface LifecycleHookContext {
    stage: DeploymentStage;
    isDryRun: boolean;
    startTime: Date;
    projectRoot: string;
}
export interface PackageJsonScripts {
    [key: string]: string;
}
/**
 * Run a lifecycle hook if it exists
 *
 * @param hookType - Type of hook (pre-deploy, post-deploy, on-failure)
 * @param context - Deployment context
 * @returns true if hook ran successfully (or no hook exists), false if hook failed
 *
 * @example
 * ```typescript
 * await runLifecycleHook('pre-deploy', {
 *   stage: 'production',
 *   isDryRun: false,
 *   startTime: new Date(),
 *   projectRoot: '/path/to/project'
 * });
 * ```
 */
export declare function runLifecycleHook(hookType: LifecycleHookType, context: LifecycleHookContext): Promise<boolean>;
/**
 * Check if a lifecycle hook exists
 *
 * Useful for conditional logging/behavior
 */
export declare function hasLifecycleHook(hookType: LifecycleHookType, stage: DeploymentStage, projectRoot: string): boolean;
//# sourceMappingURL=lifecycle-hooks.d.ts.map