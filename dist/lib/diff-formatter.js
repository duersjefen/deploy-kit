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
import chalk from 'chalk';
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
export function formatDiffForTerminal(diff, options = {}) {
    const { colors = true, context = true, lineWidth = 120, summary = true, groupByType = true, } = options;
    const lines = [];
    // Header
    if (diff.identical) {
        lines.push(colors ? chalk.green('✅ No changes detected') : '✅ No changes detected');
        return lines.join('\n');
    }
    lines.push(colors ? chalk.bold.cyan('📋 Configuration Changes') : '📋 Configuration Changes');
    lines.push('-'.repeat(lineWidth));
    lines.push('');
    if (groupByType) {
        // Group changes by type
        formatChangesByType(diff, lines, colors, lineWidth);
    }
    else {
        // Show changes in order
        formatChangesSequential(diff, lines, colors, lineWidth);
    }
    // Summary
    if (summary) {
        lines.push('');
        lines.push('-'.repeat(lineWidth));
        lines.push(formatSummary(diff, colors));
    }
    return lines.join('\n');
}
/**
 * Format changes grouped by type (additions, removals, modifications)
 *
 * @internal
 */
function formatChangesByType(diff, lines, colors, lineWidth) {
    // Additions
    const additions = diff.changes.filter(c => c.type === 'added');
    if (additions.length > 0) {
        lines.push(colors ? chalk.green.bold('✨ ADDITIONS') : '✨ ADDITIONS');
        for (const change of additions) {
            lines.push(formatChange(change, colors, lineWidth));
        }
        lines.push('');
    }
    // Removals
    const removals = diff.changes.filter(c => c.type === 'removed');
    if (removals.length > 0) {
        lines.push(colors ? chalk.red.bold('❌ REMOVALS') : '❌ REMOVALS');
        for (const change of removals) {
            lines.push(formatChange(change, colors, lineWidth));
        }
        lines.push('');
    }
    // Modifications
    const modifications = diff.changes.filter(c => c.type === 'modified');
    if (modifications.length > 0) {
        lines.push(colors ? chalk.yellow.bold('🔄 MODIFICATIONS') : '🔄 MODIFICATIONS');
        for (const change of modifications) {
            lines.push(formatChange(change, colors, lineWidth));
        }
        lines.push('');
    }
}
/**
 * Format changes in sequential order
 *
 * @internal
 */
function formatChangesSequential(diff, lines, colors, lineWidth) {
    for (const change of diff.changes) {
        lines.push(formatChange(change, colors, lineWidth));
    }
}
/**
 * Format a single configuration change
 *
 * @internal
 */
function formatChange(change, colors, lineWidth) {
    const icon = getChangeIcon(change.type, colors);
    const pathDisplay = colors ? chalk.bold.cyan(change.path) : change.path;
    let line = `  ${icon} ${pathDisplay}`;
    // Add value information
    if (change.type === 'added') {
        const newVal = formatValue(change.newValue);
        line += colors ? chalk.green(` = ${newVal}`) : ` = ${newVal}`;
    }
    else if (change.type === 'removed') {
        const oldVal = formatValue(change.oldValue);
        line += colors ? chalk.red(` (was: ${oldVal})`) : ` (was: ${oldVal})`;
    }
    else if (change.type === 'modified') {
        const oldVal = formatValue(change.oldValue);
        const newVal = formatValue(change.newValue);
        line += colors
            ? chalk.yellow(` ${oldVal} → ${newVal}`)
            : ` ${oldVal} → ${newVal}`;
    }
    // Truncate if too long
    if (line.length > lineWidth) {
        line = line.substring(0, lineWidth - 3) + '...';
    }
    return line;
}
/**
 * Get icon for change type
 *
 * @internal
 */
function getChangeIcon(type, colors) {
    const icons = {
        added: '➕',
        removed: '➖',
        modified: '🔄',
    };
    const icon = icons[type] || '•';
    if (!colors) {
        return icon;
    }
    if (type === 'added') {
        return chalk.green(icon);
    }
    else if (type === 'removed') {
        return chalk.red(icon);
    }
    else if (type === 'modified') {
        return chalk.yellow(icon);
    }
    return icon;
}
/**
 * Format a value for display
 *
 * @internal
 */
function formatValue(value) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (typeof value === 'string')
        return `"${value}"`;
    if (typeof value === 'number')
        return value.toString();
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (Array.isArray(value))
        return `[${value.length} items]`;
    if (typeof value === 'object')
        return '{...}';
    return String(value);
}
/**
 * Format summary statistics
 *
 * @internal
 */
function formatSummary(diff, colors) {
    const parts = [];
    if (diff.added > 0) {
        const added = colors ? chalk.green(`+${diff.added}`) : `+${diff.added}`;
        parts.push(added);
    }
    if (diff.removed > 0) {
        const removed = colors ? chalk.red(`-${diff.removed}`) : `-${diff.removed}`;
        parts.push(removed);
    }
    if (diff.modified > 0) {
        const modified = colors ? chalk.yellow(`~${diff.modified}`) : `~${diff.modified}`;
        parts.push(modified);
    }
    const summary = parts.join(' ');
    const total = diff.added + diff.removed + diff.modified;
    if (colors) {
        return chalk.bold(`Summary: ${summary} (${total} total)`);
    }
    else {
        return `Summary: ${summary} (${total} total)`;
    }
}
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
export function formatDiffSummary(diff) {
    const total = diff.added + diff.removed + diff.modified;
    if (total === 0) {
        return '✅ No changes';
    }
    const parts = [];
    if (diff.added > 0)
        parts.push(`+${diff.added} added`);
    if (diff.removed > 0)
        parts.push(`-${diff.removed} removed`);
    if (diff.modified > 0)
        parts.push(`~${diff.modified} modified`);
    return `${total} change${total === 1 ? '' : 's'}: ${parts.join(', ')}`;
}
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
export function formatDiffAsJSON(diff) {
    return JSON.stringify(diff, null, 2);
}
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
export function formatDiffAsMarkdown(diff) {
    const lines = [];
    if (diff.identical) {
        lines.push('✅ No changes detected');
        return lines.join('\n');
    }
    lines.push('## Configuration Changes');
    lines.push('');
    // Additions
    const additions = diff.changes.filter(c => c.type === 'added');
    if (additions.length > 0) {
        lines.push('### ✨ Additions');
        lines.push('');
        for (const change of additions) {
            lines.push(`- \`${change.path}\` = ${formatValue(change.newValue)}`);
        }
        lines.push('');
    }
    // Removals
    const removals = diff.changes.filter(c => c.type === 'removed');
    if (removals.length > 0) {
        lines.push('### ❌ Removals');
        lines.push('');
        for (const change of removals) {
            lines.push(`- \`${change.path}\` (was: ${formatValue(change.oldValue)})`);
        }
        lines.push('');
    }
    // Modifications
    const modifications = diff.changes.filter(c => c.type === 'modified');
    if (modifications.length > 0) {
        lines.push('### 🔄 Modifications');
        lines.push('');
        for (const change of modifications) {
            const oldVal = formatValue(change.oldValue);
            const newVal = formatValue(change.newValue);
            lines.push(`- \`${change.path}\`: ${oldVal} → ${newVal}`);
        }
        lines.push('');
    }
    // Summary
    lines.push('---');
    lines.push(`**Summary:** ${formatDiffSummary(diff)}`);
    return lines.join('\n');
}
