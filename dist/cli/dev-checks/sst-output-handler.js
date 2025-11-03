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
        this.errorBuffer = []; // Keep recent lines for context
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
            // CRITICAL ERROR PATTERNS - These are deployment killers
            // These are the exact errors that caused your stuck state issue
            criticalErrors: {
                cloudFrontInUse: /(Cannot delete|delete.*KeyValueStore|KeyValueStore.*in use|Distribution.*InProgress)/i,
                resourceInUse: /(ResourceInUseException|Resource.*in use|Cannot update.*in use)/i,
                stateCorruption: /(state.*corrupt|Pulumi.*state.*error|checkpoint.*invalid)/i,
                deploymentFailed: /(Deployment.*failed|Stack.*failed|Update failed)/i,
                iamRoleDrift: /(IAM.*role.*not found|Role.*does not exist|Principal.*invalid)/i,
            },
        };
        this.verbose = options.verbose;
        this.projectRoot = options.projectRoot;
        this.onCriticalError = options.onCriticalError;
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
        // Keep last 10 lines for context
        this.errorBuffer.push(trimmed);
        if (this.errorBuffer.length > 10) {
            this.errorBuffer.shift();
        }
        // CRITICAL ERROR DETECTION - Stop SST if we detect deployment killers
        this.detectCriticalErrors(trimmed);
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
    /**
     * Detect critical errors that should stop the deployment
     * This is the KEY feature that prevents your exact issue:
     * "CloudFront fails → SST continues → IAM role never updates"
     */
    detectCriticalErrors(line) {
        const patterns = this.PATTERNS.criticalErrors;
        // CloudFront KeyValueStore in use - THIS IS YOUR EXACT ISSUE
        if (patterns.cloudFrontInUse.test(line)) {
            this.emitCriticalError({
                type: 'cloudfront_stuck',
                message: 'CloudFront KeyValueStore is in use - cannot update',
                rawOutput: this.errorBuffer.join('\n'),
                suggestedFix: [
                    'CloudFront is stuck in "InProgress" state.',
                    'SST will silently fail and leave your state corrupt.',
                    '',
                    'Fix:',
                    '1. Wait 5-15 minutes for CloudFront to finish propagating',
                    '2. Run: deploy-kit recover cloudfront',
                    '3. Or manually detach KeyValueStore from function in AWS Console',
                ].join('\n'),
            });
            return;
        }
        // Generic resource in use
        if (patterns.resourceInUse.test(line)) {
            this.emitCriticalError({
                type: 'resource_in_use',
                message: 'AWS resource is in use and cannot be updated',
                rawOutput: this.errorBuffer.join('\n'),
                suggestedFix: [
                    'An AWS resource is locked by another operation.',
                    'SST might continue but leave your state inconsistent.',
                    '',
                    'Fix:',
                    '1. Check AWS Console for resources in "InProgress" or "Updating" state',
                    '2. Wait for operations to complete',
                    '3. Run: deploy-kit recover dev',
                ].join('\n'),
            });
            return;
        }
        // State corruption
        if (patterns.stateCorruption.test(line)) {
            this.emitCriticalError({
                type: 'state_corruption',
                message: 'Pulumi state file is corrupted',
                rawOutput: this.errorBuffer.join('\n'),
                suggestedFix: [
                    'Pulumi state is corrupted or invalid.',
                    '',
                    'Fix:',
                    '1. Back up .sst directory: cp -r .sst .sst.backup',
                    '2. Run: deploy-kit recover state',
                    '3. If recovery fails, delete .sst and redeploy',
                ].join('\n'),
            });
            return;
        }
        // Deployment failed
        if (patterns.deploymentFailed.test(line)) {
            this.emitCriticalError({
                type: 'deployment_failed',
                message: 'SST deployment failed',
                rawOutput: this.errorBuffer.join('\n'),
                suggestedFix: [
                    'Deployment failed. SST may have left resources in inconsistent state.',
                    '',
                    'Fix:',
                    '1. Check error output above',
                    '2. Run: deploy-kit doctor',
                    '3. Fix issues and retry',
                ].join('\n'),
            });
            return;
        }
        // IAM role drift - might indicate state corruption
        if (patterns.iamRoleDrift.test(line)) {
            this.emitCriticalError({
                type: 'state_corruption',
                message: 'IAM role does not exist - state out of sync',
                rawOutput: this.errorBuffer.join('\n'),
                suggestedFix: [
                    'SST state thinks IAM role exists, but AWS says it doesn\'t.',
                    'This is exactly what happens after CloudFront fails.',
                    '',
                    'Fix:',
                    '1. Run: deploy-kit recover state',
                    '2. Or delete .sst and redeploy',
                ].join('\n'),
            });
            return;
        }
    }
    /**
     * Emit critical error via callback
     */
    emitCriticalError(error) {
        if (this.onCriticalError) {
            this.onCriticalError(error);
        }
        else {
            // No callback - just show the error prominently
            console.log('\n');
            console.log(chalk.bgRed.white.bold(' CRITICAL ERROR '));
            console.log(chalk.red(`\n${error.message}\n`));
            console.log(chalk.yellow(error.suggestedFix));
            console.log('\n');
        }
    }
}
