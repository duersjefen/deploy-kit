/**
 * Quality tools setup (Husky, lint-staged, tsc-files)
 */

import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Create .lintstagedrc.js configuration file
 */
export function createLintStagedConfig(projectRoot: string): void {
  const spinner = ora('Creating .lintstagedrc.js...').start();

  try {
    const configPath = join(projectRoot, '.lintstagedrc.js');
    const content = `export default {
  '*.{ts,tsx}': ['eslint --fix', 'tsc-files --noEmit'],
};
`;

    writeFileSync(configPath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Created .lintstagedrc.js'));
  } catch (error) {
    spinner.fail('Failed to create .lintstagedrc.js');
    throw error;
  }
}

/**
 * Create .husky/pre-commit hook
 */
export function createHuskyPreCommitHook(projectRoot: string): void {
  const spinner = ora('Configuring Husky pre-commit hook...').start();

  try {
    const huskyDir = join(projectRoot, '.husky');
    const hookPath = join(huskyDir, 'pre-commit');

    // Create .husky directory if it doesn't exist
    if (!existsSync(huskyDir)) {
      mkdirSync(huskyDir, { recursive: true });
    }

    const content = `#!/usr/bin/env sh
npx lint-staged --config .lintstagedrc.js
`;

    writeFileSync(hookPath, content, 'utf-8');
    // Make hook executable
    chmodSync(hookPath, 0o755);
    spinner.succeed(chalk.green('✅ Configured Husky pre-commit hook'));
  } catch (error) {
    spinner.fail('Failed to configure Husky pre-commit hook');
    throw error;
  }
}

/**
 * Update .gitignore with SST-specific entries
 */
export function updateGitIgnore(projectRoot: string): void {
  const spinner = ora('Updating .gitignore...').start();

  try {
    const { readFileSync } = require('fs');
    const gitignorePath = join(projectRoot, '.gitignore');
    let content = '';

    // Read existing .gitignore if it exists
    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, 'utf-8');
    }

    // Check if SST entries already exist
    const sstComment = '# sst';
    if (!content.includes(sstComment)) {
      // Add SST-specific ignores
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
      content += `\n${sstComment}\n.sst/\nsst-env.d.ts\n`;
    }

    writeFileSync(gitignorePath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Updated .gitignore with SST entries'));
  } catch (error) {
    spinner.fail('Failed to update .gitignore');
    throw error;
  }
}

/**
 * Install quality tools dependencies
 */
export async function installQualityTools(projectRoot: string): Promise<void> {
  const spinner = ora('Installing quality tools...').start();

  try {
    // Install husky, lint-staged, and tsc-files as dev dependencies
    spinner.text = 'Installing husky, lint-staged, tsc-files...';
    execSync('npm install -D husky lint-staged tsc-files', {
      cwd: projectRoot,
      stdio: 'pipe',
    });

    // Initialize Husky
    spinner.text = 'Initializing Husky...';
    execSync('npx husky init', {
      cwd: projectRoot,
      stdio: 'pipe',
    });

    spinner.succeed(chalk.green('✅ Installed quality tools'));
  } catch (error) {
    spinner.fail('Failed to install quality tools');
    throw error;
  }
}

/**
 * Add prepare script to package.json for Husky
 */
export function addPrepareScript(projectRoot: string): void {
  const spinner = ora('Adding prepare script to package.json...').start();

  try {
    const { readFileSync } = require('fs');
    const packagePath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // Only add if not already present
    if (!packageJson.scripts.prepare) {
      packageJson.scripts.prepare = 'husky';
    }

    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    spinner.succeed(chalk.green('✅ Added prepare script to package.json'));
  } catch (error) {
    spinner.fail('Failed to add prepare script');
    throw error;
  }
}
