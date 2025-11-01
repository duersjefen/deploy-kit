import { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Deployment recovery and resource cleanup
 * - Detect orphaned CloudFront distributions
 * - Remove incomplete deployments
 * - Clean up stuck Pulumi state
 * - Reset locks safely
 */
export declare function getRecoveryManager(config: ProjectConfig, projectRoot?: string): {
    detectOrphanedDistributions: () => Promise<void>;
    cleanupIncompleteDeployment: (stage: DeploymentStage) => Promise<void>;
    clearFileLocks: (projectRoot: string, stage: DeploymentStage) => Promise<void>;
    unlockPulumiState: (stage: DeploymentStage) => Promise<void>;
    performFullRecovery: (stage: DeploymentStage) => Promise<void>;
};
//# sourceMappingURL=manager.d.ts.map