/**
 * AWS Credentials Check
 * Validates AWS credentials are configured and accessible
 */
import type { ProjectConfig } from '../../types.js';
import type { CheckResult } from './types.js';
export declare function createAwsCredentialsCheck(projectRoot: string, config: ProjectConfig | null): () => Promise<CheckResult>;
//# sourceMappingURL=aws-credentials.d.ts.map