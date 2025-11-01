/**
 * Diff Formatter - CLI-Friendly Configuration Diff Output
 *
 * Formats configuration diffs for terminal display with colors and alignment.
 * Provides human-readable output for reviewing deployment changes before execution.
 *
 * @example
 * ```typescript
 * const oldConfig = { port: 3000, ssl: true };
 * const newConfig = { port: 3001, ssl: true, workers: 4 };
 * const diff = createDiff(oldConfig, newConfig);
 * const formatted = formatDiffForTerminal(diff);
 * console.log(formatted);
 * ```
 */
import { DiffResult } from './diff-utils.js';
/**
 * Format options for diff display
 */
export interface FormatOptions {
    /** Include colors in output (default: true) */
    colors?: boolean;
    /** Show context lines around changes (default: true) */
    context?: boolean;
    /** Maximum line width (default: 120) */
    lineWidth?: number;
    /** Include summary statistics (default: true) */
    summary?: boolean;
    /** Group changes by type (default: true) */
    groupByType?: boolean;
}
/**
 * Format diff for terminal display with ANSI colors
 *
 * Outputs:
 * - Additions in green
 * - Removals in red
 * - Modifications in yellow
 * - Summary statistics at bottom
 *
 * @param diff - DiffResult to format
 * @param options - Formatting options
 * @returns Formatted string ready for console output
 *
 * @example
 * ```typescript
 * const diff = createDiff(old, new);
 * console.log(formatDiffForTerminal(diff));
 * // Output with colors and structured layout
 * ```
 */
export declare function formatDiffForTerminal(diff: DiffResult, options?: FormatOptions): string;
/**
 * Format diff as a concise single-line summary
 *
 * @param diff - DiffResult to summarize
 * @returns Single-line summary string
 *
 * @example
 * ```typescript
 * const summary = formatDiffSummary(diff);
 * console.log(summary); // "3 changes: +1 added, -1 removed, ~1 modified"
 * ```
 */
export declare function formatDiffSummary(diff: DiffResult): string;
/**
 * Format diff as JSON for programmatic use
 *
 * @param diff - DiffResult to format
 * @returns JSON string
 *
 * @example
 * ```typescript
 * const json = formatDiffAsJSON(diff);
 * const parsed = JSON.parse(json);
 * ```
 */
export declare function formatDiffAsJSON(diff: DiffResult): string;
/**
 * Format diff for GitHub-style markdown display
 *
 * @param diff - DiffResult to format
 * @returns Markdown string
 *
 * @example
 * ```typescript
 * const markdown = formatDiffAsMarkdown(diff);
 * console.log(markdown); // Markdown-formatted output
 * ```
 */
export declare function formatDiffAsMarkdown(diff: DiffResult): string;
//# sourceMappingURL=diff-formatter.d.ts.map