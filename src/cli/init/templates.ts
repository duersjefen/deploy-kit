/**
 * Configuration file generation (deploy-config, package.json, Makefile)
 */

import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ProjectConfig } from '../../types.js';
import { detectPackageManager, getPackageManagerExamples } from '../../utils/package-manager.js';

export interface InitAnswers {
  projectName: string;
  mainDomain: string;
  awsProfile?: string;
  stagingDomain: string;
  productionDomain: string;
  awsRegion: string;
  runTests: boolean;
}

/**
 * Generate .deploy-config.json content
 */
export function generateDeployConfig(answers: InitAnswers): string {
  return JSON.stringify(
    {
      projectName: answers.projectName,
      displayName: answers.projectName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      infrastructure: 'sst-serverless',
      database: 'dynamodb',
      stages: ['staging', 'production'],
      mainDomain: answers.mainDomain,
      awsProfile: answers.awsProfile,
      requireCleanGit: true,
      runTestsBeforeDeploy: answers.runTests,
      stageConfig: {
        staging: {
          domain: answers.stagingDomain,
          requiresConfirmation: false,
          awsRegion: answers.awsRegion,
        },
        production: {
          domain: answers.productionDomain,
          requiresConfirmation: true,
          awsRegion: answers.awsRegion,
        },
      },
      healthChecks: [
        {
          url: '/',
          expectedStatus: 200,
          timeout: 5000,
          name: 'Homepage',
        },
        {
          url: '/api/health',
          expectedStatus: 200,
          timeout: 5000,
          name: 'Health endpoint',
        },
      ],
      hooks: {
        preDeploy: answers.runTests ? 'npm test' : '',
        postBuild: 'npm run build',
      },
    },
    null,
    2
  );
}

/**
 * Create .deploy-config.json
 */
export function createDeployConfig(answers: InitAnswers, projectRoot: string, mergedConfig?: ProjectConfig | null): void {
  const spinner = ora('Creating .deploy-config.json...').start();

  try {
    const configPath = join(projectRoot, '.deploy-config.json');
    let content: string;

    if (mergedConfig) {
      content = JSON.stringify(mergedConfig, null, 2);
    } else {
      content = generateDeployConfig(answers);
    }

    writeFileSync(configPath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Created .deploy-config.json'));
  } catch (error) {
    spinner.fail('Failed to create .deploy-config.json');
    throw error;
  }
}

/**
 * Detect if running in a Conductor workspace
 *
 * Conductor (Claude Code app for Mac) uses a .conductor/ directory structure
 * with git worktrees. This function detects that environment.
 *
 * @param projectRoot - Project root directory
 * @returns true if in Conductor workspace, false otherwise
 */
function isConductorWorkspace(projectRoot: string): boolean {
  // Check if current path contains .conductor/
  if (projectRoot.includes('/.conductor/')) {
    return true;
  }

  // Check if .conductor directory exists in parent paths
  const parts = projectRoot.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const testPath = parts.slice(0, i + 1).join('/') + '/.conductor';
    if (existsSync(testPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Update package.json with deploy scripts
 *
 * Adds standard deploy-kit scripts. When running in Conductor workspace,
 * also adds setup/run scripts for Conductor integration.
 */
export function updatePackageJson(projectRoot: string): void {
  const spinner = ora('Updating package.json...').start();

  try {
    const packagePath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // Standard deploy-kit scripts
    packageJson.scripts['deploy:staging'] = 'npx @duersjefen/deploy-kit deploy staging';
    packageJson.scripts['deploy:prod'] = 'npx @duersjefen/deploy-kit deploy production';
    packageJson.scripts['deployment-status'] = 'npx @duersjefen/deploy-kit status';
    packageJson.scripts['recover:staging'] = 'npx @duersjefen/deploy-kit recover staging';
    packageJson.scripts['recover:prod'] = 'npx @duersjefen/deploy-kit recover production';
    packageJson.scripts['validate:config'] = 'npx @duersjefen/deploy-kit validate';
    packageJson.scripts['doctor'] = 'npx @duersjefen/deploy-kit doctor';

    // Add Conductor-specific scripts if in Conductor workspace
    if (isConductorWorkspace(projectRoot)) {
      const packageManager = detectPackageManager(projectRoot);

      packageJson.scripts['setup'] = packageManager.installCommand;
      packageJson.scripts['run'] = 'npx @duersjefen/deploy-kit dev';

      spinner.text = 'Updating package.json (Conductor workspace detected)...';
    }

    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');

    if (isConductorWorkspace(projectRoot)) {
      spinner.succeed(chalk.green('✅ Updated package.json with deploy scripts + Conductor integration'));
    } else {
      spinner.succeed(chalk.green('✅ Updated package.json with deploy scripts'));
    }
  } catch (error) {
    spinner.fail('Failed to update package.json');
    throw error;
  }
}

/**
 * Generate sst.config.ts content
 */
export function generateSstConfig(answers: InitAnswers): string {
  return `/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "${answers.projectName}",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",${answers.awsProfile ? `
      providers: {
        aws: {
          region: "${answers.awsRegion}",
          profile: "${answers.awsProfile}"
        }
      }` : `
      providers: {
        aws: {
          region: "${answers.awsRegion}"
        }
      }`}
    };
  },
  async run() {
    const stage = $app.stage;

    // Stage-specific domain configuration
    const domain = stage === "production"
      ? "${answers.productionDomain}"
      : stage === "staging"
        ? "${answers.stagingDomain}"
        : undefined;

    // Example Next.js site
    // const site = new sst.aws.Nextjs("${answers.projectName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Site", {
    //   domain: domain ? { name: domain } : undefined,
    // });

    return {
      // site: site.url,
    };
  },
});
`;
}

/**
 * Create sst.config.ts if it doesn't exist
 */
export function createSstConfig(answers: InitAnswers, projectRoot: string): void {
  const configPath = join(projectRoot, 'sst.config.ts');

  // Skip if file already exists
  if (existsSync(configPath)) {
    console.log(chalk.cyan('ℹ️  sst.config.ts already exists, skipping generation'));
    return;
  }

  const spinner = ora('Creating sst.config.ts...').start();

  try {
    const content = generateSstConfig(answers);
    writeFileSync(configPath, content, 'utf-8');
    spinner.succeed(chalk.green('✅ Created sst.config.ts'));
  } catch (error) {
    spinner.fail('Failed to create sst.config.ts');
    throw error;
  }
}

// Makefile generation removed - users should use `dk` commands directly
