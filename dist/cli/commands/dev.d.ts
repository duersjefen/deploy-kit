/**
 * SST Development Command with Pre-flight Checks
 * Wraps `sst dev` with automatic error detection and recovery
 */
export interface DevOptions {
    skipChecks?: boolean;
    port?: number;
    verbose?: boolean;
}
export interface CheckResult {
    passed: boolean;
    issue?: string;
    manualFix?: string;
    canAutoFix?: boolean;
    autoFix?: () => Promise<void>;
    errorType?: string;
}
/**
 * Main dev command entry point
 */
export declare function handleDevCommand(projectRoot?: string, options?: DevOptions): Promise<void>;
//# sourceMappingURL=dev.d.ts.map