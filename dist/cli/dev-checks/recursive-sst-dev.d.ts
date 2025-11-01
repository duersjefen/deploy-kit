/**
 * Recursive SST Dev Script Check
 * Detects package.json dev scripts that call 'sst dev', which causes infinite recursion
 *
 * Issue: SST internally runs `npm run dev` to start your framework, so if your
 * dev script calls `sst dev`, it creates an infinite loop.
 */
import type { CheckResult } from './types.js';
export declare function createRecursiveSstDevCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=recursive-sst-dev.d.ts.map