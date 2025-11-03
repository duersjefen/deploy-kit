/**
 * Enhanced Output Handler
 * Unified Terminal UX system (DEP-8, DEP-9, DEP-5)
 *
 * Replaces the old SstOutputHandler with:
 * - Smart message grouping and deduplication
 * - Progress indicators with ora
 * - Summary tables with cli-table3
 * - Configurable output profiles
 */
import chalk from 'chalk';
import { MessageGrouper } from './message-grouper.js';
import { ProgressTracker } from './progress-tracker.js';
import { SummaryBuilder } from './summary-builder.js';
export class EnhancedOutputHandler {
    constructor(options, grouper, progress, summary) {
        this.buffer = '';
        // State tracking
        this.startTime = Date.now();
        this.hasShownReady = false;
        this.errorCount = 0;
        this.warningCount = 0;
        this.infoSuppressedCount = 0;
        this.lambdaCount = 0;
        this.stackCount = 0;
        this.lambdaDurations = [];
        // Patterns to detect SST events
        this.PATTERNS = {
            // Lifecycle events
            starting: /SST.*starting/i,
            building: /(Building|Compiling).*Lambda/i,
            deploying: /Deploying.*stack/i,
            deployed: /✓.*deployed/i,
            ready: /(Ready|Dev server ready|Listening on|Server is ready)/i,
            // Error patterns
            error: /(Error|ERROR|Failed|FAILED|✖)/,
            warning: /(Warning|WARN|⚠)/,
            // Info/debug patterns (for suppression)
            info: /(debug:|DEBUG:|Pulumi.*preview|aws-sdk|trace:|TRACE:)/i,
            // Progress patterns
            lambdaDeploy: /✓\s*Deployed Lambda.*\((\d+)ms\)/i,
            stackDeploy: /✓.*stack.*deployed/i,
        };
        this.projectRoot = options.projectRoot;
        this.noGroup = options.noGroup ?? false;
        // Determine profile (verbose flag overrides)
        if (options.verbose) {
            this.profile = 'verbose';
        }
        else {
            this.profile = options.profile || 'normal';
        }
        // hideInfo flag or profile-based
        this.hideInfo = options.hideInfo ?? (this.profile === 'silent');
        // Initialize components (with DI support for testing)
        this.grouper = grouper ?? new MessageGrouper();
        this.progress = progress ?? new ProgressTracker();
        this.summary = summary ?? new SummaryBuilder();
    }
    /**
     * Process stdout data from SST
     * @throws {Error} If data is not a valid Buffer
     */
    processStdout(data) {
        // Validate input
        if (!Buffer.isBuffer(data)) {
            console.error('❌ Invalid input to processStdout: expected Buffer, got', typeof data);
            return;
        }
        try {
            const text = data.toString('utf-8');
            this.buffer += text;
            // Process complete lines
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';
            for (const line of lines) {
                this.processLine(line, 'stdout');
            }
        }
        catch (error) {
            // Handle encoding errors or other unexpected issues
            if (error instanceof Error) {
                console.error(`❌ Error processing stdout: ${error.message}`);
            }
        }
    }
    /**
     * Process stderr data from SST
     * @throws {Error} If data is not a valid Buffer
     */
    processStderr(data) {
        // Validate input
        if (!Buffer.isBuffer(data)) {
            console.error('❌ Invalid input to processStderr: expected Buffer, got', typeof data);
            return;
        }
        try {
            const text = data.toString('utf-8');
            this.buffer += text;
            // Process complete lines
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';
            for (const line of lines) {
                this.processLine(line, 'stderr');
            }
        }
        catch (error) {
            // Handle encoding errors or other unexpected issues
            if (error instanceof Error) {
                console.error(`❌ Error processing stderr: ${error.message}`);
            }
        }
    }
    /**
     * Flush any remaining buffer and show final summary
     */
    flush() {
        try {
            // Process any remaining buffered content
            if (this.buffer.trim()) {
                this.processLine(this.buffer, 'stdout');
                this.buffer = '';
            }
            // Stop any active progress
            this.progress.stop();
            // Show grouped messages summary
            if (!this.noGroup) {
                try {
                    const grouped = this.grouper.getGroupedMessages();
                    if (grouped.length > 0) {
                        console.log(chalk.bold.cyan('\n📊 Summary:\n'));
                        console.log(this.summary.buildGroupedMessagesTable(grouped));
                    }
                }
                catch (error) {
                    if (error instanceof Error) {
                        console.error(`⚠️  Error building grouped messages: ${error.message}`);
                    }
                }
            }
            // Show final deployment summary (if not silent)
            if (this.profile !== 'silent') {
                try {
                    const deploymentSummary = {
                        lambdaCount: this.lambdaCount,
                        stackCount: this.stackCount,
                        avgLambdaDuration: this.lambdaDurations.length > 0
                            ? this.lambdaDurations.reduce((a, b) => a + b, 0) / this.lambdaDurations.length
                            : 0,
                        totalDuration: Date.now() - this.startTime,
                        errors: this.errorCount,
                        warnings: this.warningCount,
                        infoMessagesSuppressed: this.infoSuppressedCount,
                    };
                    if (deploymentSummary.lambdaCount > 0 || deploymentSummary.stackCount > 0) {
                        console.log(chalk.bold.green('\n✨ Dev Server Ready!\n'));
                        console.log(this.summary.buildDeploymentSummary(deploymentSummary));
                    }
                }
                catch (error) {
                    if (error instanceof Error) {
                        console.error(`⚠️  Error building deployment summary: ${error.message}`);
                    }
                }
            }
        }
        catch (error) {
            // Catch-all for any unexpected errors during flush
            if (error instanceof Error) {
                console.error(`❌ Unexpected error during flush: ${error.message}`);
            }
        }
    }
    /**
     * Process a single line of output (orchestrator method)
     */
    processLine(line, stream) {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        // Extract metrics (Lambda durations, stack counts)
        this.extractMetrics(trimmed);
        // Profile-based filtering (silent mode special case)
        if (this.shouldFilterBySilentProfile(trimmed)) {
            return;
        }
        // Match against patterns with priority
        const match = this.matchPattern(trimmed);
        // Handle high-priority patterns (errors, warnings, ready state)
        if (match) {
            if (this.handleHighPriorityPattern(match, trimmed)) {
                return; // Handled, don't process further
            }
        }
        // Filter info/debug messages based on profile
        if (this.shouldFilterInfoMessage(trimmed)) {
            return;
        }
        // Handle phase transitions (building, deploying)
        if (this.handlePhaseTransition(trimmed)) {
            return;
        }
        // Try grouping message (if enabled)
        if (this.tryGroupMessage(trimmed)) {
            return;
        }
        // Display ungroupable message
        this.displayLine(trimmed, stream);
    }
    /**
     * Extract metrics from line (Lambda durations, stack counts)
     */
    extractMetrics(line) {
        // Extract Lambda duration if present
        const lambdaMatch = line.match(this.PATTERNS.lambdaDeploy);
        if (lambdaMatch) {
            this.lambdaCount++;
            this.lambdaDurations.push(parseInt(lambdaMatch[1], 10));
        }
        // Track stack deployments
        if (this.PATTERNS.stackDeploy.test(line)) {
            this.stackCount++;
        }
    }
    /**
     * Check if line should be filtered in silent profile
     * Returns true if filtered (don't process further)
     */
    shouldFilterBySilentProfile(line) {
        if (this.profile !== 'silent') {
            return false;
        }
        // Silent: Only errors and ready state
        if (this.PATTERNS.error.test(line)) {
            this.progress.stop();
            this.errorCount++;
            console.log(chalk.red(`\n❌ ${line}\n`));
            return true;
        }
        if (this.PATTERNS.ready.test(line) && !this.hasShownReady) {
            this.hasShownReady = true;
            this.progress.succeedPhase('Dev Server Ready');
            console.log(chalk.bold.green(`\n✅ ${line}\n`));
            return true;
        }
        // In silent mode, filter everything else
        return true;
    }
    /**
     * Match line against all patterns with priority
     * Returns pattern match with highest priority, or null
     */
    matchPattern(line) {
        // Validate input
        if (typeof line !== 'string') {
            console.error('❌ matchPattern: Invalid input type, expected string');
            return null;
        }
        const patterns = [
            { name: 'error', regex: this.PATTERNS.error, priority: 1 },
            { name: 'warning', regex: this.PATTERNS.warning, priority: 2 },
            { name: 'ready', regex: this.PATTERNS.ready, priority: 3 },
            { name: 'building', regex: this.PATTERNS.building, priority: 4 },
            { name: 'deploying', regex: this.PATTERNS.deploying, priority: 5 },
            { name: 'info', regex: this.PATTERNS.info, priority: 6 },
            { name: 'lambdaDeploy', regex: this.PATTERNS.lambdaDeploy, priority: 7 },
            { name: 'stackDeploy', regex: this.PATTERNS.stackDeploy, priority: 8 },
        ];
        try {
            for (const pattern of patterns) {
                if (pattern.regex.test(line)) {
                    return { name: pattern.name, priority: pattern.priority };
                }
            }
        }
        catch (error) {
            // Handle regex test errors (very rare, but possible with malformed input)
            if (error instanceof Error) {
                console.error(`⚠️  Regex match error: ${error.message}`);
            }
            return null;
        }
        return null;
    }
    /**
     * Handle high-priority patterns (errors, warnings, ready state)
     * Returns true if handled (don't process further)
     */
    handleHighPriorityPattern(match, line) {
        switch (match.name) {
            case 'error':
                this.progress.stop();
                this.errorCount++;
                console.log(chalk.red(`❌ ${line}`));
                return true;
            case 'warning':
                this.warningCount++;
                console.log(chalk.yellow(`⚠️  ${line}`));
                return true;
            case 'ready':
                if (!this.hasShownReady) {
                    this.hasShownReady = true;
                    this.progress.succeedPhase('Dev Server Ready');
                    console.log(chalk.bold.green(`\n✅ ${line}`));
                    return true;
                }
                return false;
            default:
                return false;
        }
    }
    /**
     * Check if info message should be filtered based on profile
     * Returns true if filtered (don't process further)
     */
    shouldFilterInfoMessage(line) {
        if (this.profile === 'debug') {
            return false; // Debug mode shows everything
        }
        if (this.hideInfo || this.profile === 'normal') {
            if (this.PATTERNS.info.test(line)) {
                this.infoSuppressedCount++;
                return true;
            }
        }
        return false;
    }
    /**
     * Handle phase transitions (building, deploying)
     * Returns true if handled (don't process further)
     */
    handlePhaseTransition(line) {
        // Building phase
        if (this.PATTERNS.building.test(line)) {
            if (!this.noGroup && this.profile !== 'verbose') {
                this.progress.startPhase('Building Lambda functions...');
                return true; // Don't show individual build messages
            }
            else {
                console.log(chalk.blue(`🔨 ${line}`));
                return true;
            }
        }
        // Deploying phase
        if (this.PATTERNS.deploying.test(line)) {
            if (!this.noGroup && this.profile !== 'verbose') {
                this.progress.startPhase('Deploying stacks...');
                return true;
            }
            else {
                console.log(chalk.cyan(`🚀 ${line}`));
                return true;
            }
        }
        return false;
    }
    /**
     * Try to group message (if grouping enabled)
     * Returns true if grouped (don't display)
     */
    tryGroupMessage(line) {
        if (this.noGroup || this.profile === 'verbose') {
            return false; // Grouping disabled
        }
        const shouldDisplay = this.grouper.add(line);
        if (!shouldDisplay) {
            // Message was grouped, update progress if active
            if (this.progress.isActive()) {
                const total = this.grouper.getTotalCount();
                this.progress.updatePhase(`Processing... (${total} operations)`);
            }
            return true; // Grouped, don't display
        }
        return false; // Not grouped, should display
    }
    /**
     * Display ungroupable line based on profile
     */
    displayLine(line, stream) {
        // Verbose/debug mode: show everything with stream indicator
        if (this.profile === 'verbose' || this.profile === 'debug') {
            if (stream === 'stderr') {
                console.log(chalk.gray(`[stderr] ${line}`));
            }
            else {
                console.log(chalk.gray(line));
            }
            return;
        }
        // Normal mode: show important lines
        if (this.profile === 'normal') {
            console.log(line);
        }
    }
}
