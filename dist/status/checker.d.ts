import { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Comprehensive deployment status checking
 * - Check locks across all stages
 * - Display CloudFront status
 * - Show deployment timing
 * - Detect conflicts and issues
 */
export declare function getStatusChecker(config: ProjectConfig, projectRoot: string): {
    checkAllStages: () => Promise<void>;
    checkStage: (stage: DeploymentStage) => Promise<void>;
    checkLockStatus: (stage: DeploymentStage) => Promise<string>;
    checkCloudFrontStatus: (stage: DeploymentStage) => Promise<string>;
    checkDatabaseStatus: (stage: DeploymentStage) => Promise<string>;
    checkDomainAccessibility: (stage: DeploymentStage) => Promise<string>;
};
//# sourceMappingURL=checker.d.ts.map