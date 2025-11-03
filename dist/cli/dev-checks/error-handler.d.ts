/**
 * SST Dev Error Handler
 * Translates cryptic SST errors into actionable guidance
 *
 * UX Improvements (v2.7.0) - Lock Error Handling:
 * - Interactive recovery for "concurrent update" / lock errors
 * - Automatic stage detection from .sst directory
 * - Contextual explanation of lock cause
 * - Non-interactive mode support (falls back to manual instructions)
 *
 * BEFORE:
 * 🔧 Recovery Steps:
 *   1. Run: npx sst unlock
 *   2. Retry: npx deploy-kit dev
 *
 * AFTER:
 * 🔒 SST Lock Detected
 *
 * The deployment is locked (usually from a previous session that didn't exit cleanly).
 *
 * Stage: staging
 * Lock Type: Pulumi state lock
 * Likely Cause: Previous 'npx deploy-kit dev' or 'sst dev' crashed
 *
 * 🔧 Auto-Recovery Available:
 *   Would you like to automatically unlock? [Y/n]: _
 */
/**
 * Handle and provide guidance for common SST dev errors
 *
 * Converts technical error messages into user-friendly recovery steps
 * Parses .sst/log/sst.log for detailed error information
 */
export declare function handleSstDevError(error: Error, projectRoot?: string): Promise<void>;
//# sourceMappingURL=error-handler.d.ts.map