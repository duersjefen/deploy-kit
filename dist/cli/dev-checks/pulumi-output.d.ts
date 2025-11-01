/**
 * Pulumi Output Misuse Check
 * Detects incorrect usage of Pulumi Outputs in sst.config.ts
 *
 * Common mistakes:
 * - Using Outputs directly in arrays without .apply()
 * - Using Outputs in template literals without pulumi.interpolate
 *
 * These cause the infamous "Partition 1 is not valid" error.
 */
import type { CheckResult } from './types.js';
export declare function createPulumiOutputUsageCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=pulumi-output.d.ts.map