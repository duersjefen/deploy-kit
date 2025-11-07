/**
 * Lifecycle Hooks - Execute custom scripts during deployment
 *
 * Supports lifecycle hooks from two sources (in priority order):
 * 1. .deploy-config.json hooks section (recommended)
 * 2. package.json scripts (fallback for backward compatibility)
 *
 * Available hooks:
 * - preDev: Run before starting dev server
 * - preDeploy / preDeploy:<stage>: Run before deployment
 * - postDeploy / postDeploy:<stage>: Run after deployment
 * - onError / onError:<stage>: Run on deployment failure
 *
 * Stage-specific hooks take precedence over generic hooks.
 */

import { execa } from 'execa';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import type { DeploymentStage, ProjectConfig } from '../types.js';
import { detectPackageManager } from '../utils/package-manager.js';

export type LifecycleHookType = 'pre-deploy' | 'post-deploy' | 'on-failure' | 'pre-dev';

export interface LifecycleHookContext {
  stage: DeploymentStage;
  isDryRun: boolean;
  startTime: Date;
  projectRoot: string;
  config?: ProjectConfig;
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
 * Resolve hook command from config or package.json
 *
 * Priority:
 * 1. config.hooks[hookType] (from .deploy-config.json)
 * 2. package.json scripts[hookType:stage]
 * 3. package.json scripts[hookType]
 * 4. null (no hook found)
 */
function resolveHookCommand(
  hookType: LifecycleHookType,
  stage: DeploymentStage,
  config?: ProjectConfig,
  scripts?: PackageJsonScripts
): { command: string; source: 'config' | 'package.json' } | null {
  // Convert hook type to config key (pre-deploy -> preDeploy)
  const configKey = hookType.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

  // 1. Check .deploy-config.json hooks first (highest priority)
  if (config?.hooks) {
    const hookCommand = (config.hooks as any)[configKey];
    if (hookCommand) {
      return { command: hookCommand, source: 'config' };
    }
  }

  // 2. Check package.json scripts (fallback for backward compatibility)
  if (scripts) {
    // Try stage-specific hook first
    const stageSpecificHook = `${hookType}:${stage}`;
    if (scripts[stageSpecificHook]) {
      return { command: stageSpecificHook, source: 'package.json' };
    }

    // Fallback to generic hook
    if (scripts[hookType]) {
      return { command: hookType, source: 'package.json' };
    }
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
  hookCommand: string,
  source: 'config' | 'package.json',
  context: LifecycleHookContext
): Promise<boolean> {
  console.log(chalk.gray(`  Running ${hookName}: ${hookCommand}`));

  try {
    // Set environment variables
    const env = {
      ...process.env,
      DEPLOY_KIT_STAGE: context.stage,
      DEPLOY_KIT_DRY_RUN: String(context.isDryRun),
      DEPLOY_KIT_START_TIME: context.startTime.toISOString(),
    };

    let execResult;

    if (source === 'config') {
      // Execute command directly (from .deploy-config.json)
      execResult = await execa(hookCommand, {
        cwd: context.projectRoot,
        env,
        shell: true,
      });
    } else {
      // Execute via package manager (from package.json scripts)
      const packageManager = detectPackageManager(context.projectRoot);
      execResult = await execa(
        packageManager.name,
        ['run', hookCommand],
        {
          cwd: context.projectRoot,
          env,
          shell: true,
        }
      );
    }

    // Log output if present
    if (execResult.stdout) {
      console.log(chalk.gray(execResult.stdout));
    }
    if (execResult.stderr) {
      console.log(chalk.gray(execResult.stderr));
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
 * Checks both .deploy-config.json hooks and package.json scripts.
 * Config hooks take precedence over package.json scripts.
 *
 * @param hookType - Type of hook (pre-dev, pre-deploy, post-deploy, on-failure)
 * @param context - Deployment context with optional config
 * @returns true if hook ran successfully (or no hook exists), false if hook failed
 *
 * @example
 * ```typescript
 * // From .deploy-config.json
 * await runLifecycleHook('pre-dev', {
 *   stage: 'staging',
 *   isDryRun: false,
 *   startTime: new Date(),
 *   projectRoot: '/path/to/project',
 *   config: config
 * });
 * ```
 */
export async function runLifecycleHook(
  hookType: LifecycleHookType,
  context: LifecycleHookContext
): Promise<boolean> {
  const scripts = loadPackageJson(context.projectRoot);

  // Resolve hook command from config or package.json
  const resolved = resolveHookCommand(hookType, context.stage, context.config, scripts || undefined);

  // No hook defined - skip
  if (!resolved) {
    return true;
  }

  const hookDisplayName = hookType + (resolved.source === 'config' ? ' (.deploy-config.json)' : ' (package.json)');

  console.log(chalk.bold.white(`\n▸ Lifecycle Hook: ${hookDisplayName}`));

  return await executeHook(hookType, resolved.command, resolved.source, context);
}

/**
 * Check if a lifecycle hook exists
 *
 * Checks both .deploy-config.json hooks and package.json scripts.
 * Useful for conditional logging/behavior.
 */
export function hasLifecycleHook(
  hookType: LifecycleHookType,
  stage: DeploymentStage,
  projectRoot: string,
  config?: ProjectConfig
): boolean {
  const scripts = loadPackageJson(projectRoot);
  return resolveHookCommand(hookType, stage, config, scripts || undefined) !== null;
}
