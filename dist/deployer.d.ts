import { ProjectConfig, DeploymentStage, DeploymentResult } from './types.js';
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
export declare class DeploymentKit {
    private config;
    private projectRoot;
    private lockManager;
    private healthChecker;
    private preChecks;
    private postChecks;
    private orchestrator;
    private rollbackManager;
    private cloudFrontOps;
    private logger;
    private metrics;
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
    constructor(config: ProjectConfig, projectRoot?: string, options?: {
        logLevel?: 'debug' | 'info' | 'warn' | 'error';
        metricsBackend?: 'memory' | 'datadog' | 'cloudwatch' | 'prometheus';
        verbose?: boolean;
    });
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
    deploy(stage: DeploymentStage, options?: {
        isDryRun?: boolean;
        showDiff?: boolean;
        benchmark?: boolean;
        skipPreChecks?: boolean;
        canary?: {
            initial: number;
            increment: number;
            interval: number;
        };
        maintenance?: {
            customPagePath?: string;
        };
    }): Promise<DeploymentResult>;
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
    getStatus(stage: DeploymentStage): Promise<void>;
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
    recover(stage: DeploymentStage): Promise<void>;
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
    validateHealth(stage: DeploymentStage): Promise<boolean>;
}
//# sourceMappingURL=deployer.d.ts.map