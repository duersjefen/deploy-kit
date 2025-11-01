/**
 * Running SST Process Check
 * Detects zombie SST dev processes from previous crashed sessions
 */
import type { CheckResult } from './types.js';
/**
 * Detect running SST dev processes
 *
 * Searches for:
 * - sst dev (main process)
 * - sst ui (SST console UI)
 * - node processes running SST-related commands
 */
export declare function createRunningSstProcessCheck(projectRoot: string, verbose?: boolean): () => Promise<CheckResult>;
//# sourceMappingURL=running-sst-processes.d.ts.map