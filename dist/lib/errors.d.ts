/**
 * Error handling utilities for consistent error management
 */
/**
 * Custom error class for deployment failures
 */
export declare class DeploymentError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, code: string, details?: Record<string, unknown> | undefined);
}
/**
 * Custom error class for configuration errors
 */
export declare class ConfigurationError extends Error {
    readonly configPath?: string | undefined;
    readonly validationErrors?: string[] | undefined;
    constructor(message: string, configPath?: string | undefined, validationErrors?: string[] | undefined);
}
/**
 * Wraps a function with error handling and optional exit
 *
 * @example
 * const config = withErrorHandling(
 *   () => JSON.parse(readFileSync(path, 'utf-8')),
 *   { exitOnError: true, errorMessage: 'Failed to read config' }
 * );
 */
export declare function withErrorHandling<T>(fn: () => T, options?: {
    exitOnError?: boolean;
    errorMessage?: string;
    errorCode?: string;
}): T;
/**
 * Wraps an async function with error handling
 *
 * @example
 * await withAsyncErrorHandling(
 *   async () => await deploy(),
 *   { exitOnError: true, errorMessage: 'Deployment failed' }
 * );
 */
export declare function withAsyncErrorHandling<T>(fn: () => Promise<T>, options?: {
    exitOnError?: boolean;
    errorMessage?: string;
    errorCode?: string;
}): Promise<T>;
/**
 * Formats an error for logging
 */
export declare function formatError(error: unknown): string;
//# sourceMappingURL=errors.d.ts.map