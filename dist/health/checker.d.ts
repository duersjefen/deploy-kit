import { ProjectConfig, DeploymentStage, HealthCheck } from '../types.js';
/**
 * Create a comprehensive health checking system for deployed applications
 *
 * Provides methods to validate:
 * - HTTP endpoint responses and status codes
 * - Database (DynamoDB) connectivity
 * - CloudFront distribution origin configuration
 * - Origin Access Control (OAC) security settings
 * - Response content and response times
 *
 * @param config - Project configuration with stage and health check settings
 * @returns Health checker object with check methods
 *
 * @example
 * ```typescript
 * const checker = getHealthChecker(config);
 * const stagingHealthy = await checker.runAll('staging');
 * if (stagingHealthy) {
 *   console.log('Deployment successful!');
 * }
 * ```
 */
export declare function getHealthChecker(config: ProjectConfig): {
    check: (check: HealthCheck, stage: DeploymentStage) => Promise<boolean>;
    checkDatabase: (stage: DeploymentStage) => Promise<boolean>;
    checkCloudFrontOrigin: (stage: DeploymentStage) => Promise<boolean>;
    checkOriginAccessControl: (stage: DeploymentStage) => Promise<boolean>;
    runAll: (stage: DeploymentStage) => Promise<boolean>;
};
//# sourceMappingURL=checker.d.ts.map