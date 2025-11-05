/**
 * Setup Claude Code for the Web (CCW) integration
 * Idempotent - can run multiple times to update
 *
 * Follows official CCW best practices:
 * - Uses .claude/ directory (official location)
 * - Creates .claude/settings.json with SessionStart hooks
 * - Auto-installs dependencies on session start
 * - Uses CLAUDE_CODE_REMOTE detection
 * - Uses @ sourcing pattern in CLAUDE.md
 */
export declare function setupCCW(projectRoot?: string): Promise<void>;
//# sourceMappingURL=ccw.d.ts.map