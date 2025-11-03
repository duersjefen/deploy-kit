/**
 * SST Output Handler
 * Processes, filters, and formats SST dev output for better readability
 */
export interface SstOutputHandlerOptions {
    verbose: boolean;
    projectRoot: string;
    onCriticalError?: (error: CriticalError) => void;
}
export interface CriticalError {
    type: 'cloudfront_stuck' | 'resource_in_use' | 'state_corruption' | 'deployment_failed';
    message: string;
    rawOutput: string;
    suggestedFix: string;
}
/**
 * Handles streaming SST output with intelligent filtering and formatting
 */
export declare class SstOutputHandler {
    private verbose;
    private projectRoot;
    private buffer;
    private hasShownReady;
    private onCriticalError?;
    private errorBuffer;
    private readonly PATTERNS;
    constructor(options: SstOutputHandlerOptions);
    /**
     * Process stdout data from SST
     */
    processStdout(data: Buffer): void;
    /**
     * Process stderr data from SST
     */
    processStderr(data: Buffer): void;
    /**
     * Flush any remaining buffer on process exit
     */
    flush(): void;
    /**
     * Process a single line of output
     */
    private processLine;
    /**
     * Detect critical errors that should stop the deployment
     * This is the KEY feature that prevents your exact issue:
     * "CloudFront fails → SST continues → IAM role never updates"
     */
    private detectCriticalErrors;
    /**
     * Emit critical error via callback
     */
    private emitCriticalError;
}
//# sourceMappingURL=sst-output-handler.d.ts.map