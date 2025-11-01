/**
 * Next.js 16+ Turbopack Migration Check
 * Detects custom webpack configs in projects with Next.js 16+ (which uses Turbopack by default)
 *
 * Next.js 16 made Turbopack the default bundler. Projects with custom webpack configs
 * but no turbopack config will encounter build errors. This check helps with migration.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

interface NextJsConfig {
  hasWebpack: boolean;
  hasTurbopack: boolean;
  webpackStartLine?: number;
  turbopackStartLine?: number;
}

/**
 * Parse next.config.ts/js to detect webpack and turbopack configs
 */
function analyzeNextConfig(configContent: string): NextJsConfig {
  // Look for webpack config pattern: webpack: (config) => { ... }
  const webpackMatch = /webpack\s*:\s*\(/;
  // Look for turbopack config pattern: turbopack: { ... }
  const turbopackMatch = /turbopack\s*:\s*{/;

  const hasWebpack = webpackMatch.test(configContent);
  const hasTurbopack = turbopackMatch.test(configContent);

  const result: NextJsConfig = {
    hasWebpack,
    hasTurbopack,
  };

  if (hasWebpack) {
    const lines = configContent.split('\n');
    result.webpackStartLine = lines.findIndex(line => webpackMatch.test(line)) + 1;
  }

  if (hasTurbopack) {
    const lines = configContent.split('\n');
    result.turbopackStartLine = lines.findIndex(line => turbopackMatch.test(line)) + 1;
  }

  return result;
}

/**
 * Check if webpack config has aliases defined
 */
function hasWebpackAliases(configContent: string): boolean {
  // Look for various patterns of alias definitions
  // Supports: config.resolve.alias = { ... }, resolve: { alias: { ... } }, alias: { ... }, etc.
  return /resolve[\.\s\{:]*alias\s*[:=]/m.test(configContent) ||
         /^\s*alias\s*[:=]/m.test(configContent);
}

export function createTurbopackMigrationCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking Next.js Turbopack configuration...'));

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

    // Check package.json for Next.js version
    const packageJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      console.log(chalk.green('✅ No package.json found (skipping)\n'));
      return { passed: true };
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const nextVersion = packageJson.dependencies?.next || '';

    // Only relevant for Next.js 16+
    if (!nextVersion.startsWith('16') && !nextVersion.startsWith('17') && !nextVersion.startsWith('18')) {
      if (!nextVersion.includes('>=16') && !nextVersion.includes('^16')) {
        console.log(chalk.green(`✅ Using Next.js ${nextVersion} (Turbopack not relevant)\n`));
        return { passed: true };
      }
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const config = analyzeNextConfig(configContent);

    if (config.hasWebpack && !config.hasTurbopack) {
      const hasAliases = hasWebpackAliases(configContent);

      console.log(chalk.yellow('⚠️  Turbopack migration needed:\n'));
      console.log(chalk.gray(`   Found custom webpack config at line ${config.webpackStartLine}`));
      console.log(chalk.gray('   Next.js 16+ uses Turbopack by default\n'));

      let migrationGuide = `Add turbopack config to ${configPath}:\n\n`;
      migrationGuide += `  turbopack: {\n`;

      if (hasAliases) {
        migrationGuide += `    resolveAlias: {\n`;
        migrationGuide += `      // Copy alias definitions from webpack config above\n`;
        migrationGuide += `      // '@': './src',\n`;
        migrationGuide += `    },\n`;
      } else {
        migrationGuide += `    // Add Turbopack-specific config here\n`;
      }

      migrationGuide += `  },\n`;

      return {
        passed: false,
        issue: `Custom webpack config detected in Next.js 16+ project without turbopack config`,
        canAutoFix: false,
        errorType: 'turbopack_migration_needed',
        manualFix: migrationGuide,
      };
    }

    if (config.hasTurbopack) {
      console.log(chalk.green('✅ Turbopack config detected\n'));
      return { passed: true };
    }

    console.log(chalk.green('✅ No custom webpack config found\n'));
    return { passed: true };
  };
}
