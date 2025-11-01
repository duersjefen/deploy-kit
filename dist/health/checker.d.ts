import { ProjectConfig, DeploymentStage, HealthCheck } from '../types.js';
/**
 * Comprehensive health checking system
 * - HTTP endpoint validation
 * - Database connectivity testing
 * - Response time validation
 * - CloudFront origin validation
 * - Search text validation
 */
export declare function getHealthChecker(config: ProjectConfig): {
    check: (check: HealthCheck, stage: DeploymentStage) => Promise<boolean>;
    checkDatabase: (stage: DeploymentStage) => Promise<boolean>;
    checkCloudFrontOrigin: (stage: DeploymentStage) => Promise<boolean>;
    checkOriginAccessControl: (stage: DeploymentStage) => Promise<boolean>;
    runAll: (stage: DeploymentStage) => Promise<boolean>;
};
//# sourceMappingURL=checker.d.ts.map