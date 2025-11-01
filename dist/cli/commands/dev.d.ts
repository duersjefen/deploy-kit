/**
 * SST Development Command with Pre-flight Checks
 * Wraps `sst dev` with automatic error detection and recovery
 *
 * This is a thin orchestrator that delegates to specialized check modules.
 * Individual checks are in src/cli/dev-checks/
 */
import { type DevOptions } from '../dev-checks/sst-starter.js';
export type { DevOptions } from '../dev-checks/sst-starter.js';
export type { CheckResult } from '../dev-checks/types.js';
/**
 * Main dev command entry point
 *
 * Orchestrates the development environment startup with automatic error detection:
 * 1. Load and validate project configuration from .deploy-config.json
 * 2. Run pre-flight checks (AWS credentials, SST locks, recursive invocation, etc.)
 * 3. Start SST dev server with optional port override
 *
 * Pre-flight checks can be skipped with --skip-checks but this is not recommended
 * as checks catch common configuration errors early.
 *
 * @param projectRoot - Absolute path to project root (defaults to process.cwd())
 * @param options - Command options with optional port, skipChecks, and verbose flags
 * @returns Promise that resolves when dev server starts (or rejects on error)
 *
 * @throws {Error} If configuration is invalid or checks fail
 *
 * @example
 * ```typescript
 * await handleDevCommand('/path/to/project', { port: 3001 });
 * // Runs checks and starts dev server on port 3001
 * ```
 */
export declare function handleDevCommand(projectRoot?: string, options?: DevOptions): Promise<void>;
//# sourceMappingURL=dev.d.ts.map