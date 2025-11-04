/**
 * Pre-Deployment Check Runner
 *
 * Executes individual checks with timeout and streaming output
 */
import type { CheckConfig, CheckResult } from './types.js';
/**
 * Run a single pre-deployment check
 *
 * Executes the check command with timeout protection and streams output to console.
 * The check fails if:
 * - Command exits with non-zero code
 * - Command times out
 * - Command cannot be spawned
 *
 * @param check - Check configuration with command and timeout
 * @param cwd - Working directory to run the check in
 * @returns Promise that resolves with check result
 *
 * @example
 * ```typescript
 * const result = await runCheck({
 *   name: 'Type Check',
 *   command: 'npm run typecheck',
 *   timeout: 30000
 * }, '/path/to/project');
 *
 * if (result.success) {
 *   console.log('Type check passed!');
 * }
 * ```
 */
export declare function runCheck(check: CheckConfig, cwd: string): Promise<CheckResult>;
//# sourceMappingURL=check-runner.d.ts.map