/**
 * Next.js Canary Features Check
 * Detects canary-only Next.js features being used with stable Next.js versions
 *
 * Features like turbopackFileSystemCache and cacheComponents are only available
 * in Next.js canary releases and will cause errors on stable versions.
 */

import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

interface CanaryFeature {
  name: string;
  pattern: RegExp;
}

/**
 * List of known canary-only features and their detection patterns
 */
const CANARY_FEATURES: CanaryFeature[] = [
  { name: 'turbopackFileSystemCacheForBuild', pattern: /turbopackFileSystemCacheForBuild/ },
  { name: 'turbopackFileSystemCacheForDev', pattern: /turbopackFileSystemCacheForDev/ },
  { name: 'cacheComponents', pattern: /cacheComponents:\s*true/ },
];

export function createNextJsCanaryFeaturesCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking for Next.js canary-only features...'));

    const packageJsonPath = join(projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      console.log(chalk.green('✅ No package.json found (skipping)\n'));
      return { passed: true };
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const nextVersion = packageJson.dependencies?.next || '';

    // Check if using stable version
    const isCanary = nextVersion.includes('canary') || nextVersion.includes('rc');

    if (isCanary) {
      console.log(chalk.green('✅ Using Next.js canary, all features available\n'));
      return { passed: true };
    }

    // Check next.config for canary-only features
    const configPathTs = join(projectRoot, 'next.config.ts');
    const configPathJs = join(projectRoot, 'next.config.js');
    const configPath = existsSync(configPathTs)
      ? configPathTs
      : existsSync(configPathJs)
      ? configPathJs
      : null;

    if (!configPath) {
      console.log(chalk.green('✅ No Next.js config found (skipping)\n'));
      return { passed: true };
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const detected = CANARY_FEATURES.filter(f => f.pattern.test(configContent));

    if (detected.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${detected.length} canary-only feature(s):\n`));
      detected.forEach(f => console.log(chalk.gray(`   - ${f.name}`)));
      console.log();

      return {
        passed: false,
        issue: `Canary-only Next.js features detected: ${detected.map(f => f.name).join(', ')}`,
        canAutoFix: true,
        errorType: 'nextjs_canary_features',
        manualFix: `Remove experimental features from ${configPath} or upgrade to Next.js canary`,
        autoFix: async () => {
          let fixed = configContent;

          // Remove experimental turbopack features
          fixed = fixed.replace(/turbopackFileSystemCacheForBuild:\s*true,?\s*/g, '');
          fixed = fixed.replace(/turbopackFileSystemCacheForDev:\s*true,?\s*/g, '');

          // Remove cacheComponents
          fixed = fixed.replace(/cacheComponents:\s*true,?\s*/g, '');

          // Clean up empty experimental blocks
          fixed = fixed.replace(/experimental:\s*\{\s*\},?\s*/g, '');

          // Clean up multiple empty lines
          fixed = fixed.replace(/\n\n\n+/g, '\n\n');

          writeFileSync(configPath, fixed);

          console.log(chalk.green('   Removed canary-only features:'));
          detected.forEach(f => console.log(chalk.gray(`   - ${f.name}`)));
        },
      };
    }

    console.log(chalk.green('✅ No canary-only features detected\n'));
    return { passed: true };
  };
}
