/**
 * Collapsible Terminal Output
 *
 * Utility for collapsing verbose output to summary lines after completion.
 * Uses ANSI escape codes to clear lines and move cursor.
 */
/**
 * Collapsible output section
 *
 * Tracks lines written and can collapse them to a summary
 */
export declare class CollapsibleOutput {
    private lineCount;
    private enabled;
    private headerLine;
    constructor();
    /**
     * Start a new collapsible section with a header
     */
    startSection(header: string): void;
    /**
     * Write a line to the collapsible section
     */
    writeLine(text: string): void;
    /**
     * Collapse the section to a single summary line
     *
     * @param summary - The summary line to show (e.g., "✅ Tests passed (1.2s)")
     */
    collapse(summary: string): void;
    /**
     * Keep the section expanded (for failures)
     * Just adds a summary line below without collapsing
     */
    keepExpanded(summary: string): void;
    /**
     * Reset the section
     */
    reset(): void;
}
/**
 * Create a singleton instance for use across the application
 */
export declare const collapsibleOutput: CollapsibleOutput;
//# sourceMappingURL=collapsible-output.d.ts.map