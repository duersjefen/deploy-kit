import { DeploymentStage, DeploymentLock } from '../types.js';
/**
 * Lock management: prevents concurrent deployments
 * Dual-lock system:
 *   1. File-based lock (.deployment-lock-{stage}) - prevents human-triggered concurrent deploys
 *   2. Pulumi lock detection - detects infrastructure state locks
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