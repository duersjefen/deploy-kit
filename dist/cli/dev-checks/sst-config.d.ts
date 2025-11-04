/**
 * SST Config Validation Check
 * Ensures sst.config.ts exists, has valid syntax, and detects common configuration issues
 */
import type { CheckResult } from './types.js';
export declare function createSstConfigCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=sst-config.d.ts.map