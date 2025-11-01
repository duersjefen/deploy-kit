/**
 * Lambda Reserved Environment Variables Check
 * Detects usage of reserved AWS Lambda environment variables in SST config
 */
import type { CheckResult } from './types.js';
export declare function createLambdaReservedVarsCheck(projectRoot: string, verbose?: boolean): () => Promise<CheckResult>;
//# sourceMappingURL=lambda-reserved-vars.d.ts.map