/**
 * SST Output Handler
 * Processes, filters, and formats SST dev output for better readability
 */
export interface SstOutputHandlerOptions {
    verbose: boolean;
    projectRoot: string;
}
/**
 * Handles streaming SST output with intelligent filtering and formatting
 */
export declare class SstOutputHandler {
    private verbose;
    private projectRoot;
    private buffer;
    private hasShownReady;
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
}
//# sourceMappingURL=sst-output-handler.d.ts.map