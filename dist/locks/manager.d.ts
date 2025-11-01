import { DeploymentStage, DeploymentLock } from '../types.js';
/**
 * Lock management system preventing concurrent deployments
 *
 * Implements a dual-lock system:
 * 1. File-based lock (.deployment-lock-{stage}) - prevents human-triggered concurrent deploys
 * 2. Pulumi lock detection - detects infrastructure state locks and provides recovery
 *
 * @param projectRoot - Root directory of the project
 * @returns Lock manager object with lock management methods
 *
 * @example
 * ```typescript
 * const lockManager = getLockManager('/path/to/project');
 * const lock = await lockManager.acquireLock('staging');
 * try {
 *   // Perform deployment
 * } finally {
 *   await lockManager.releaseLock(lock);
 * }
 * ```
 */
export declare function getLockManager(projectRoot: string): {
    isPulumiLocked: (stage: DeploymentStage) => Promise<boolean>;
    clearPulumiLock: (stage: DeploymentStage) => Promise<void>;
    checkAndCleanPulumiLock: (stage: DeploymentStage) => Promise<void>;
    getFileLock: (stage: DeploymentStage) => Promise<DeploymentLock | null>;
    acquireLock: (stage: DeploymentStage) => Promise<DeploymentLock>;
    releaseLock: (lock: DeploymentLock) => Promise<void>;
};
//# sourceMappingURL=manager.d.ts.map