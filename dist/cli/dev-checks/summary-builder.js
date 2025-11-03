/**
 * Summary Builder
 * Creates deployment summary tables using cli-table3
 */
import Table from 'cli-table3';
import chalk from 'chalk';
/**
 * Table configuration constants
 */
const TABLE_CONFIG = {
    COMPONENT_WIDTH: 25,
    COUNT_WIDTH: 10,
    DETAILS_WIDTH: 35,
    OPERATION_WIDTH: 40,
    AVG_DURATION_WIDTH: 15,
};
export class SummaryBuilder {
    /**
     * Build deployment summary table
     */
    buildDeploymentSummary(summary) {
        const table = new Table({
            head: [chalk.bold.cyan('Component'), chalk.bold.cyan('Count'), chalk.bold.cyan('Details')],
            colWidths: [TABLE_CONFIG.COMPONENT_WIDTH, TABLE_CONFIG.COUNT_WIDTH, TABLE_CONFIG.DETAILS_WIDTH],
            style: {
                head: [],
                border: ['gray'],
            },
        });
        // Lambdas
        if (summary.lambdaCount > 0) {
            table.push([
                'Lambda Functions',
                chalk.green(summary.lambdaCount.toString()),
                `Avg: ${Math.round(summary.avgLambdaDuration)}ms`,
            ]);
        }
        // Stacks
        if (summary.stackCount > 0) {
            table.push(['Stacks', chalk.green(summary.stackCount.toString()), 'Deployed']);
        }
        // Errors
        if (summary.errors > 0) {
            table.push(['Errors', chalk.red(summary.errors.toString()), 'See above']);
        }
        // Warnings
        if (summary.warnings > 0) {
            table.push(['Warnings', chalk.yellow(summary.warnings.toString()), 'Review recommended']);
        }
        // Info messages suppressed
        if (summary.infoMessagesSuppressed > 0) {
            table.push([
                'Info Messages',
                chalk.gray(summary.infoMessagesSuppressed.toString()),
                chalk.gray('Suppressed (use --verbose)'),
            ]);
        }
        // Total duration
        if (summary.totalDuration > 0) {
            const durationSeconds = (summary.totalDuration / 1000).toFixed(1);
            table.push(['Total Duration', chalk.cyan(`${durationSeconds}s`), '']);
        }
        return table.toString();
    }
    /**
     * Build grouped messages table
     */
    buildGroupedMessagesTable(messages) {
        if (messages.length === 0) {
            return '';
        }
        const table = new Table({
            head: [chalk.bold.cyan('Operation'), chalk.bold.cyan('Count'), chalk.bold.cyan('Avg Duration')],
            colWidths: [TABLE_CONFIG.OPERATION_WIDTH, TABLE_CONFIG.COUNT_WIDTH, TABLE_CONFIG.AVG_DURATION_WIDTH],
            style: {
                head: [],
                border: ['gray'],
            },
        });
        for (const msg of messages) {
            const avgDuration = msg.metadata?.avgDuration
                ? `${Math.round(msg.metadata.avgDuration)}ms`
                : 'N/A';
            table.push([msg.representative, chalk.cyan(msg.count.toString()), chalk.gray(avgDuration)]);
        }
        return table.toString();
    }
    /**
     * Build simple compact list (alternative to table)
     */
    buildCompactSummary(summary) {
        const lines = [];
        lines.push(chalk.bold.green('\n✨ Deployment Complete!\n'));
        if (summary.lambdaCount > 0) {
            lines.push(`${chalk.green('✓')} ${summary.lambdaCount} Lambda function${summary.lambdaCount > 1 ? 's' : ''} deployed`);
        }
        if (summary.stackCount > 0) {
            lines.push(`${chalk.green('✓')} ${summary.stackCount} stack${summary.stackCount > 1 ? 's' : ''} deployed`);
        }
        if (summary.errors > 0) {
            lines.push(`${chalk.red('✗')} ${summary.errors} error${summary.errors > 1 ? 's' : ''} encountered`);
        }
        if (summary.warnings > 0) {
            lines.push(`${chalk.yellow('⚠')} ${summary.warnings} warning${summary.warnings > 1 ? 's' : ''}`);
        }
        if (summary.infoMessagesSuppressed > 0) {
            lines.push(`${chalk.gray('ℹ')} ${summary.infoMessagesSuppressed} info messages suppressed`);
        }
        if (summary.totalDuration > 0) {
            const durationSeconds = (summary.totalDuration / 1000).toFixed(1);
            lines.push(`${chalk.cyan('⏱')} Completed in ${durationSeconds}s`);
        }
        return lines.join('\n');
    }
}
