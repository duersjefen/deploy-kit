/**
 * Deploy-Kit Doctor Command  
 * Comprehensive system health check for deployments
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { validateConfig, type UnvalidatedConfig } from '../utils/config-validator.js';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';

interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export async function handleDoctorCommand(projectRoot: string = process.cwd()): Promise<void> {
  const checks: DoctorCheck[] = [];

  console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
  console.log(chalk.bold.cyan('🔧 Deploy-Kit Doctor: Pre-Deployment Diagnostic'));
  console.log(chalk.bold.cyan('═'.repeat(70)) + '\n');

  // Check 1: Config
  let configPath = join(projectRoot, '.deploy-config.json');
  let config: UnvalidatedConfig | null = null;

  const configSpinner = ora('Checking configuration...').start();
  try {
    if (!existsSync(configPath)) {
      configSpinner.fail('Configuration file not found');
      checks.push({
        name: 'Configuration File',
        status: 'fail',
        message: '.deploy-config.json not found in current directory',
      });
    } else {
      const content = readFileSync(configPath, 'utf-8');
      config = JSON.parse(content) as UnvalidatedConfig;

      const validation = validateConfig(config);
      if (validation.valid) {
        configSpinner.succeed('Configuration valid');
        checks.push({
          name: 'Configuration File',
          status: 'pass',
          message: `Valid (` + (config as UnvalidatedConfig).stages?.length + ` stages)`,
        });
      } else {
        configSpinner.warn('Configuration has errors');
        checks.push({
          name: 'Configuration File',
          status: 'fail',
          message: `Errors: ` + validation.errors.join(', '),
        });
      }
    }
  } catch (error) {
    configSpinner.fail('Failed to read configuration');
    checks.push({
      name: 'Configuration File',
      status: 'fail',
      message: `Error: ` + (error as any).message,
    });
  }

  if (!config) {
    printDoctorResults(checks);
    process.exit(1);
  }

  // Check 2: Git
  const gitSpinner = ora('Checking git status...').start();
  try {
    const status = execSync('git status --porcelain', { 
      cwd: projectRoot, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    if (config.requireCleanGit && status.length > 0) {
      gitSpinner.warn('Git repository has uncommitted changes');
      checks.push({
        name: 'Git Status',
        status: 'warn',
        message: 'Uncommitted changes detected',
      });
    } else if (status.length === 0) {
      gitSpinner.succeed('Git repository clean');
      checks.push({
        name: 'Git Status',
        status: 'pass',
        message: 'No uncommitted changes',
      });
    } else {
      gitSpinner.succeed('Git repository (with uncommitted changes)');
      checks.push({
        name: 'Git Status',
        status: 'pass',
        message: 'Has uncommitted changes (allowed)',
      });
    }
  } catch (error) {
    gitSpinner.warn('Could not check git status');
    checks.push({
      name: 'Git Status',
      status: 'warn',
      message: 'Could not verify git status',
    });
  }

  // Check 3: AWS & Profile
  const awsSpinner = ora('Checking AWS credentials...').start();
  try {
    const result = execSync('aws sts get-caller-identity --output json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const identity = JSON.parse(result);
    
    // Check if profile is auto-detected for SST projects
    const resolvedProfile = resolveAwsProfile(config as any, projectRoot);
    const profileInfo = resolvedProfile 
      ? `(auto-detected from sst.config.ts) - Account: ${identity.Account}`
      : `Account: ${identity.Account}`;
    
    awsSpinner.succeed('AWS credentials configured');
    checks.push({
      name: 'AWS Credentials & Profile',
      status: 'pass',
      message: profileInfo,
    });
  } catch (error) {
    awsSpinner.fail('AWS credentials not configured');
    checks.push({
      name: 'AWS Credentials & Profile',
      status: 'fail',
      message: 'Run: aws configure',
    });
  }

  // Check 4: SST config
  if (config.infrastructure === 'sst-serverless') {
    const sstSpinner = ora('Checking SST configuration...').start();
    const sstConfigPath = join(projectRoot, 'sst.config.ts');
    if (existsSync(sstConfigPath)) {
      sstSpinner.succeed('SST configuration found');
      checks.push({
        name: 'SST Configuration',
        status: 'pass',
        message: 'sst.config.ts exists',
      });
    } else {
      sstSpinner.fail('SST configuration not found');
      checks.push({
        name: 'SST Configuration',
        status: 'fail',
        message: 'sst.config.ts not found',
      });
    }
  }

  // Check 5: Node/npm
  const nodeSpinner = ora('Checking Node.js environment...').start();
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    nodeSpinner.succeed('Node.js environment configured');
    checks.push({
      name: 'Node.js',
      status: 'pass',
      message: 'Node ' + nodeVersion + ', npm ' + npmVersion,
    });
  } catch (error) {
    nodeSpinner.fail('Node.js not configured');
    checks.push({
      name: 'Node.js',
      status: 'fail',
      message: 'Node.js or npm not found',
    });
  }

  // Check 6: Tests
  if (config.runTestsBeforeDeploy) {
    const testSpinner = ora('Checking test configuration...').start();
    const packagePath = join(projectRoot, 'package.json');
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      if (packageJson.scripts && packageJson.scripts.test) {
        testSpinner.succeed('Test script configured');
        checks.push({
          name: 'Tests',
          status: 'pass',
          message: 'Test script exists',
        });
      } else {
        testSpinner.warn('Test script not found');
        checks.push({
          name: 'Tests',
          status: 'warn',
          message: 'runTestsBeforeDeploy is true but no test script',
        });
      }
    } catch (error) {
      testSpinner.fail('Could not check tests');
      checks.push({
        name: 'Tests',
        status: 'fail',
        message: 'Could not read package.json',
      });
    }
  } else {
    checks.push({
      name: 'Tests',
      status: 'pass',
      message: 'Tests optional (runTestsBeforeDeploy: false)',
    });
  }

  printDoctorResults(checks);
  const hasFailures = checks.some(c => c.status === 'fail');
  process.exit(hasFailures ? 1 : 0);
}

function printDoctorResults(checks: DoctorCheck[]): void {
  console.log('\n' + chalk.bold('Diagnostic Results:\n'));

  for (const check of checks) {
    const icon = check.status === 'pass' ? chalk.green('✅') : 
                 check.status === 'warn' ? chalk.yellow('⚠️ ') :
                 chalk.red('❌');
    
    const nameWidth = 25;
    const paddedName = check.name.padEnd(nameWidth);
    console.log(icon + ' ' + paddedName + ' ' + check.message);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
  console.log(chalk.bold('Summary:'));
  console.log('  ' + chalk.green('✅ Passed') + ': ' + passed + '  ' + chalk.yellow('⚠️  Warnings') + ': ' + warned + '  ' + chalk.red('❌ Failed') + ': ' + failed);
  console.log(chalk.bold.cyan('═'.repeat(70)));

  if (failed > 0) {
    console.log(chalk.red('\n❌ ' + failed + ' issue(s) found. Fix these before deploying.\n'));
  } else if (warned > 0) {
    console.log(chalk.yellow('\n⚠️  ' + warned + ' warning(s) found. Review these before deploying.\n'));
  } else {
    console.log(chalk.green('\n✅ All checks passed! Ready to deploy.\n'));
  }
}
