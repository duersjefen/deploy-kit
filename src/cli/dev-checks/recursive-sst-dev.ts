/**
 * Recursive SST Dev Script Check
 * Detects package.json dev scripts that call 'sst dev', which causes infinite recursion
 *
 * Issue: SST internally runs `npm run dev` to start your framework, so if your
 * dev script calls `sst dev`, it creates an infinite loop.
 *
 * DEP-41: This check is disabled for SST projects with sst.config.ts, as SST
 * properly handles orchestration when running dev commands in subdirectories.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

/**
 * Package.json structure (relevant fields only)
 */
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/**
 * Detect which framework the project uses based on package.json dependencies
 */
function detectFramework(packageJson: PackageJson): string {
  if (packageJson.dependencies?.next) return 'next dev';
  if (packageJson.dependencies?.remix) return 'remix dev';
  if (packageJson.dependencies?.astro) return 'astro dev';
  if (packageJson.dependencies?.vite) return 'vite';
  return 'next dev'; // Default for SST
}

/**
 * Check if project has SST orchestration configuration
 *
 * SST projects with sst.config.ts properly handle dev script orchestration,
 * even when the root package.json has "dev": "sst dev" and SST runs
 * commands in subdirectories.
 */
function hasSSTConfig(projectRoot: string): boolean {
  return existsSync(join(projectRoot, 'sst.config.ts'));
}

export function createRecursiveSstDevCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking for recursive SST dev script...'));

    // DEP-41: Skip check for SST projects with sst.config.ts
    // SST handles orchestration correctly when running commands in subdirectories
    if (hasSSTConfig(projectRoot)) {
      console.log(chalk.green('✅ SST project detected (orchestration handled by SST)\n'));
      return { passed: true };
    }

    const packageJsonPath = join(projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      console.log(chalk.green('✅ No package.json found (skipping)\n'));
      return { passed: true };
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
    const devScript = packageJson.scripts?.dev;

    // Check if dev script calls sst dev
    if (devScript && devScript.includes('sst dev')) {
      console.log(chalk.yellow(`⚠️  Recursive dev script detected:\n`));
      console.log(chalk.gray(`   Current: "dev": "${devScript}"`));
      console.log(chalk.gray('   This creates infinite recursion!\n'));

      const frameworkDevCommand = detectFramework(packageJson);

      return {
        passed: false,
        issue: 'Recursive SST dev script detected in package.json',
        canAutoFix: true,
        errorType: 'recursive_sst_dev',
        manualFix: `Separate SST from framework dev scripts:\n  "dev": "${frameworkDevCommand}",\n  "sst:dev": "${devScript}"`,
        autoFix: async () => {
          // Move sst dev to separate script
          packageJson.scripts!['sst:dev'] = devScript;

          // Replace dev with framework-only command
          packageJson.scripts!['dev'] = frameworkDevCommand;

          writeFileSync(
            packageJsonPath,
            JSON.stringify(packageJson, null, 2) + '\n'
          );

          console.log(chalk.green('   Fixed! New scripts:'));
          console.log(chalk.gray(`   "dev": "${frameworkDevCommand}"`));
          console.log(chalk.gray(`   "sst:dev": "${devScript}"`));
        },
      };
    }

    console.log(chalk.green('✅ No recursive script detected\n'));
    return { passed: true };
  };
}
