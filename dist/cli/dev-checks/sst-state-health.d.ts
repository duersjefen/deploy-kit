/**
 * SST State Health Check (Enhanced)
 *
 * Detects stuck SST deployments and state machine issues:
 * - CloudFront resources stuck in "Deploying" state
 * - Pulumi state file corruption or locks
 * - IAM role drift (state vs reality)
 * - KeyValueStore conflicts
 *
 * This prevents the exact issue you hit:
 * "SST tries to update CloudFront → fails → continues anyway → IAM role never updates"
 */
import type { CheckResult } from './types.js';
import type { ProjectConfig } from '../../types.js';
/**
 * Create enhanced SST state health check
 */
export declare function createSstStateHealthCheck(projectRoot: string, config: ProjectConfig | null): () => Promise<CheckResult>;
//# sourceMappingURL=sst-state-health.d.ts.map