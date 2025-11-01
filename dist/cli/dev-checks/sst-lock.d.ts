/**
 * SST Lock Check
 * Detects and optionally clears stale SST lock files
 */
import type { CheckResult } from './types.js';
export declare function createSstLockCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=sst-lock.d.ts.map