import { DeploymentStage } from '../types.js';
/**
 * Rollback manager - handles recovery from failed deployments
 *
 * Responsible for:
 * - Clearing deployment locks
 * - Clearing Pulumi/SST state locks
 * - Providing recovery guidance
 *
 * @example
 * ```typescript
 * const rollbackManager = new RollbackManager(lockManager);
 * await rollbackManager.recover('staging');
 * ```
 */
export declare class RollbackManager {
    private lockManager;
    /**
     * Create a new rollback manager
     *
     * @param lockManager - Lock manager instance for clearing locks
     */
    constructor(lockManager: any);
    /**
     * Recover from failed deployment
     *
     * Clears all locks (file-based and Pulumi) to allow redeployment.
     * This is safe to run and will not affect running deployments.
     *
     * @param stage - Deployment stage to recover
     * @throws {Error} If recovery fails
     *
     * @example
     * ```typescript
     * await rollbackManager.recover('staging');
     * // Locks cleared, ready to redeploy
     * ```
     */
    recover(stage: DeploymentStage): Promise<void>;
    /**
     * Get deployment status
     *
     * Checks both file-based locks and Pulumi locks to determine if deployment
     * is in progress or if recovery is needed.
     *
     * @param stage - Deployment stage to check
     *
     * @example
     * ```typescript
     * await rollbackManager.getStatus('staging');
     * // Prints status: ready, locked, or stale
     * ```
     */
    getStatus(stage: DeploymentStage): Promise<void>;
    /**
     * Provide guidance for manual rollback scenarios
     *
     * @param stage - Deployment stage
     * @param error - Error that occurred during deployment
     */
    provideRollbackGuidance(stage: DeploymentStage, error: Error): void;
}
//# sourceMappingURL=rollback-manager.d.ts.map