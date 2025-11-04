import chalk from 'chalk';
import { getHealthChecker } from './health/checker.js';
import { getLockManager } from './locks/manager.js';
import { getPreDeploymentChecks } from './safety/pre-deploy.js';
import { getPostDeploymentChecks } from './safety/post-deploy.js';
import { DeploymentOrchestrator } from './deployment/orchestrator.js';
import { RollbackManager } from './deployment/rollback-manager.js';
import { CloudFrontOperations } from './lib/cloudfront/operations.js';
import { StructuredLogger } from './monitoring/structured-logger.js';
import { MetricsCollector } from './monitoring/metrics-collector.js';
import { PerformanceAnalyzer } from './lib/performance-analyzer.js';
import { DeploymentDiffCollector, formatDeploymentDiff } from './deployment/diff-collector.js';
import { uploadMaintenancePage, deleteMaintenancePage } from './lib/maintenance-s3.js';
import { enableMaintenanceMode, disableMaintenanceMode } from './lib/maintenance-cloudfront.js';
import { runLifecycleHook } from './lib/lifecycle-hooks.js';
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
    constructor(config, projectRoot = process.cwd(), options) {
        this.config = config;
        this.projectRoot = projectRoot;
        this.lockManager = getLockManager(projectRoot);
        this.healthChecker = getHealthChecker(config);
        this.preChecks = getPreDeploymentChecks(config, projectRoot);
        this.postChecks = getPostDeploymentChecks(config);
        this.orchestrator = new DeploymentOrchestrator(config, projectRoot);
        this.rollbackManager = new RollbackManager(this.lockManager);
        this.cloudFrontOps = new CloudFrontOperations(config, config.awsProfile);
        // Initialize observability components
        const minLevel = options?.logLevel || (options?.verbose ? 'debug' : 'info');
        const backend = options?.metricsBackend || 'memory';
        this.logger = new StructuredLogger({
            minLevel,
            enableRemote: backend !== 'memory',
            remoteProvider: backend === 'memory' ? 'otel' : backend,
        });
        this.metrics = new MetricsCollector({
            backend,
            maxBufferSize: 1000,
        });
        // Set deployment context for structured logging
        this.logger.setDeploymentContext(config.projectName, projectRoot);
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
    async deploy(stage, options) {
        const isDryRun = options?.isDryRun || false;
        const startTimeDate = new Date();
        const startTime = startTimeDate.getTime();
        const stageTimings = [];
        let cloudFrontDistId = null;
        // Initialize performance analyzer if benchmarking is enabled
        const perfAnalyzer = options?.benchmark ? new PerformanceAnalyzer() : null;
        if (perfAnalyzer) {
            perfAnalyzer.start('deployment.total');
        }
        const result = {
            success: false,
            stage,
            isDryRun,
            startTime: startTimeDate,
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
        // Track maintenance mode state for cleanup
        let maintenanceS3Url = null;
        let maintenanceOriginalConfig = null;
        try {
            // Log deployment start
            const isCanary = !!options?.canary;
            const withMaintenance = !!options?.maintenance;
            this.logger.info('Deployment started', {
                stage,
                isDryRun,
                isCanary,
                canaryConfig: options?.canary,
                withMaintenance,
                projectName: this.config.projectName,
            });
            const deploymentTimer = this.metrics.startTimer('deployment.total');
            // Print deployment header
            console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
            let headerMode = isDryRun ? '🔍 DRY-RUN PREVIEW' : '🚀 DEPLOYMENT PIPELINE';
            if (isCanary) {
                headerMode += ' (CANARY)';
            }
            if (withMaintenance) {
                headerMode += ' (MAINTENANCE)';
            }
            console.log(chalk.bold.cyan(`${headerMode}: ${stage.toUpperCase()}`));
            console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
            if (isCanary) {
                console.log(chalk.yellow('🐤 Canary Deployment Mode:'));
                console.log(chalk.gray(`   Initial traffic: ${options?.canary?.initial}%`));
                console.log(chalk.gray(`   Traffic increment: ${options?.canary?.increment}%`));
                console.log(chalk.gray(`   Interval: ${options?.canary?.interval}s\n`));
            }
            if (withMaintenance) {
                console.log(chalk.yellow('🔧 Maintenance Mode:'));
                console.log(chalk.gray('   Maintenance page will be shown during deployment'));
                console.log(chalk.gray('   Expected downtime: 30-60 seconds\n'));
            }
            // Run pre-deploy lifecycle hook
            await runLifecycleHook('pre-deploy', {
                stage,
                isDryRun,
                startTime: startTimeDate,
                projectRoot: this.projectRoot,
            });
            // Show configuration diff if requested
            if (options?.showDiff) {
                console.log(chalk.gray('\nFetching current AWS state for comparison...\n'));
                try {
                    const diffCollector = new DeploymentDiffCollector(this.config, stage);
                    const deploymentDiff = await diffCollector.collectDiff();
                    const formattedDiff = await formatDeploymentDiff(deploymentDiff);
                    console.log(formattedDiff);
                    if (!deploymentDiff.hasChanges) {
                        console.log(chalk.yellow('💡 Tip: No AWS resource changes detected, but code/dependencies may have changed.\n'));
                    }
                }
                catch (error) {
                    console.warn(chalk.yellow('⚠️  Could not fetch complete AWS state for diff:'), error);
                    console.log(chalk.gray('Showing configuration preview instead:\n'));
                    // Fallback to simple preview
                    const stageConfigPreview = {
                        stage,
                        domain: this.config.stageConfig[stage].domain,
                        awsRegion: this.config.stageConfig[stage].awsRegion,
                        infrastructure: this.config.infrastructure,
                        database: this.config.database,
                        healthChecks: this.config.healthChecks?.length || 0,
                        skipCacheInvalidation: this.config.stageConfig[stage].skipCacheInvalidation || false,
                    };
                    console.log(JSON.stringify(stageConfigPreview, null, 2));
                    console.log('');
                }
            }
            // Stage 1: Pre-deployment safety checks (BEFORE lock acquisition)
            // This way, if pre-checks fail, lock is never acquired
            let stage1Start = Date.now();
            this.logger.debug('Running pre-deployment checks', { stage });
            const preChecksTimer = this.metrics.startTimer('stage.pre-checks');
            if (perfAnalyzer)
                perfAnalyzer.start('stage.pre-checks');
            console.log(chalk.bold.white('▸ Stage 1: Pre-Deployment Checks'));
            console.log(chalk.gray('  Validating: git status, AWS credentials, tests, SSL\n'));
            await this.preChecks.run(stage);
            result.details.gitStatusOk = true;
            result.details.testsOk = true;
            const stage1Duration = Date.now() - stage1Start;
            this.metrics.stopTimer(preChecksTimer);
            if (perfAnalyzer)
                perfAnalyzer.end('stage.pre-checks');
            this.logger.info('Pre-deployment checks passed', { stage, durationMs: stage1Duration });
            stageTimings.push({ name: 'Pre-Deployment Checks', duration: stage1Duration });
            // Only acquire lock AFTER pre-checks pass (skip in dry-run mode)
            let newLock;
            if (!isDryRun) {
                await this.lockManager.checkAndCleanPulumiLock(stage);
                newLock = await this.lockManager.acquireLock(stage);
                this.logger.debug('Lock acquired', { stage });
            }
            else {
                console.log(chalk.yellow('ℹ️  Dry-run mode: skipping lock acquisition\n'));
            }
            // Enable maintenance mode (if requested, and not dry-run)
            if (withMaintenance && !isDryRun) {
                console.log(chalk.bold.white('\n▸ Enabling Maintenance Mode'));
                console.log(chalk.gray('  Uploading maintenance page and switching CloudFront origin\n'));
                try {
                    const awsRegion = this.config.stageConfig[stage].awsRegion || 'us-east-1';
                    // Find CloudFront distribution ID
                    const maintenanceDistId = await this.cloudFrontOps.findDistributionId(stage);
                    if (!maintenanceDistId) {
                        console.log(chalk.yellow('  ⚠️  Warning: CloudFront distribution not found, skipping maintenance mode'));
                        console.log(chalk.gray('  Continuing with deployment...\n'));
                    }
                    else {
                        // Upload maintenance page to S3
                        maintenanceS3Url = await uploadMaintenancePage({
                            region: awsRegion,
                            customPagePath: options?.maintenance?.customPagePath,
                        });
                        console.log(chalk.green(`  ✓ Maintenance page uploaded: ${maintenanceS3Url}`));
                        // Switch CloudFront to maintenance page
                        maintenanceOriginalConfig = await enableMaintenanceMode({
                            distributionId: maintenanceDistId,
                            maintenanceS3Url,
                            region: awsRegion,
                        });
                        console.log(chalk.green('  ✓ CloudFront switched to maintenance page\n'));
                        this.logger.info('Maintenance mode enabled', {
                            stage,
                            s3Url: maintenanceS3Url,
                            distributionId: maintenanceDistId,
                        });
                    }
                }
                catch (error) {
                    console.log(chalk.yellow(`  ⚠️  Warning: Could not enable maintenance mode: ${error.message}`));
                    console.log(chalk.gray('  Continuing with deployment...\n'));
                    this.logger.warn('Maintenance mode setup failed', { stage, error: error.message });
                }
            }
            // Stage 2: Build & Deploy (delegated to orchestrator)
            let stage2Start = Date.now();
            this.logger.debug('Starting build and deploy', { stage });
            const buildDeployTimer = this.metrics.startTimer('stage.build-deploy');
            if (perfAnalyzer)
                perfAnalyzer.start('stage.build-deploy');
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
            cloudFrontDistId = await this.orchestrator.executeDeploy(stage, { isDryRun });
            result.details.deploymentOk = true;
            const stage2Duration = Date.now() - stage2Start;
            this.metrics.stopTimer(buildDeployTimer);
            if (perfAnalyzer)
                perfAnalyzer.end('stage.build-deploy');
            this.logger.info('Build and deploy completed', { stage, durationMs: stage2Duration, cloudFrontDistId });
            stageTimings.push({ name: 'Build & Deploy', duration: stage2Duration });
            // Stage 3: Post-deployment validation
            let stage3Start = Date.now();
            this.logger.debug('Running post-deployment validation', { stage });
            const healthChecksTimer = this.metrics.startTimer('stage.health-checks');
            if (perfAnalyzer)
                perfAnalyzer.start('stage.health-checks');
            console.log(chalk.bold.white('\n▸ Stage 3: Post-Deployment Validation'));
            console.log(chalk.gray('  Testing health checks and CloudFront configuration\n'));
            if (!isDryRun) {
                await this.postChecks.run(stage);
            }
            result.details.healthChecksOk = true;
            const stage3Duration = Date.now() - stage3Start;
            this.metrics.stopTimer(healthChecksTimer);
            if (perfAnalyzer)
                perfAnalyzer.end('stage.health-checks');
            this.logger.info('Health checks passed', { stage, durationMs: stage3Duration });
            stageTimings.push({ name: 'Health Checks', duration: stage3Duration });
            // Disable maintenance mode (if it was enabled)
            if (maintenanceOriginalConfig && !isDryRun) {
                console.log(chalk.bold.white('\n▸ Disabling Maintenance Mode'));
                console.log(chalk.gray('  Restoring original CloudFront configuration\n'));
                try {
                    const awsRegion = this.config.stageConfig[stage].awsRegion || 'us-east-1';
                    // Restore original CloudFront configuration
                    await disableMaintenanceMode(maintenanceOriginalConfig, awsRegion);
                    console.log(chalk.green('  ✓ CloudFront restored to original configuration'));
                    // Delete maintenance page from S3
                    if (maintenanceS3Url) {
                        await deleteMaintenancePage({
                            region: awsRegion,
                        });
                        console.log(chalk.green('  ✓ Maintenance page cleaned up\n'));
                    }
                    this.logger.info('Maintenance mode disabled', {
                        stage,
                        distributionId: maintenanceOriginalConfig.distributionId,
                    });
                }
                catch (error) {
                    console.log(chalk.yellow(`  ⚠️  Warning: Could not disable maintenance mode: ${error.message}`));
                    console.log(chalk.gray('  Site should still be accessible via original configuration\n'));
                    this.logger.warn('Maintenance mode cleanup failed', { stage, error: error.message });
                }
            }
            // Run post-deploy lifecycle hook
            await runLifecycleHook('post-deploy', {
                stage,
                isDryRun,
                startTime: startTimeDate,
                projectRoot: this.projectRoot,
            });
            // Stage 4: Cache invalidation (background, delegated to CloudFront operations, skip in dry-run)
            let stage4Start = Date.now();
            if (!isDryRun && !this.config.stageConfig[stage].skipCacheInvalidation) {
                this.logger.debug('Starting cache invalidation', { stage, cloudFrontDistId });
                const cacheInvalidationTimer = this.metrics.startTimer('stage.cache-invalidation');
                if (perfAnalyzer)
                    perfAnalyzer.start('stage.cache-invalidation');
                console.log(chalk.bold.white('\n▸ Stage 4: Cache Invalidation'));
                console.log(chalk.gray('  Clearing CloudFront cache (runs in background)\n'));
                await this.cloudFrontOps.invalidateCache(stage, cloudFrontDistId);
                result.details.cacheInvalidatedOk = true;
                this.metrics.stopTimer(cacheInvalidationTimer);
                if (perfAnalyzer)
                    perfAnalyzer.end('stage.cache-invalidation');
                this.logger.info('Cache invalidation completed', { stage, cloudFrontDistId });
            }
            stageTimings.push({ name: 'Cache Invalidation', duration: Date.now() - stage4Start });
            result.success = true;
            const successMsg = isDryRun ? `✅ Dry-run validation for ${stage} successful!` : `✅ Deployment to ${stage} successful!`;
            result.message = successMsg;
            // Release lock (if not dry-run)
            if (!isDryRun && newLock) {
                await this.lockManager.releaseLock(newLock);
                this.logger.debug('Lock released', { stage });
            }
            // Record total deployment duration
            const totalDuration = Date.now() - startTime;
            this.metrics.stopTimer(deploymentTimer);
            this.metrics.recordHistogram('deployment.duration', totalDuration);
            this.metrics.incrementCounter('deployment.success');
            // End performance tracking and generate report
            if (perfAnalyzer) {
                perfAnalyzer.end('deployment.total');
                const report = perfAnalyzer.generateReport();
                const formattedReport = PerformanceAnalyzer.formatReport(report);
                console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
                console.log(chalk.bold.cyan('📊 PERFORMANCE REPORT'));
                console.log(chalk.bold.cyan('═'.repeat(60)));
                console.log(formattedReport);
            }
            this.logger.info('Deployment completed successfully', {
                stage,
                durationMs: totalDuration,
                isDryRun,
            });
            // Print deployment summary (delegated to orchestrator)
            this.orchestrator.printDeploymentSummary(result, stageTimings);
            // Post-deployment: Audit CloudFront and offer cleanup (delegated to CloudFront operations, skip in dry-run)
            if (!isDryRun) {
                await this.cloudFrontOps.auditAndCleanup(stage);
            }
        }
        catch (error) {
            result.success = false;
            result.message = `❌ Deployment to ${stage} failed`;
            result.error = error instanceof Error ? error.message : String(error);
            // Log deployment failure
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error('Deployment failed', err, {
                stage,
                durationMs: Date.now() - startTime,
            });
            this.metrics.incrementCounter('deployment.failure');
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
                    this.logger.debug('Lock released after error', { stage });
                }
            }
            catch (lockErr) {
                // Silently ignore if lock doesn't exist or can't be released
            }
            // Disable maintenance mode if it was enabled (emergency cleanup)
            if (maintenanceOriginalConfig && !isDryRun) {
                console.log(chalk.yellow('\n⚠️  Attempting to restore site from maintenance mode...\n'));
                try {
                    const awsRegion = this.config.stageConfig[stage].awsRegion || 'us-east-1';
                    // Restore original CloudFront configuration
                    await disableMaintenanceMode(maintenanceOriginalConfig, awsRegion);
                    console.log(chalk.green('✓ CloudFront restored to original configuration'));
                    // Delete maintenance page from S3
                    if (maintenanceS3Url) {
                        await deleteMaintenancePage({
                            region: awsRegion,
                        });
                        console.log(chalk.green('✓ Maintenance page cleaned up\n'));
                    }
                    this.logger.info('Maintenance mode disabled after deployment failure', {
                        stage,
                        distributionId: maintenanceOriginalConfig.distributionId,
                    });
                }
                catch (maintenanceErr) {
                    console.log(chalk.red(`✗ Could not restore from maintenance mode: ${maintenanceErr.message}`));
                    console.log(chalk.yellow('⚠️  Site may still be showing maintenance page!'));
                    console.log(chalk.gray('   You may need to manually restore CloudFront configuration\n'));
                    this.logger.error('Maintenance mode cleanup failed after deployment failure', maintenanceErr, { stage });
                }
            }
            // Run on-failure lifecycle hook
            await runLifecycleHook('on-failure', {
                stage,
                isDryRun,
                startTime: startTimeDate,
                projectRoot: this.projectRoot,
            });
        }
        result.endTime = new Date();
        result.durationSeconds = Math.round((result.endTime.getTime() - result.startTime.getTime()) / 1000);
        // Flush observability data
        this.logger.flush();
        this.metrics.flush();
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
