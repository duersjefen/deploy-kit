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
 * Orchestrates the development environment startup:
 * 1. Load project configuration
 * 2. Run pre-flight checks (unless skipped)
 * 3. Start SST dev server
 *
 * @param projectRoot - Absolute path to project root (defaults to cwd)
 * @param options - Command options (skipChecks, port, verbose)
 *
 * @example
 * ```typescript
 * await handleDevCommand('/path/to/project', { port: 3001 });
 * ```
 */
export declare function handleDevCommand(projectRoot?: string, options?: DevOptions): Promise<void>;
//# sourceMappingURL=dev.d.ts.map