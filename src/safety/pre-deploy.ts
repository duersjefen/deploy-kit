import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';
import { ensureCertificateExists } from '../certificates/manager.js';

const execAsync = promisify(exec);

/**
 * Pre-deployment safety checks
 * Ensures the project is ready for deployment
 */
export function getPreDeploymentChecks(config: ProjectConfig, projectRoot: string = process.cwd()) {
  /**
   * Check git status is clean
   */
  async function checkGitStatus(): Promise<void> {
    const spinner = ora('Checking git status...').start();

    try {
      if (config.requireCleanGit === false) {
        spinner.succeed('✅ Git check skipped (requireCleanGit: false)');
        return;
      }

      const { stdout: status } = await execAsync('git status --short', {
        cwd: projectRoot,
      });

      if (status.trim()) {
        spinner.fail('❌ Uncommitted changes found');
        console.log(chalk.red('\nUncommitted changes:'));
        console.log(status);
        throw new Error('Commit all changes before deploying');
      }

      spinner.succeed('✅ Git status clean');
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
      spinner.succeed(`✅ AWS credentials valid (Account: ${identity.Account})`);
    } catch (error) {
      spinner.fail('❌ AWS credentials not found or invalid');
      throw error;
    }
  }

  /**
   * Run tests if configured
   */
  async function runTests(): Promise<void> {
    if (config.runTestsBeforeDeploy === false) {
      console.log(chalk.gray('ℹ️  Tests skipped (runTestsBeforeDeploy: false)'));
      return;
    }

    const spinner = ora('Running tests...').start();

    try {
      const { stdout } = await execAsync('npm test 2>&1', {
        cwd: projectRoot,
      });

      spinner.succeed('✅ Tests passed');
    } catch (error) {
      spinner.fail('❌ Tests failed');
      throw error;
    }
  }

  /**
   * Ensure SSL certificate exists and is configured
   */
  async function checkSslCertificate(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  SSL certificate check skipped (non-SST infrastructure)'));
      return;
    }

    try {
      const domain = config.stageConfig?.[stage]?.domain || config.mainDomain;
      if (!domain) {
        console.log(chalk.gray('ℹ️  SSL certificate check skipped (no domain configured)'));
        return;
      }

      const spinner = ora(`Checking SSL certificate for ${domain}...`).start();

      try {
        const arn = await ensureCertificateExists(domain, stage, projectRoot, config.awsProfile);
        spinner.succeed(`✅ SSL certificate ready: ${arn.split('/').pop()}`);
      } catch (certError) {
        spinner.fail('❌ SSL certificate check failed');
        throw certError;
      }
    } catch (error) {
      // If certificate setup fails, warn but don't block deployment
      console.log(chalk.yellow(`⚠️  SSL certificate check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.yellow('   You may need to set up the certificate manually.'));
    }
  }

  /**
   * Run all pre-deployment checks
   */
  async function run(stage: DeploymentStage): Promise<void> {
    console.log(chalk.bold(`\n🔐 Pre-deployment checks for ${stage}:\n`));

    try {
      await checkGitStatus();
      await checkAwsCredentials();

      if (config.runTestsBeforeDeploy !== false) {
        await runTests();
      }

      await checkSslCertificate(stage);

      console.log(chalk.green(`\n✅ All pre-deployment checks passed!\n`));
    } catch (error) {
      console.log(chalk.red(`\n❌ Pre-deployment checks failed!\n`));
      throw error;
    }
  }

  return { checkGitStatus, checkAwsCredentials, runTests, checkSslCertificate, run };
}
