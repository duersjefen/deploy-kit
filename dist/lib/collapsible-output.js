/**
 * Collapsible Terminal Output
 *
 * Utility for collapsing verbose output to summary lines after completion.
 * Uses ANSI escape codes to clear lines and move cursor.
 */
/**
 * Check if terminal supports ANSI escape codes
 * Disabled in CI environments or non-TTY outputs
 */
function supportsCollapsing() {
    // Disable in CI environments
    if (process.env.CI === 'true') {
        return false;
    }
    // Disable if not a TTY (piped output)
    if (!process.stdout.isTTY) {
        return false;
    }
    return true;
}
/**
 * Collapsible output section
 *
 * Tracks lines written and can collapse them to a summary
 */
export class CollapsibleOutput {
    constructor() {
        this.lineCount = 0;
        this.headerLine = '';
        this.enabled = supportsCollapsing();
    }
    /**
     * Start a new collapsible section with a header
     */
    startSection(header) {
        this.headerLine = header;
        this.lineCount = 0;
        // Print header
        console.log(header);
        this.lineCount++;
    }
    /**
     * Write a line to the collapsible section
     */
    writeLine(text) {
        process.stdout.write(text);
        // Count newlines in the text
        const newlines = (text.match(/\n/g) || []).length;
        this.lineCount += newlines;
    }
    /**
     * Collapse the section to a single summary line
     *
     * @param summary - The summary line to show (e.g., "✅ Tests passed (1.2s)")
     */
    collapse(summary) {
        if (!this.enabled || this.lineCount === 0) {
            // Can't collapse - just print summary below
            console.log(summary);
            return;
        }
        // Move cursor up to the start of the section
        // Clear all lines
        for (let i = 0; i < this.lineCount; i++) {
            // Move cursor up one line
            process.stdout.write('\x1b[1A');
            // Clear the entire line
            process.stdout.write('\x1b[2K');
        }
        // Move cursor to beginning of line
        process.stdout.write('\r');
        // Print collapsed summary
        console.log(summary);
        // Reset line count
        this.lineCount = 0;
    }
    /**
     * Keep the section expanded (for failures)
     * Just adds a summary line below without collapsing
     */
    keepExpanded(summary) {
        console.log(summary);
        this.lineCount = 0;
    }
    /**
     * Reset the section
     */
    reset() {
        this.lineCount = 0;
        this.headerLine = '';
    }
}
/**
 * Create a singleton instance for use across the application
 */
export const collapsibleOutput = new CollapsibleOutput();
