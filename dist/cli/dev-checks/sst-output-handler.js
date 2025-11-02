/**
 * SST Output Handler
 * Processes, filters, and formats SST dev output for better readability
 */
import chalk from 'chalk';
/**
 * Handles streaming SST output with intelligent filtering and formatting
 */
export class SstOutputHandler {
    constructor(options) {
        this.buffer = '';
        this.hasShownReady = false;
        // Patterns to detect important SST events
        this.PATTERNS = {
            // SST lifecycle events
            starting: /SST.*starting/i,
            building: /(Building|Compiling).*Lambda/i,
            deploying: /Deploying.*stack/i,
            deployed: /✓.*deployed/i,
            ready: /(Ready|Dev server ready|Listening on)/i,
            // Error patterns
            error: /(Error|ERROR|Failed|FAILED)/,
            warning: /(Warning|WARN)/,
            // Noise to filter out in non-verbose mode
            noise: /(debug:|DEBUG:|Pulumi.*preview|aws-sdk)/i,
        };
        this.verbose = options.verbose;
        this.projectRoot = options.projectRoot;
    }
    /**
     * Process stdout data from SST
     */
    processStdout(data) {
        const text = data.toString();
        this.buffer += text;
        // Process complete lines
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
            this.processLine(line, 'stdout');
        }
    }
    /**
     * Process stderr data from SST
     */
    processStderr(data) {
        const text = data.toString();
        this.buffer += text;
        // Process complete lines
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
            this.processLine(line, 'stderr');
        }
    }
    /**
     * Flush any remaining buffer on process exit
     */
    flush() {
        if (this.buffer.trim()) {
            this.processLine(this.buffer, 'stdout');
            this.buffer = '';
        }
    }
    /**
     * Process a single line of output
     */
    processLine(line, stream) {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        // Always show errors
        if (this.PATTERNS.error.test(trimmed)) {
            console.log(chalk.red(`❌ ${trimmed}`));
            return;
        }
        // Always show warnings
        if (this.PATTERNS.warning.test(trimmed)) {
            console.log(chalk.yellow(`⚠️  ${trimmed}`));
            return;
        }
        // Show ready state prominently
        if (this.PATTERNS.ready.test(trimmed) && !this.hasShownReady) {
            this.hasShownReady = true;
            console.log(chalk.bold.green('\n✅ SST Dev Server Ready!\n'));
            console.log(chalk.cyan(trimmed));
            return;
        }
        // Show important lifecycle events
        if (this.PATTERNS.deploying.test(trimmed)) {
            console.log(chalk.cyan(`🚀 ${trimmed}`));
            return;
        }
        if (this.PATTERNS.deployed.test(trimmed)) {
            console.log(chalk.green(`✓ ${trimmed}`));
            return;
        }
        if (this.PATTERNS.building.test(trimmed)) {
            console.log(chalk.blue(`🔨 ${trimmed}`));
            return;
        }
        // Filter noise in non-verbose mode
        if (!this.verbose && this.PATTERNS.noise.test(trimmed)) {
            return;
        }
        // In verbose mode, show everything
        if (this.verbose) {
            if (stream === 'stderr') {
                console.log(chalk.gray(`[stderr] ${trimmed}`));
            }
            else {
                console.log(chalk.gray(trimmed));
            }
            return;
        }
        // In non-verbose mode, show other important lines
        // (lines that don't match noise patterns)
        console.log(trimmed);
    }
}
