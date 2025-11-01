import chalk from 'chalk';
import { getHealthChecker } from './health/checker.js';
import { getLockManager } from './locks/manager.js';
import { getPreDeploymentChecks } from './safety/pre-deploy.js';
import { getPostDeploymentChecks } from './safety/post-deploy.js';
import { DeploymentOrchestrator } from './deployment/orchestrator.js';
import { RollbackManager } from './deployment/rollback-manager.js';
import { CloudFrontOperations } from './lib/cloudfront/operations.js';
/**
 * DeploymentKit - Main facade for deployment operations
 *
 * This is the primary interface for deploy-kit. It delegates to specialized components:
 * - DeploymentOrchestrator: Manages deployment flow, building, and SST execution
 * - RollbackManager: Handles recovery from failed deployments
 * - CloudFrontOperations: Manages CloudFront cache invalidation and audits
 * - Lock Manager: Prevents concurrent deployments
 * - Health Checker: Validates post-deployment health
 * - Safety Checks: Pre/post deployment validation
 *
 * This facade maintains backward compatibility while enabling better separation of concerns.
 *
 * @example
 * ```typescript
 * import { DeploymentKit } from '@duersjefen/deploy-kit';
 *
 * const config = JSON.parse(fs.readFileSync('.deploy-config.json', 'utf-8'));
 * const kit = new DeploymentKit(config, process.cwd());
 *
 * // Deploy to staging
 * await kit.deploy('staging');
 *
 * // Check status
 * await kit.getStatus('staging');
 *
 * // Recover from failure
 * await kit.recover('staging');
 * ```
 */
export class DeploymentKit {
    /**
     * Create a new DeploymentKit instance
     *
     * @param config - Project configuration from .deploy-config.json
     * @param projectRoot - Absolute path to project root (defaults to process.cwd())
     *
     * @example
     * ```typescript
     * const config = JSON.parse(fs.readFileSync('.deploy-config.json', 'utf-8'));
     * const kit = new DeploymentKit(config, '/path/to/project');
     * ```
     */
    constructor(config, projectRoot = process.cwd()) {
        this.config = config;
        this.projectRoot = projectRoot;
        this.lockManager = getLockManager(projectRoot);
        this.healthChecker = getHealthChecker(config);
        this.preChecks = getPreDeploymentChecks(config, projectRoot);
        this.postChecks = getPostDeploymentChecks(config);
        this.orchestrator = new DeploymentOrchestrator(config, projectRoot);
        this.rollbackManager = new RollbackManager(this.lockManager);
        this.cloudFrontOps = new CloudFrontOperations(config, config.awsProfile);
    }
    /**
     * Execute full deployment workflow
     *
     * Orchestrates the complete deployment process:
     * 1. Pre-deployment safety checks (git, tests, AWS credentials, SSL)
     * 2. Acquire deployment lock
     * 3. Build and deploy application
     * 4. Post-deployment validation (health checks)
     * 5. Cache invalidation (if CloudFront)
     * 6. CloudFront audit and cleanup
     *
     * @param stage - Deployment stage (development, staging, production)
     * @returns Deployment result with success status and timing information
     * @throws {Error} If deployment fails at any stage
     *
     * @example
     * ```typescript
     * const result = await kit.deploy('staging');
     * console.log(result.success); // true
     * console.log(result.durationSeconds); // 127
     * ```
     */
    async deploy(stage) {
        const startTime = new Date();
        const stageTimings = [];
        let cloudFrontDistId = null;
        const result = {
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
            // Stage 2: Build & Deploy (delegated to orchestrator)
            let stage2Start = Date.now();
            console.log(chalk.bold.white('\n▸ Stage 2: Build & Deploy'));
            console.log(chalk.gray('  Building application and deploying to AWS\n'));
            // For SST projects, build is handled by sst deploy, skip separate build
            if (!this.orchestrator.isSSTProject()) {
                await this.orchestrator.runBuild();
                result.details.buildsOk = true;
            }
            else {
                result.details.buildsOk = true;
            }
            cloudFrontDistId = await this.orchestrator.executeDeploy(stage);
            result.details.deploymentOk = true;
            stageTimings.push({ name: 'Build & Deploy', duration: Date.now() - stage2Start });
            // Stage 3: Post-deployment validation
            let stage3Start = Date.now();
            console.log(chalk.bold.white('\n▸ Stage 3: Post-Deployment Validation'));
            console.log(chalk.gray('  Testing health checks and CloudFront configuration\n'));
            await this.postChecks.run(stage);
            result.details.healthChecksOk = true;
            stageTimings.push({ name: 'Health Checks', duration: Date.now() - stage3Start });
            // Stage 4: Cache invalidation (background, delegated to CloudFront operations)
            let stage4Start = Date.now();
            if (!this.config.stageConfig[stage].skipCacheInvalidation) {
                console.log(chalk.bold.white('\n▸ Stage 4: Cache Invalidation'));
                console.log(chalk.gray('  Clearing CloudFront cache (runs in background)\n'));
                await this.cloudFrontOps.invalidateCache(stage, cloudFrontDistId);
                result.details.cacheInvalidatedOk = true;
            }
            stageTimings.push({ name: 'Cache Invalidation', duration: Date.now() - stage4Start });
            result.success = true;
            result.message = `✅ Deployment to ${stage} successful!`;
            // Release lock
            await this.lockManager.releaseLock(newLock);
            // Print deployment summary (delegated to orchestrator)
            this.orchestrator.printDeploymentSummary(result, stageTimings);
            // Post-deployment: Audit CloudFront and offer cleanup (delegated to CloudFront operations)
            await this.cloudFrontOps.auditAndCleanup(stage);
        }
        catch (error) {
            result.success = false;
            result.message = `❌ Deployment to ${stage} failed`;
            result.error = error instanceof Error ? error.message : String(error);
            // Print failure summary (delegated to orchestrator)
            this.orchestrator.printDeploymentFailureSummary(result, stageTimings);
            // Release lock if it was acquired
            // Pre-check failures won't have lock, but deployment failures will
            // Either way, release it so user doesn't have to manually recover
            try {
                // Try to get the lock to see if it was acquired
                const existingLock = await this.lockManager.getFileLock(stage);
                if (existingLock) {
                    await this.lockManager.releaseLock(existingLock);
                }
            }
            catch (lockErr) {
                // Silently ignore if lock doesn't exist or can't be released
            }
        }
        result.endTime = new Date();
        result.durationSeconds = Math.round((result.endTime.getTime() - result.startTime.getTime()) / 1000);
        return result;
    }
    /**
     * Get deployment status without deploying
     *
     * Checks for active or stale deployment locks and Pulumi state locks.
     * Useful for diagnosing deployment issues.
     *
     * @param stage - Deployment stage to check
     *
     * @example
     * ```typescript
     * await kit.getStatus('staging');
     * // Prints: "✅ Ready to deploy to staging"
     * // or: "❌ Active deployment lock for staging (45 min remaining)"
     * ```
     */
    async getStatus(stage) {
        return this.rollbackManager.getStatus(stage);
    }
    /**
     * Recover from failed deployment
     *
     * Clears all deployment locks (file-based and Pulumi) to allow redeployment.
     * This is safe to run and will not affect running deployments or infrastructure state.
     *
     * @param stage - Deployment stage to recover
     * @throws {Error} If recovery fails
     *
     * @example
     * ```typescript
     * await kit.recover('staging');
     * // Clears locks, ready to redeploy
     * ```
     */
    async recover(stage) {
        return this.rollbackManager.recover(stage);
    }
    /**
     * Validate health after deployment
     *
     * Runs all configured health checks for the stage. Health checks can include:
     * - HTTP endpoint validation
     * - Database connectivity
     * - CloudFront origin configuration
     *
     * @param stage - Deployment stage to validate
     * @returns True if all health checks pass, false otherwise
     *
     * @example
     * ```typescript
     * const healthy = await kit.validateHealth('staging');
     * if (!healthy) {
     *   console.log('Some health checks failed');
     * }
     * ```
     */
    async validateHealth(stage) {
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
            if (!passed)
                allPass = false;
        }
        return allPass;
    }
}
