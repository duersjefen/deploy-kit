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

import { execa } from 'execa';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import type { DeploymentStage } from '../types.js';
import { detectPackageManager } from '../utils/package-manager.js';

export type LifecycleHookType = 'pre-deploy' | 'post-deploy' | 'on-failure' | 'pre-dev';

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
 * Load package.json from project root
 */
function loadPackageJson(projectRoot: string): PackageJsonScripts | null {
  try {
    const packageJsonPath = resolve(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return null;
    }
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    return packageJson.scripts || {};
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Could not load package.json: ${(error as Error).message}`));
    return null;
  }
}

/**
 * Resolve hook name with stage-specific fallback
 *
 * Priority:
 * 1. <hookType>:<stage> (e.g., "pre-deploy:production")
 * 2. <hookType> (e.g., "pre-deploy")
 * 3. null (no hook found)
 */
function resolveHookName(
  scripts: PackageJsonScripts,
  hookType: LifecycleHookType,
  stage: DeploymentStage
): string | null {
  // Try stage-specific hook first
  const stageSpecificHook = `${hookType}:${stage}`;
  if (scripts[stageSpecificHook]) {
    return stageSpecificHook;
  }

  // Fallback to generic hook
  if (scripts[hookType]) {
    return hookType;
  }

  return null;
}

/**
 * Execute a lifecycle hook
 *
 * Runs the script with environment variables:
 * - DEPLOY_KIT_STAGE
 * - DEPLOY_KIT_DRY_RUN
 * - DEPLOY_KIT_START_TIME
 *
 * Failures are logged but don't block deployment.
 */
async function executeHook(
  hookName: string,
  hookScript: string,
  context: LifecycleHookContext
): Promise<boolean> {
  console.log(chalk.gray(`  Running ${hookName}: ${hookScript}`));

  try {
    const packageManager = detectPackageManager(context.projectRoot);

    // Set environment variables
    const env = {
      ...process.env,
      DEPLOY_KIT_STAGE: context.stage,
      DEPLOY_KIT_DRY_RUN: String(context.isDryRun),
      DEPLOY_KIT_START_TIME: context.startTime.toISOString(),
    };

    // Execute via package manager's run command
    // runCommand already includes 'npm', 'pnpm', etc.
    // We just need to add 'run' and the hook name
    const { stdout, stderr } = await execa(
      packageManager.name,
      ['run', hookName],
      {
        cwd: context.projectRoot,
        env,
        shell: true,
      }
    );

    // Log output if present
    if (stdout) {
      console.log(chalk.gray(stdout));
    }
    if (stderr) {
      console.log(chalk.gray(stderr));
    }

    console.log(chalk.green(`  ✓ ${hookName} completed successfully`));
    return true;

  } catch (error) {
    const err = error as any;
    console.log(chalk.yellow(`  ⚠️  ${hookName} failed (continuing anyway)`));
    if (err.stdout) {
      console.log(chalk.gray(err.stdout));
    }
    if (err.stderr) {
      console.log(chalk.gray(err.stderr));
    }
    if (err.message && !err.stdout && !err.stderr) {
      console.log(chalk.gray(`  Error: ${err.message}`));
    }
    return false;
  }
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
export async function runLifecycleHook(
  hookType: LifecycleHookType,
  context: LifecycleHookContext
): Promise<boolean> {
  const scripts = loadPackageJson(context.projectRoot);

  // No package.json or no scripts - skip
  if (!scripts) {
    return true;
  }

  // Resolve hook name (stage-specific or generic)
  const hookName = resolveHookName(scripts, hookType, context.stage);

  // No hook defined - skip
  if (!hookName) {
    return true;
  }

  const hookScript = scripts[hookName];

  console.log(chalk.bold.white(`\n▸ Lifecycle Hook: ${hookName}`));

  return await executeHook(hookName, hookScript, context);
}

/**
 * Check if a lifecycle hook exists
 *
 * Useful for conditional logging/behavior
 */
export function hasLifecycleHook(
  hookType: LifecycleHookType,
  stage: DeploymentStage,
  projectRoot: string
): boolean {
  const scripts = loadPackageJson(projectRoot);
  if (!scripts) {
    return false;
  }
  return resolveHookName(scripts, hookType, stage) !== null;
}
