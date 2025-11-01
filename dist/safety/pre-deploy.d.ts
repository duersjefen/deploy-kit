import { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Pre-deployment safety checks
 * Ensures the project is ready for deployment
 */
export declare function getPreDeploymentChecks(config: ProjectConfig, projectRoot?: string): {
    checkGitStatus: () => Promise<void>;
    checkAwsCredentials: () => Promise<void>;
    runTests: () => Promise<void>;
    checkLambdaReservedVars: () => Promise<void>;
    checkSslCertificate: (stage: DeploymentStage) => Promise<void>;
    run: (stage: DeploymentStage) => Promise<void>;
};
//# sourceMappingURL=pre-deploy.d.ts.map