import { ProjectConfig, DeploymentStage } from '../types.js';
/**
 * Database backup management
 * - Exports DynamoDB to S3 with versioning
 * - Restores from previous backups
 * - Maintains backup history
 */
export declare function getBackupManager(config: ProjectConfig, projectRoot?: string): {
    backup: (stage: DeploymentStage) => Promise<string>;
    restore: (stage: DeploymentStage, backupPath: string) => Promise<void>;
    listBackups: (stage: DeploymentStage) => Promise<string[]>;
};
//# sourceMappingURL=manager.d.ts.map