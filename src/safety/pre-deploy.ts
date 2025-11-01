import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig, DeploymentStage } from '../types.js';
import { ensureCertificateExists } from '../certificates/manager.js';
import {
  findReservedVarsInSstConfig,
  formatReservedVarError,
} from '../lib/lambda-reserved-vars.js';

const execAsync = promisify(exec);

/**
 * Pre-deployment safety checks
 * Ensures the project is ready for deployment
 */
export function getPreDeploymentChecks(config: ProjectConfig, projectRoot: string = process.cwd()) {
  // Track check results for summary
  const checks: Array<{
    name: string;
    status: 'success' | 'warning' | 'failed';
    message: string;
  }> = [];

  let checkCount = 0;
  const totalChecks = config.requireCleanGit !== false ? 1 : 0 + 1 + (config.runTestsBeforeDeploy !== false ? 1 : 0) + 1;

  /**
   * Check git status is clean
   */
  async function checkGitStatus(): Promise<void> {
    const spinner = ora('Checking git status...').start();
    const startTime = Date.now();

    try {
      if (config.requireCleanGit === false) {
        spinner.succeed('✅ Git check skipped');
        checks.push({ name: 'Git Status', status: 'warning', message: 'Skipped (requireCleanGit: false)' });
        return;
      }

      const { stdout: status } = await execAsync('git status --short', {
        cwd: projectRoot,
      });

      if (status.trim()) {
        spinner.fail('❌ Uncommitted changes found');
        console.log(chalk.red('\nUncommitted changes:'));
        console.log(status);
        checks.push({ name: 'Git Status', status: 'failed', message: 'Uncommitted changes found' });
        throw new Error('Commit all changes before deploying');
      }

      checkCount++;
      spinner.succeed(`✅ Git status clean (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ name: 'Git Status', status: 'success', message: 'Clean working directory' });
    } catch (error) {
      spinner.fail(`❌ Git check failed`);
      throw error;
    }
  }

  /**
   * Check AWS credentials
   */
  async function checkAwsCredentials(): Promise<void> {
    const spinner = ora('Checking AWS credentials...').start();
    const startTime = Date.now();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      const { stdout } = await execAsync('aws sts get-caller-identity', {
        env,
      });

      const identity = JSON.parse(stdout);
      checkCount++;
      spinner.succeed(`✅ AWS credentials valid (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ 
        name: 'AWS Credentials', 
        status: 'success', 
        message: `Account: ${identity.Account}` 
      });
    } catch (error) {
      spinner.fail('❌ AWS credentials not found or invalid');
      checks.push({ name: 'AWS Credentials', status: 'failed', message: 'Authentication failed' });
      throw error;
    }
  }

  /**\n * Run tests if configured\n   */
  async function runTests(): Promise<void> {
    if (config.runTestsBeforeDeploy === false) {
      console.log(chalk.gray('ℹ️  Tests skipped (runTestsBeforeDeploy: false)'));
      checks.push({ name: 'Tests', status: 'warning', message: 'Skipped by configuration' });
      return;
    }

    const spinner = ora('Running tests...').start();
    const startTime = Date.now();

    try {
      const { stdout } = await execAsync('npm test 2>&1', {
        cwd: projectRoot,
      });

      checkCount++;
      spinner.succeed(`✅ Tests passed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ name: 'Tests', status: 'success', message: 'All tests passing' });
    } catch (error) {
      spinner.fail('❌ Tests failed');
      checks.push({ name: 'Tests', status: 'failed', message: 'Test suite failed' });
      throw error;
    }
  }

  /**
   * Check for reserved Lambda environment variables in SST config
   */
  async function checkLambdaReservedVars(): Promise<void> {
    const spinner = ora('Checking for reserved Lambda environment variables...').start();
    const startTime = Date.now();

    try {
      // Look for sst.config.ts or sst.config.js
      const configPaths = [
        join(projectRoot, 'sst.config.ts'),
        join(projectRoot, 'sst.config.js'),
      ];

      let configPath: string | null = null;
      let configContent: string | null = null;

      for (const path of configPaths) {
        if (existsSync(path)) {
          configPath = path;
          try {
            configContent = readFileSync(path, 'utf-8');
            break;
          } catch (error) {
            // Skip if cannot read
          }
        }
      }

      if (!configPath || !configContent) {
        spinner.succeed('✅ Reserved vars check skipped (no SST config found)');
        checks.push({ name: 'Lambda Reserved Vars', status: 'warning', message: 'No SST config found' });
        return;
      }

      // Find reserved variables in the config
      const violations = findReservedVarsInSstConfig(configContent);

      if (violations.length === 0) {
        checkCount++;
        spinner.succeed(`✅ No reserved Lambda variables detected (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        checks.push({ name: 'Lambda Reserved Vars', status: 'success', message: 'No violations' });
        return;
      }

      // Found reserved variables - fail check
      spinner.fail('❌ Reserved Lambda environment variables detected');
      console.log('\n' + chalk.red(formatReservedVarError(violations)) + '\n');
      checks.push({
        name: 'Lambda Reserved Vars',
        status: 'failed',
        message: `${violations.length} reserved variable(s) detected`
      });
      throw new Error('Reserved Lambda environment variables detected in SST config');
    } catch (error) {
      if ((error as Error).message.includes('Reserved Lambda')) {
        throw error; // Re-throw our error
      }
      // Other errors - warn but don't block
      spinner.warn('⚠️  Could not check for reserved Lambda variables');
      checks.push({ name: 'Lambda Reserved Vars', status: 'warning', message: 'Check failed' });
    }
  }

  /**
   * Ensure SSL certificate exists and is configured
   */
  async function checkSslCertificate(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  SSL certificate check skipped (non-SST infrastructure)'));
      checks.push({ name: 'SSL Certificate', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    try {
      const domain = config.stageConfig?.[stage]?.domain || config.mainDomain;
      if (!domain) {
        console.log(chalk.gray('ℹ️  SSL certificate check skipped (no domain configured)'));
        checks.push({ name: 'SSL Certificate', status: 'warning', message: 'Skipped (no domain)' });
        return;
      }

      const spinner = ora(`Checking SSL certificate for ${domain}...`).start();
      const startTime = Date.now();

      try {
        const arn = await ensureCertificateExists(domain, stage, projectRoot, config.awsProfile);
        checkCount++;
        const certId = arn.split('/').pop();
        spinner.succeed(`✅ SSL certificate ready (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        checks.push({ name: 'SSL Certificate', status: 'success', message: `Ready: ${certId}` });
      } catch (certError) {
        spinner.fail('❌ SSL certificate check failed');
        checks.push({ name: 'SSL Certificate', status: 'failed', message: 'Certificate setup failed' });
        throw certError;
      }
    } catch (error) {
      // If certificate setup fails, warn but don't block deployment
      console.log(chalk.yellow(`⚠️  SSL certificate check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.yellow('   You may need to set up the certificate manually.'));
      checks.push({ 
        name: 'SSL Certificate', 
        status: 'warning', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Print check summary
   */
  function printSummary(): void {
    const successCount = checks.filter(c => c.status === 'success').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const failedCount = checks.filter(c => c.status === 'failed').length;

    console.log(chalk.bold('\n' + '═'.repeat(50)));
    console.log(chalk.bold('📋 Pre-Deployment Check Summary'));
    console.log(chalk.bold('═'.repeat(50)) + '\n');

    for (const check of checks) {
      const icon = check.status === 'success' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
      const color = check.status === 'success' ? chalk.green : check.status === 'warning' ? chalk.yellow : chalk.red;
      console.log(`${icon} ${color(check.name.padEnd(20))} ${check.message}`);
    }

    console.log('\n' + chalk.bold('─'.repeat(50)));
    console.log(`  ${chalk.green(`✅ Passed: ${successCount}`)} | ${chalk.yellow(`⚠️  Warnings: ${warningCount}`)} | ${chalk.red(`❌ Failed: ${failedCount}`)}`);
    console.log(chalk.bold('─'.repeat(50)) + '\n');
  }

  /**
   * Run all pre-deployment checks
   */
  async function run(stage: DeploymentStage): Promise<void> {
    console.log(chalk.bold(`\n🔐 Pre-Deployment Checks (${stage})\n`));
    console.log(chalk.bold('Starting safety validation...') + '\n');

    try {
      await checkGitStatus();
      await checkAwsCredentials();
      await checkLambdaReservedVars();

      if (config.runTestsBeforeDeploy !== false) {
        await runTests();
      }

      await checkSslCertificate(stage);

      printSummary();
      console.log(chalk.green(`✨ All pre-deployment checks passed!\n`));
    } catch (error) {
      printSummary();
      console.log(chalk.red(`\n❌ Pre-deployment checks failed!\n`));
      throw error;
    }
  }

  return { checkGitStatus, checkAwsCredentials, runTests, checkLambdaReservedVars, checkSslCertificate, run };
}
