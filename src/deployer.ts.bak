import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

import {
  ProjectConfig,
  DeploymentStage,
  DeploymentResult,
  HealthCheck,
  DeploymentLock,
} from './types.js';
import { getHealthChecker } from './health/checker.js';
import { getLockManager } from './locks/manager.js';
import { getPreDeploymentChecks } from './safety/pre-deploy.js';
import { getPostDeploymentChecks } from './safety/post-deploy.js';

const execAsync = promisify(exec);

/**
 * Main deployment orchestrator
 *
 * Handles the complete deployment workflow:
 * 1. Pre-deployment safety checks (git, tests, credentials)
 * 2. Building application
 * 3. Deploying via SST or custom script
 * 4. Post-deployment verification (health checks, CloudFront validation)
 * 5. Cache invalidation
 */
export class DeploymentKit {
  private config: ProjectConfig;
  private projectRoot: string;
  private lockManager: ReturnType<typeof getLockManager>;
  private healthChecker: ReturnType<typeof getHealthChecker>;
  private preChecks: ReturnType<typeof getPreDeploymentChecks>;
  private postChecks: ReturnType<typeof getPostDeploymentChecks>;

  constructor(config: ProjectConfig, projectRoot: string = process.cwd()) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.lockManager = getLockManager(projectRoot);
    this.healthChecker = getHealthChecker(config);
    this.preChecks = getPreDeploymentChecks(config);
    this.postChecks = getPostDeploymentChecks(config);
  }

  /**
   * Full deployment workflow
   */
  async deploy(stage: DeploymentStage): Promise<DeploymentResult> {
    const startTime = new Date();
    const result: DeploymentResult = {
      success: false,
      stage,
      startTime,
      endTime: new Date(),
      durationSeconds: 0,
      message: '',
      details: {
        gitStatusOk: false,
        buildsOk: false,
        testsOk: false,
        deploymentOk: false,
        healthChecksOk: false,
      },
    };

    try {
      // Stage 1: Check lock and get previous status
      console.log(chalk.bold.cyan('\n🔐 STAGE 1: Pre-deployment checks...\n'));
      await this.lockManager.checkAndCleanPulumiLock(stage);
      const newLock = await this.lockManager.acquireLock(stage);

      // Stage 2: Safety checks
      console.log(chalk.bold.cyan('🔐 STAGE 2: Safety checks...\n'));
      await this.preChecks.run(stage);
      result.details.gitStatusOk = true;
      result.details.testsOk = true;

      // Stage 3: Build & Deploy
      console.log(chalk.bold.cyan('📦 STAGE 3: Building and deploying...\n'));
      await this.runBuild();
      result.details.buildsOk = true;

      await this.runDeploy(stage);
      result.details.deploymentOk = true;

      // Stage 4: Post-deployment validation
      console.log(chalk.bold.cyan('✅ STAGE 4: Post-deployment validation...\n'));
      await this.postChecks.run(stage);
      result.details.healthChecksOk = true;

      // Stage 5: Cache invalidation (background)
      if (!this.config.stageConfig[stage].skipCacheInvalidation) {
        console.log(chalk.bold.cyan('🔄 STAGE 5: Cache invalidation (background)...\n'));
        await this.invalidateCache(stage);
        result.details.cacheInvalidatedOk = true;
      }

      result.success = true;
      result.message = `✅ Deployment to ${stage} successful!`;

      // Release lock
      await this.lockManager.releaseLock(newLock);

    } catch (error) {
      result.success = false;
      result.message = `❌ Deployment to ${stage} failed`;
      result.error = error instanceof Error ? error.message : String(error);

      // Don't release lock on failure - allows recovery
    }

    result.endTime = new Date();
    result.durationSeconds = Math.round(
      (result.endTime.getTime() - result.startTime.getTime()) / 1000
    );

    return result;
  }

  /**
   * Get deployment status without deploying
   */
  async getStatus(stage: DeploymentStage) {
    console.log(chalk.bold.cyan(`\n📊 Checking deployment status for ${stage}...\n`));
    
    const isPulumiLocked = await this.lockManager.isPulumiLocked(stage);
    const fileLock = await this.lockManager.getFileLock(stage);

    if (isPulumiLocked) {
      console.log(chalk.yellow(`⚠️  Pulumi lock detected for ${stage} (will auto-clear on next deploy)`));
    }

    if (fileLock) {
      const isExpired = new Date() > fileLock.expiresAt;
      if (isExpired) {
        console.log(chalk.yellow(`⚠️  Stale deployment lock for ${stage} (expired, will be cleared)`));
      } else {
        const minutesLeft = Math.round((fileLock.expiresAt.getTime() - new Date().getTime()) / 60000);
        console.log(chalk.red(`❌ Active deployment lock for ${stage} (${minutesLeft} min remaining)`));
      }
    } else {
      console.log(chalk.green(`✅ Ready to deploy to ${stage}`));
    }
  }

  /**
   * Recover from failed deployment
   */
  async recover(stage: DeploymentStage) {
    console.log(chalk.bold.yellow(`\n🔄 Recovering from failed ${stage} deployment...\n`));

    const spinner = ora('Clearing locks...').start();
    try {
      // Clear file lock
      const lock = await this.lockManager.getFileLock(stage);
      if (lock) {
        await this.lockManager.releaseLock(lock);
      }

      // Clear Pulumi lock
      await this.lockManager.clearPulumiLock(stage);

      spinner.succeed('✅ Recovery complete - ready to redeploy');
    } catch (error) {
      spinner.fail(`❌ Recovery failed: ${error}`);
      throw error;
    }
  }

  /**
   * Validate health after deployment
   */
  async validateHealth(stage: DeploymentStage): Promise<boolean> {
    console.log(chalk.bold.cyan(`\nValidating health checks for ${stage}...\n`));

    const checks = this.config.stageConfig[stage].skipHealthChecks
      ? []
      : (this.config.healthChecks || []);

    if (checks.length === 0) {
      console.log(chalk.gray('No health checks configured'));
      return true;
    }

    let allPass = true;
    for (const check of checks) {
      const passed = await this.healthChecker.check(check, stage);
      if (!passed) allPass = false;
    }

    return allPass;
  }

  /**
   * Run build command
   */
  private async runBuild(): Promise<void> {
    const spinner = ora('Building application...').start();

    try {
      if (this.config.hooks?.postBuild) {
        const { stdout } = await execAsync(this.config.hooks.postBuild, {
          cwd: this.projectRoot,
        });
        spinner.info(`Build output: ${stdout}`);
      } else {
        // Default: npm run build
        const { stdout } = await execAsync('npm run build', {
          cwd: this.projectRoot,
        });
      }

      spinner.succeed('✅ Build successful');
    } catch (error) {
      spinner.fail('❌ Build failed');
      throw error;
    }
  }

  /**
   * Run deployment command
   */
  private async runDeploy(stage: DeploymentStage): Promise<void> {
    const spinner = ora(`Deploying to ${stage}...`).start();

    try {
      const stageConfig = this.config.stageConfig[stage];
      const sstStage = stageConfig.sstStageName || stage;

      if (this.config.customDeployScript) {
        // Use custom deployment script
        await execAsync(`bash ${this.config.customDeployScript} ${stage}`, {
          cwd: this.projectRoot,
        });
      } else {
        // Default: SST deploy
        const env = {
          ...process.env,
          ...(this.config.awsProfile && {
            AWS_PROFILE: this.config.awsProfile,
          }),
        };

        await execAsync(`npx sst deploy --stage ${sstStage}`, {
          cwd: this.projectRoot,
          env,
        });
      }

      spinner.succeed(`✅ Deployed to ${stage}`);
    } catch (error) {
      spinner.fail(`❌ Deployment to ${stage} failed`);
      throw error;
    }
  }

  /**
   * Invalidate CloudFront cache
   */
  private async invalidateCache(stage: DeploymentStage): Promise<void> {
    const spinner = ora('Invalidating CloudFront cache...').start();

    try {
      // Get distribution ID from deployment output or env
      const distId = process.env[`CLOUDFRONT_DIST_ID_${stage.toUpperCase()}`];

      if (!distId) {
        spinner.warn('CloudFront distribution ID not found - skipping cache invalidation');
        return;
      }

      const { stdout } = await execAsync(
        `aws cloudfront create-invalidation --distribution-id ${distId} --paths "/*"`,
        {
          env: {
            ...process.env,
            ...(this.config.awsProfile && {
              AWS_PROFILE: this.config.awsProfile,
            }),
          },
        }
      );

      spinner.succeed('✅ Cache invalidation started');
    } catch (error) {
      spinner.warn('⚠️  CloudFront cache invalidation failed (not critical)');
    }
  }
}
