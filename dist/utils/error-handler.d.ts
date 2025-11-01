/**
 * Sophisticated error handling and recovery suggestions
 * Provides intelligent guidance for common deployment issues
 */
export interface ErrorContext {
    stage: string;
    command: string;
    error: Error;
    timestamp: Date;
}
/**
 * Print sophisticated error message with recovery suggestions
 */
export declare function printErrorWithSuggestions(context: ErrorContext): void;
/**
 * Print pre-deployment validation error
 */
export declare function printValidationError(issue: string, suggestion: string): void;
/**
 * Print deployment success with metrics
 */
export declare function printDeploymentSuccess(stage: string, duration: number, metrics?: {
    checksRun?: number;
    resourcesCreated?: number;
    cacheInvalidated?: boolean;
}): void;
//# sourceMappingURL=error-handler.d.ts.map