/**
 * Enhanced SST Deployment with timeout detection and diagnostics
 *
 * Features:
 * - Timeout detection (fails after 15 minutes)
 * - Real-time output streaming
 * - CloudFormation event monitoring
 * - Automatic diagnostics on hang
 * - Detailed logging for debugging
 */
import type { DeploymentStage, ProjectConfig } from '../types.js';
interface SSTDeploymentOptions {
    stage: DeploymentStage;
    projectRoot: string;
    config: ProjectConfig;
    awsProfile?: string;
    timeoutMinutes?: number;
    logFile?: string;
}
/**
 * Deploy with SST, including timeout detection and real-time monitoring
 */
export declare function deploySSTWithMonitoring(options: SSTDeploymentOptions): Promise<void>;
export {};
//# sourceMappingURL=sst-deployer.d.ts.map