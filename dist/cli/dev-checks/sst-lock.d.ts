/**
 * SST Lock Check
 * Detects and optionally clears stale SST lock files with interactive recovery
 *
 * UX Improvements (v2.7.0):
 * - Interactive prompt asking user if they want to auto-unlock
 * - Stage detection (shows which stage is locked)
 * - Contextual explanation of why lock exists
 * - Non-interactive mode support (CI/CD)
 *
 * BEFORE:
 * ❌ SST lock detected (previous session didn't exit cleanly)
 *    Fix: Run npx sst unlock
 *
 * AFTER:
 * 🔒 SST Lock Detected
 *
 * A previous session didn't exit cleanly, leaving a lock file.
 *
 * Stage: staging
 * Lock Type: Pulumi state lock
 * Location: .sst/lock
 *
 * 🔧 Auto-Recovery Available:
 *   Clear the lock and continue? [Y/n]: _
 */
import type { CheckResult } from './types.js';
export declare function createSstLockCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=sst-lock.d.ts.map