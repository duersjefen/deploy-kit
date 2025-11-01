/**
 * @duersjefen/deploy-kit
 *
 * Production-grade deployment system for SST + Next.js + DynamoDB applications
 * with comprehensive safety checks, health validation, and recovery management
 *
 * Features:
 * - Database backup before deployment (rollback capability)
 * - Enhanced health checks (endpoints, database, CloudFront)
 * - Progress monitoring with real-time status display
 * - Comprehensive deployment status reporting
 * - Automatic recovery from failed deployments
 * - Origin Access Control (OAC) security validation
 * - Cache invalidation with wait logic
 */
export { DeploymentKit } from './deployer.js';
export { getBackupManager } from './backup/manager.js';
export { getHealthChecker } from './health/checker.js';
export { getProgressMonitor } from './monitoring/progress.js';
export type { StageProgress } from './monitoring/progress.js';
export { getStatusChecker } from './status/checker.js';
export { getRecoveryManager } from './recovery/manager.js';
export { getLockManager } from './locks/manager.js';
export { getPreDeploymentChecks } from './safety/pre-deploy.js';
export { getPostDeploymentChecks } from './safety/post-deploy.js';
export type { ProjectConfig, DeploymentStage, DeploymentResult, HealthCheck, StageConfig, DeploymentLock, DeploymentHooks, InfrastructureType, DatabaseType, } from './types.js';
export declare const VERSION = "1.0.0";
export declare const FEATURES: string[];
//# sourceMappingURL=index.d.ts.map