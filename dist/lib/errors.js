/**
 * Error handling utilities for consistent error management
 */
/**
 * Custom error class for deployment failures
 */
export class DeploymentError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'DeploymentError';
        Object.setPrototypeOf(this, DeploymentError.prototype);
    }
}
/**
 * Custom error class for configuration errors
 */
export class ConfigurationError extends Error {
    constructor(message, code = 'CONFIG_ERROR', configPath, validationErrors) {
        super(message);
        this.code = code;
        this.configPath = configPath;
        this.validationErrors = validationErrors;
        this.name = 'ConfigurationError';
        Object.setPrototypeOf(this, ConfigurationError.prototype);
    }
}
/**
 * Custom error class for AWS/external service failures
 */
export class ExternalServiceError extends Error {
    constructor(message, code = 'SERVICE_ERROR', originalError) {
        super(message);
        this.code = code;
        this.originalError = originalError;
        this.name = 'ExternalServiceError';
        Object.setPrototypeOf(this, ExternalServiceError.prototype);
    }
}
/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
    constructor(message, code = 'VALIDATION_ERROR', validationErrors) {
        super(message);
        this.code = code;
        this.validationErrors = validationErrors;
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
/**
 * Standard error codes for consistent error handling across the application
 */
export const ERROR_CODES = {
    // Deployment errors
    DEPLOYMENT_BUILD_FAILED: 'DEPLOYMENT_BUILD_FAILED',
    DEPLOYMENT_LOCKED: 'DEPLOYMENT_LOCKED',
    DEPLOYMENT_ROLLBACK_FAILED: 'DEPLOYMENT_ROLLBACK_FAILED',
    DEPLOYMENT_LOCK_TIMEOUT: 'DEPLOYMENT_LOCK_TIMEOUT',
    // AWS/CloudFront errors
    CLOUDFRONT_NOT_FOUND: 'CLOUDFRONT_NOT_FOUND',
    CLOUDFRONT_OPERATION_FAILED: 'CLOUDFRONT_OPERATION_FAILED',
    CLOUDFRONT_VALIDATION_FAILED: 'CLOUDFRONT_VALIDATION_FAILED',
    // Certificate/DNS errors
    CERT_NOT_FOUND: 'CERT_NOT_FOUND',
    CERT_VALIDATION_FAILED: 'CERT_VALIDATION_FAILED',
    DNS_RECORD_NOT_FOUND: 'DNS_RECORD_NOT_FOUND',
    DNS_OPERATION_FAILED: 'DNS_OPERATION_FAILED',
    DNS_VALIDATION_TIMEOUT: 'DNS_VALIDATION_TIMEOUT',
    // Configuration errors
    CONFIG_INVALID: 'CONFIG_INVALID',
    CONFIG_MISSING_REQUIRED: 'CONFIG_MISSING_REQUIRED',
    CONFIG_FILE_NOT_FOUND: 'CONFIG_FILE_NOT_FOUND',
    // Validation errors
    VALIDATION_INVALID_DOMAIN: 'VALIDATION_INVALID_DOMAIN',
    VALIDATION_INVALID_STAGE: 'VALIDATION_INVALID_STAGE',
    VALIDATION_INVALID_CONFIG: 'VALIDATION_INVALID_CONFIG',
    // Service errors
    SERVICE_TIMEOUT: 'SERVICE_TIMEOUT',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    SERVICE_AUTHENTICATION_FAILED: 'SERVICE_AUTHENTICATION_FAILED',
    // Git errors
    GIT_UNCOMMITTED_CHANGES: 'GIT_UNCOMMITTED_CHANGES',
    GIT_OPERATION_FAILED: 'GIT_OPERATION_FAILED',
    // General errors
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};
/**
 * Wraps a function with error handling and optional exit
 *
 * @example
 * const config = withErrorHandling(
 *   () => JSON.parse(readFileSync(path, 'utf-8')),
 *   { exitOnError: true, errorMessage: 'Failed to read config' }
 * );
 */
export function withErrorHandling(fn, options = {}) {
    try {
        return fn();
    }
    catch (error) {
        const message = options.errorMessage ?? 'An error occurred';
        if (error instanceof Error) {
            console.error(`${message}: ${error.message}`);
        }
        else {
            console.error(message);
        }
        if (options.exitOnError) {
            process.exit(1);
        }
        throw error;
    }
}
/**
 * Wraps an async function with error handling
 *
 * @example
 * await withAsyncErrorHandling(
 *   async () => await deploy(),
 *   { exitOnError: true, errorMessage: 'Deployment failed' }
 * );
 */
export async function withAsyncErrorHandling(fn, options = {}) {
    try {
        return await fn();
    }
    catch (error) {
        const message = options.errorMessage ?? 'An error occurred';
        if (error instanceof DeploymentError) {
            console.error(`${message} [${error.code}]: ${error.message}`);
            if (error.details) {
                console.error('Details:', error.details);
            }
        }
        else if (error instanceof Error) {
            console.error(`${message}: ${error.message}`);
        }
        else {
            console.error(message);
        }
        if (options.exitOnError) {
            process.exit(1);
        }
        throw error;
    }
}
/**
 * Formats an error for logging
 */
/**
 * Formats an error for logging with code and context
 */
export function formatError(error) {
    if (error instanceof DeploymentError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof ConfigurationError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof ExternalServiceError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof ValidationError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
/**
 * Gets the error code from any error type
 */
export function getErrorCode(error) {
    if (error instanceof DeploymentError)
        return error.code;
    if (error instanceof ConfigurationError)
        return error.code;
    if (error instanceof ExternalServiceError)
        return error.code;
    if (error instanceof ValidationError)
        return error.code;
    return ERROR_CODES.UNKNOWN_ERROR;
}
/**
 * Creates a standard error wrapper for any error type
 */
export function wrapError(error, code, message) {
    return new DeploymentError(message, code, {
        originalError: error instanceof Error ? error.message : String(error),
        originalStack: error instanceof Error ? error.stack : undefined,
    });
}
