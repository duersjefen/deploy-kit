/**
 * Next.js Canary Features Check
 * Detects canary-only Next.js features being used with stable Next.js versions
 *
 * Features like turbopackFileSystemCache and cacheComponents are only available
 * in Next.js canary releases and will cause errors on stable versions.
 */
import type { CheckResult } from './types.js';
export declare function createNextJsCanaryFeaturesCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=nextjs-canary.d.ts.map