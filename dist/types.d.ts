/**
 * Configuration types for deployment kit
 */
export type DeploymentStage = 'dev' | 'staging' | 'production';
export type InfrastructureType = 'sst-serverless' | 'ec2-docker' | 'custom';
export type DatabaseType = 'dynamodb' | 'postgresql' | 'mysql';
export interface StageConfig {
    /** Domain name for this stage */
    domain?: string;
    /** AWS region for this stage */
    awsRegion?: string;
    /** Whether to require manual confirmation before deployment */
    requiresConfirmation?: boolean;
    /** Skip health checks for this stage */
    skipHealthChecks?: boolean;
    /** Skip cache invalidation for this stage */
    skipCacheInvalidation?: boolean;
    /** Custom stage name in SST (default: stage name) */
    sstStageName?: string;
    /** DynamoDB table name (for DynamoDB projects) */
    dynamoTableName?: string;
}
export interface HealthCheck {
    /** URL to check (relative or absolute) */
    url: string;
    /** Expected HTTP status code (default: 200) */
    expectedStatus?: number;
    /** Timeout in milliseconds (default: 5000) */
    timeout?: number;
    /** Text to search for in response (optional) */
    searchText?: string;
    /** Custom name for this check */
    name?: string;
}
export interface DeploymentHooks {
    /** Run before pre-deployment checks */
    preDeploy?: string;
    /** Run after build but before deployment */
    postBuild?: string;
    /** Run after successful deployment */
    postDeploy?: string;
    /** Run if deployment fails */
    onError?: string;
}
export interface HostedZone {
    /** Domain name (e.g., 'gabs-massage.de') */
    domain: string;
    /** Route53 hosted zone ID (e.g., 'Z...') */
    zoneId: string;
}
export interface ProjectConfig {
    /** Project name (e.g., 'gabs-massage') */
    projectName: string;
    /** Display name (optional, default: projectName) */
    displayName?: string;
    /** Infrastructure type */
    infrastructure: InfrastructureType;
    /** Database type */
    database?: DatabaseType;
    /** Available deployment stages */
    stages: DeploymentStage[];
    /** Stage-specific configuration */
    stageConfig: Record<DeploymentStage, StageConfig>;
    /** Health check endpoints to validate after deployment */
    healthChecks?: HealthCheck[];
    /** Lifecycle hooks */
    hooks?: DeploymentHooks;
    /** AWS profile to use (optional) */
    awsProfile?: string;
    /** Main domain (used in defaults) */
    mainDomain?: string;
    /** Git remote name (default: 'origin') */
    gitRemote?: string;
    /** Require clean git status before deploy */
    requireCleanGit?: boolean;
    /** Run tests before deploy */
    runTestsBeforeDeploy?: boolean;
    /** Path to custom deployment script (relative to project root) */
    customDeployScript?: string;
    /** S3 bucket for database backups (optional) */
    backupBucket?: string;
    /** Route53 hosted zones for DNS validation (optional) */
    hostedZones?: HostedZone[];
}
export interface DeploymentResult {
    success: boolean;
    stage: DeploymentStage;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    message: string;
    error?: string;
    details: {
        gitStatusOk: boolean;
        buildsOk: boolean;
        testsOk: boolean;
        deploymentOk: boolean;
        healthChecksOk: boolean;
        cacheInvalidatedOk?: boolean;
        backupPath?: string;
    };
}
export interface DeploymentLock {
    stage: DeploymentStage;
    createdAt: Date;
    expiresAt: Date;
    reason?: string;
}
//# sourceMappingURL=types.d.ts.map