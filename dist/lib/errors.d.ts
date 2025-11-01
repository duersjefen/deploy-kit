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
    readonly code: string;
    readonly configPath?: string | undefined;
    readonly validationErrors?: string[] | undefined;
    constructor(message: string, code?: string, configPath?: string | undefined, validationErrors?: string[] | undefined);
}
/**
 * Custom error class for AWS/external service failures
 */
export declare class ExternalServiceError extends Error {
    readonly code: string;
    readonly originalError?: unknown | undefined;
    constructor(message: string, code?: string, originalError?: unknown | undefined);
}
/**
 * Custom error class for validation failures
 */
export declare class ValidationError extends Error {
    readonly code: string;
    readonly validationErrors?: string[] | undefined;
    constructor(message: string, code?: string, validationErrors?: string[] | undefined);
}
/**
 * Standard error codes for consistent error handling across the application
 */
export declare const ERROR_CODES: {
    readonly DEPLOYMENT_BUILD_FAILED: "DEPLOYMENT_BUILD_FAILED";
    readonly DEPLOYMENT_LOCKED: "DEPLOYMENT_LOCKED";
    readonly DEPLOYMENT_ROLLBACK_FAILED: "DEPLOYMENT_ROLLBACK_FAILED";
    readonly DEPLOYMENT_LOCK_TIMEOUT: "DEPLOYMENT_LOCK_TIMEOUT";
    readonly CLOUDFRONT_NOT_FOUND: "CLOUDFRONT_NOT_FOUND";
    readonly CLOUDFRONT_OPERATION_FAILED: "CLOUDFRONT_OPERATION_FAILED";
    readonly CLOUDFRONT_VALIDATION_FAILED: "CLOUDFRONT_VALIDATION_FAILED";
    readonly CERT_NOT_FOUND: "CERT_NOT_FOUND";
    readonly CERT_VALIDATION_FAILED: "CERT_VALIDATION_FAILED";
    readonly DNS_RECORD_NOT_FOUND: "DNS_RECORD_NOT_FOUND";
    readonly DNS_OPERATION_FAILED: "DNS_OPERATION_FAILED";
    readonly DNS_VALIDATION_TIMEOUT: "DNS_VALIDATION_TIMEOUT";
    readonly CONFIG_INVALID: "CONFIG_INVALID";
    readonly CONFIG_MISSING_REQUIRED: "CONFIG_MISSING_REQUIRED";
    readonly CONFIG_FILE_NOT_FOUND: "CONFIG_FILE_NOT_FOUND";
    readonly VALIDATION_INVALID_DOMAIN: "VALIDATION_INVALID_DOMAIN";
    readonly VALIDATION_INVALID_STAGE: "VALIDATION_INVALID_STAGE";
    readonly VALIDATION_INVALID_CONFIG: "VALIDATION_INVALID_CONFIG";
    readonly SERVICE_TIMEOUT: "SERVICE_TIMEOUT";
    readonly SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE";
    readonly SERVICE_AUTHENTICATION_FAILED: "SERVICE_AUTHENTICATION_FAILED";
    readonly GIT_UNCOMMITTED_CHANGES: "GIT_UNCOMMITTED_CHANGES";
    readonly GIT_OPERATION_FAILED: "GIT_OPERATION_FAILED";
    readonly UNKNOWN_ERROR: "UNKNOWN_ERROR";
};
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
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
/**
 * Formats an error for logging with code and context
 */
export declare function formatError(error: unknown): string;
/**
 * Gets the error code from any error type
 */
export declare function getErrorCode(error: unknown): string;
/**
 * Creates a standard error wrapper for any error type
 */
export declare function wrapError(error: unknown, code: ErrorCode, message: string): DeploymentError;
//# sourceMappingURL=errors.d.ts.map