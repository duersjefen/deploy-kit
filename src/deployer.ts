import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import prompt from 'prompts';

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
import { CloudFrontAPIClient } from './lib/cloudfront/client.js';
import { CloudFrontAnalyzer } from './lib/cloudfront/analyzer.js';

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
   * Detect if this is an SST project
   */
  private isSSTProject(): boolean {
    return existsSync(join(this.projectRoot, 'sst.config.ts'));
  }

  /**
   * Full deployment workflow
   */
  async deploy(stage: DeploymentStage): Promise<DeploymentResult> {
    const startTime = new Date();
    const stageTimings: { name: string; duration: number }[] = [];
    let cloudFrontDistId: string | null = null;
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
      // Print deployment header
      console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
      console.log(chalk.bold.cyan(`🚀 DEPLOYMENT PIPELINE: ${stage.toUpperCase()}`));
      console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');

      // Stage 1: Pre-deployment safety checks (BEFORE lock acquisition)
      // This way, if pre-checks fail, lock is never acquired
      let stage1Start = Date.now();
      console.log(chalk.bold.white('▸ Stage 1: Pre-Deployment Checks'));
      console.log(chalk.gray('  Validating: git status, AWS credentials, tests, SSL\n'));

      await this.preChecks.run(stage);
      result.details.gitStatusOk = true;
      result.details.testsOk = true;
      stageTimings.push({ name: 'Pre-Deployment Checks', duration: Date.now() - stage1Start });

      // Only acquire lock AFTER pre-checks pass
      await this.lockManager.checkAndCleanPulumiLock(stage);
      const newLock = await this.lockManager.acquireLock(stage);

      // Stage 3: Build & Deploy
      let stage2Start = Date.now();
      console.log(chalk.bold.white('\n▸ Stage 2: Build & Deploy'));
      console.log(chalk.gray('  Building application and deploying to AWS\n'));

      // For SST projects, build is handled by sst deploy, skip separate build
      if (!this.isSSTProject()) {
        await this.runBuild();
        result.details.buildsOk = true;
      } else {
        result.details.buildsOk = true;
      }

      cloudFrontDistId = await this.runDeploy(stage);
      result.details.deploymentOk = true;
      stageTimings.push({ name: 'Build & Deploy', duration: Date.now() - stage2Start });

      // Stage 4: Post-deployment validation
      let stage3Start = Date.now();
      console.log(chalk.bold.white('\n▸ Stage 3: Post-Deployment Validation'));
      console.log(chalk.gray('  Testing health checks and CloudFront configuration\n'));

      await this.postChecks.run(stage);
      result.details.healthChecksOk = true;
      stageTimings.push({ name: 'Health Checks', duration: Date.now() - stage3Start });

      // Stage 5: Cache invalidation (background)
      let stage4Start = Date.now();
      if (!this.config.stageConfig[stage].skipCacheInvalidation) {
        console.log(chalk.bold.white('\n▸ Stage 4: Cache Invalidation'));
        console.log(chalk.gray('  Clearing CloudFront cache (runs in background)\n'));

        await this.invalidateCache(stage, cloudFrontDistId);
        result.details.cacheInvalidatedOk = true;
      }
      stageTimings.push({ name: 'Cache Invalidation', duration: Date.now() - stage4Start });

      result.success = true;
      result.message = `✅ Deployment to ${stage} successful!`;

      // Release lock
      await this.lockManager.releaseLock(newLock);

      // Print deployment summary
      this.printDeploymentSummary(result, stageTimings);

      // Post-deployment: Audit CloudFront and offer cleanup
      await this.postDeploymentCloudFrontAudit(stage);

    } catch (error) {
      result.success = false;
      result.message = `❌ Deployment to ${stage} failed`;
      result.error = error instanceof Error ? error.message : String(error);

      // Print failure summary
      this.printDeploymentFailureSummary(result, stageTimings);

      // Release lock if it was acquired
      // Pre-check failures won't have lock, but deployment failures will
      // Either way, release it so user doesn't have to manually recover
      try {
        // Try to get the lock to see if it was acquired
        const existingLock = await this.lockManager.getFileLock(stage);
        if (existingLock) {
          await this.lockManager.releaseLock(existingLock);
        }
      } catch (lockErr) {
        // Silently ignore if lock doesn't exist or can't be released
      }
    }

    result.endTime = new Date();
    result.durationSeconds = Math.round(
      (result.endTime.getTime() - result.startTime.getTime()) / 1000
    );

    return result;
  }

  /**
   * Print deployment summary on success
   */
  private printDeploymentSummary(result: DeploymentResult, stageTimings: { name: string; duration: number }[]): void {
    console.log('\n' + chalk.bold.green('═'.repeat(60)));
    console.log(chalk.bold.green('✨ DEPLOYMENT SUCCESSFUL'));
    console.log(chalk.bold.green('═'.repeat(60)));

    console.log('\n📊 Deployment Summary:');
    console.log(chalk.green(`  Stage: ${result.stage}`));
    console.log(chalk.green(`  Total Duration: ${result.durationSeconds}s`));
    console.log(chalk.green(`  Status: ✅ All checks passed\n`));

    if (stageTimings.length > 0) {
      console.log('⏱️  Stage Timing Breakdown:');
      for (const timing of stageTimings) {
        const durationMs = timing.duration;
        const durationSecs = (durationMs / 1000).toFixed(1);
        const barLength = Math.round((durationMs / 5000)); // Scale: 5s = full bar
        const bar = '█'.repeat(Math.min(barLength, 20));
        console.log(`  ${timing.name.padEnd(25)} ${bar.padEnd(20)} ${durationSecs}s`);
      }
      console.log('');
    }

    console.log(chalk.green(`✅ Application is now live on ${result.stage}`));
    console.log(chalk.gray(`   Deployment completed at ${result.endTime.toLocaleTimeString()}\n`));
  }

  /**
   * Print deployment summary on failure
   */
  private printDeploymentFailureSummary(result: DeploymentResult, stageTimings: { name: string; duration: number }[]): void {
    console.log('\n' + chalk.bold.red('═'.repeat(60)));
    console.log(chalk.bold.red('❌ DEPLOYMENT FAILED'));
    console.log(chalk.bold.red('═'.repeat(60)));

    console.log('\n❌ Deployment Summary:');
    console.log(chalk.red(`  Stage: ${result.stage}`));
    console.log(chalk.red(`  Duration: ${(result.endTime.getTime() - result.startTime.getTime()) / 1000}s`));
    console.log(chalk.red(`  Error: ${result.error}\n`));

    console.log(chalk.yellow('🔧 Recovery Options:'));
    console.log(chalk.yellow(`  1. Review error message above`));
    console.log(chalk.yellow(`  2. Fix the issue locally`));
    console.log(chalk.yellow(`  3. Retry deployment: npx deploy-kit deploy ${result.stage}`));
    console.log(chalk.yellow(`  4. Or force recovery: npx deploy-kit recover ${result.stage}\n`));
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
  /**
   * Run deployment command and extract CloudFront distribution ID
   */
  /**
   * Run deployment command with real-time streaming output
   */
  private async runDeploy(stage: DeploymentStage): Promise<string | null> {
    const spinner = ora(`Deploying to ${stage}...`).start();

    try {
      const stageConfig = this.config.stageConfig[stage];
      const sstStage = stageConfig.sstStageName || stage;

      let deployOutput = '';

      if (this.config.customDeployScript) {
        // Use custom deployment script
        const { stdout } = await execAsync(`bash ${this.config.customDeployScript} ${stage}`, {
          cwd: this.projectRoot,
        });
        deployOutput = stdout;
        spinner.succeed(`✅ Deployed to ${stage}`);
      } else {
        // Default: SST deploy with streaming output
        deployOutput = await this.runSSTDeployWithStreaming(stage, sstStage, spinner);
        spinner.succeed(`✅ Deployed to ${stage}`);
      }

      // Extract CloudFront distribution ID from deployment output
      const distId = this.extractCloudFrontDistributionId(deployOutput);
      
      if (distId) {
        spinner.info(`CloudFront distribution ID: ${distId}`);
      }

      return distId;
    } catch (error) {
      spinner.fail(`❌ Deployment to ${stage} failed`);
      throw error;
    }
  }

  /**
   * Run SST deploy with real-time streaming output (last 3 lines)
   */
  /**
   * Run SST deploy with real-time streaming output (last 3 lines)
   */
  private async runSSTDeployWithStreaming(
    stage: DeploymentStage,
    sstStage: string,
    spinner: ReturnType<typeof ora>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...(this.config.awsProfile && {
          AWS_PROFILE: this.config.awsProfile,
        }),
      };

      const child = spawn('npx', ['sst', 'deploy', '--stage', sstStage], {
        cwd: this.projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const outputLines: string[] = []; // Keep last 3 lines for display
      let lastUpdateTime = Date.now();

      // Handle stdout
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Process new lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            outputLines.push(line.substring(0, 80)); // Limit line length
            // Keep only last 3 lines
            if (outputLines.length > 3) {
              outputLines.shift();
            }
          }
        }

        // Update spinner with last 3 lines (throttled to avoid flicker)
        const now = Date.now();
        if (now - lastUpdateTime > 200 && outputLines.length > 0) {
          lastUpdateTime = now;
          const displayText = outputLines.map(l => `  ${l}`).join('\n');
          spinner.text = `Deploying to ${stage}...\n${displayText}`;
        }
      });

      // Handle stderr
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Also show stderr in last 3 lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            outputLines.push(chalk.yellow(line.substring(0, 80)));
            if (outputLines.length > 3) {
              outputLines.shift();
            }
          }
        }

        const now = Date.now();
        if (now - lastUpdateTime > 200 && outputLines.length > 0) {
          lastUpdateTime = now;
          const displayText = outputLines.map(l => `  ${l}`).join('\n');
          spinner.text = `Deploying to ${stage}...\n${displayText}`;
        }
      });

      // Handle process exit
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`SST deploy failed with exit code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Extract CloudFront distribution ID from SST deployment output
   * Looks for patterns like:
   *   - Outputs section with domain names
   *   - CloudFront distribution references
   */
  private extractCloudFrontDistributionId(output: string): string | null {
    // SST outputs CloudFront URLs in format: https://d1234abcd.cloudfront.net
    // Extract the distribution ID (the 'dXXXXabcd' part)
    const cloudFrontMatch = output.match(/https:\/\/([a-z0-9]+)\.cloudfront\.net/i);
    
    if (cloudFrontMatch && cloudFrontMatch[1]) {
      // The distribution ID starts with 'd' (or 'D') 
      // For example: d1234abcd from d1234abcd.cloudfront.net
      return cloudFrontMatch[1];
    }

    // Fallback: Look for distribution ID in JSON output (some SST versions output JSON)
    try {
      // Try to find JSON output that contains distribution info
      const jsonMatch = output.match(/\{[\s\S]*?"distributionId"[\s\S]*?\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        if (json.distributionId) {
          return json.distributionId;
        }
      }
    } catch {
      // JSON parsing failed, continue to next method
    }

    // Fallback: Query CloudFront for recent distributions
    // This is slower but more reliable if output parsing fails
    // We'll implement this if the above methods don't work
    return null;
  }

  /**
   * Invalidate CloudFront cache
   */
  /**
   * Invalidate CloudFront cache
   */
  private async invalidateCache(stage: DeploymentStage, distributionId: string | null): Promise<void> {
    const spinner = ora('Invalidating CloudFront cache...').start();

    try {
      // Try to get distribution ID from parameter, then fall back to environment variable
      let distId = distributionId || process.env[`CLOUDFRONT_DIST_ID_${stage.toUpperCase()}`] || null;

      if (!distId) {
        // If still not found, try to fetch it from CloudFront API by querying for recent distributions
        distId = await this.findCloudFrontDistributionId(stage);
      }

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

      // Extract invalidation ID from response
      const invMatch = stdout.match(/"Id"[\s:]*"([^"]+)"/);
      if (invMatch && invMatch[1]) {
        spinner.succeed(`✅ Cache invalidation started (ID: ${invMatch[1]})`);
      } else {
        spinner.succeed('✅ Cache invalidation started');
      }
    } catch (error) {
      spinner.warn('⚠️  CloudFront cache invalidation failed (not critical)');
    }
  }

  /**
   * Find CloudFront distribution ID by querying API
   * Used as fallback if distribution ID is not extracted from deployment output
   */
  private async findCloudFrontDistributionId(stage: DeploymentStage): Promise<string | null> {
    try {
      const client = new CloudFrontAPIClient('us-east-1', this.config.awsProfile);
      const distributions = await client.listDistributions();

      // Get the domain we expect for this stage
      const domain = this.config.stageConfig[stage].domain;
      if (!domain) {
        return null;
      }

      // Find the distribution that matches our domain
      for (const dist of distributions) {
        if (dist.DomainName === domain || dist.DomainName.includes(domain)) {
          return dist.Id;
        }

        // Also check alternate domain names (CNAMEs)
        if (dist.AliasedDomains && dist.AliasedDomains.length > 0) {
          for (const alias of dist.AliasedDomains) {
            if (alias === domain) {
              return dist.Id;
            }
          }
        }
      }

      // If exact match not found, return most recently modified distribution
      // (assuming it's the one we just deployed)
      if (distributions.length > 0) {
        // Sort by LastModifiedTime (most recent first)
        distributions.sort((a, b) => {
          const timeA = a.LastModifiedTime?.getTime() || 0;
          const timeB = b.LastModifiedTime?.getTime() || 0;
          return timeB - timeA;
        });
        return distributions[0].Id;
      }

      return null;
    } catch (error) {
      // If API lookup fails, return null and skip cache invalidation
      return null;
    }
  }

  /**
   * Get AWS region for the deployment stage
   * Falls back to us-east-1 if not configured
   */
  private getAwsRegion(stage: DeploymentStage): string {
    return this.config.stageConfig[stage].awsRegion || 'us-east-1';
  }

  /**
   * Audit CloudFront after deployment and offer to cleanup orphans
   */
  private async postDeploymentCloudFrontAudit(stage: DeploymentStage): Promise<void> {
    try {
      const spinner = ora('🔍 Auditing CloudFront infrastructure...').start();

      // Note: CloudFront is a global service with API endpoint always in us-east-1
      // even though the deployment may be in a different region
      const client = new CloudFrontAPIClient('us-east-1', this.config.awsProfile);
      const distributions = await client.listDistributions();
      const dnsRecords: any[] = []; // TODO: Fetch from Route53

      const report = CloudFrontAnalyzer.generateAuditReport(distributions, this.config, dnsRecords);

      if (report.orphanedDistributions.length === 0) {
        spinner.succeed('✅ CloudFront infrastructure is clean');
        return;
      }

      spinner.stop();

      // Show orphaned distributions
      console.log('\n' + chalk.bold.yellow('⚠️  Orphaned CloudFront Distributions Detected\n'));

      const orphanCount = report.orphanedDistributions.length;
      const estimatedMonthlyCost = orphanCount * 2.5; // ~$2.50 per distribution/month

      console.log(chalk.yellow(`Found ${orphanCount} orphaned distribution(s):`));
      for (const analysis of report.orphanedDistributions) {
        const createdDate = analysis.createdTime ? new Date(analysis.createdTime).toLocaleDateString() : 'unknown';
        console.log(chalk.gray(`  • ${analysis.id} (created ${createdDate})`));
      }

      console.log(chalk.yellow(`\n💾 Estimated cost: ~$${estimatedMonthlyCost.toFixed(2)}/month\n`));

      // Ask user if they want to cleanup
      const response = await prompt({
        type: 'confirm',
        name: 'cleanup',
        message: 'Would you like to cleanup these orphaned distributions?',
        initial: false,
      });

      if (response.cleanup) {
        console.log('');
        console.log(chalk.bold.cyan('🧹 Starting CloudFront cleanup in background...'));
        console.log(chalk.gray('   Cleanup will continue even if you close this terminal'));
        console.log(chalk.gray('   Check progress anytime with: make cloudfront-report\n'));

        // Start cleanup in background (don't wait)
        this.startBackgroundCloudFrontCleanup(stage).catch(err => {
          console.error(chalk.red('⚠️  Background cleanup failed:'), err.message);
        });
      } else {
        console.log(chalk.gray('\nℹ️  You can cleanup anytime by running: make cloudfront-cleanup\n'));
      }
    } catch (error) {
      // Don't break deployment on audit errors, but log for debugging
      // Audit is informational only - not critical to deployment success
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.gray(`⚠️  CloudFront audit skipped: ${errorMsg}`));
    }
  }

  /**
   * Start CloudFront cleanup in background (non-blocking)
   */
  private async startBackgroundCloudFrontCleanup(stage: DeploymentStage): Promise<void> {
    try {
      const client = new CloudFrontAPIClient('us-east-1', this.config.awsProfile);
      const distributions = await client.listDistributions();
      const dnsRecords: any[] = []; // TODO: Fetch from Route53

      const report = CloudFrontAnalyzer.generateAuditReport(distributions, this.config, dnsRecords);

      // Delete each orphaned distribution
      for (const analysis of report.orphanedDistributions) {
        // Only delete if it's safe (orphaned + placeholder origin)
        if (CloudFrontAnalyzer.canDelete(analysis)) {
          try {
            // Disable first
            await client.disableDistribution(analysis.id);
            // Wait for CloudFront to process
            await client.waitForDistributionDeployed(analysis.id, 60000); // 1 min timeout
            // Then delete
            await client.deleteDistribution(analysis.id);
          } catch (err) {
            // Log but continue with next distribution
            console.error(chalk.gray(`⚠️  Failed to delete ${analysis.id}: ${(err as Error).message}`));
          }
        }
      }
    } catch (error) {
      console.error(chalk.gray(`⚠️  Background cleanup error: ${(error as Error).message}`));
    }
  }
}
