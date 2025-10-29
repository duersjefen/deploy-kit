/**
 * @martijn/deploy-kit
 *
 * Reusable deployment system for SST + Next.js + DynamoDB applications
 * with comprehensive safety checks and CloudFront validation
 */

export { DeploymentKit } from './deployer.js';
export type {
  ProjectConfig,
  DeploymentStage,
  DeploymentResult,
  HealthCheck,
  StageConfig,
  DeploymentLock,
  DeploymentHooks,
  InfrastructureType,
  DatabaseType,
} from './types.js';

// Version
export const VERSION = '1.0.0';
