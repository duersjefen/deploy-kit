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
    }
}
/**
 * Custom error class for configuration errors
 */
export class ConfigurationError extends Error {
    constructor(message, configPath, validationErrors) {
        super(message);
        this.configPath = configPath;
        this.validationErrors = validationErrors;
        this.name = 'ConfigurationError';
    }
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
export function formatError(error) {
    if (error instanceof DeploymentError) {
        return `[${error.code}] ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
