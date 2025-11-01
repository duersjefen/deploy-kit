import { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Post-deployment safety checks
 * Validates deployment was successful
 */
export declare function getPostDeploymentChecks(config: ProjectConfig): {
    checkApplicationHealth: (stage: DeploymentStage) => Promise<void>;
    validateCloudFrontOAC: (stage: DeploymentStage) => Promise<void>;
    checkDatabaseConnection: (stage: DeploymentStage) => Promise<void>;
    run: (stage: DeploymentStage) => Promise<void>;
};
//# sourceMappingURL=post-deploy.d.ts.map