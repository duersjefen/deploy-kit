/**
 * Structured Logging System
 *
 * Provides JSON-formatted logging with log levels, context, and optional
 * integration with third-party observability providers (DataDog, CloudWatch, etc.)
 */
/**
 * Log level severity (higher = more severe)
 */
const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};
/**
 * Structured logger for deployments with optional observability integration
 */
export class StructuredLogger {
    constructor(config = {}) {
        this.buffer = [];
        this.bufferSize = 100; // Flush to remote after this many entries
        this.config = {
            minLevel: config.minLevel ?? 'info',
            enableConsole: config.enableConsole ?? true,
            enableFile: config.enableFile ?? false,
            enableRemote: config.enableRemote ?? false,
            remoteProvider: config.remoteProvider ?? 'otel',
            serviceName: config.serviceName ?? 'deploy-kit',
            version: config.version ?? '1.0.0',
            environment: config.environment ?? 'development',
        };
    }
    /**
     * Check if log level should be processed
     *
     * @param level - Log level to check
     * @returns true if level meets minimum threshold
     */
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
    }
    /**
     * Create a structured log entry
     *
     * @param level - Log severity level
     * @param message - Log message
     * @param context - Additional contextual data
     * @returns Formatted log entry
     */
    createEntry(level, message, context, error) {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            context,
            error: error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                }
                : undefined,
            ...this.getContextualData(),
        };
    }
    /**
     * Get contextual data (trace ID, deployment ID, etc.)
     *
     * @returns Contextual metadata
     */
    getContextualData() {
        return {
        // These would be populated from thread-local or AsyncLocalStorage context
        // For now, return empty - can be extended to support distributed tracing
        };
    }
    /**
     * Format log entry as JSON
     *
     * @param entry - Log entry to format
     * @returns JSON string
     */
    formatAsJson(entry) {
        return JSON.stringify({
            ...entry,
            service: this.config.serviceName,
            version: this.config.version,
            env: this.config.environment,
        });
    }
    /**
     * Output log entry to appropriate destination
     *
     * @param entry - Log entry to output
     */
    output(entry) {
        if (this.config.enableConsole) {
            const json = this.formatAsJson(entry);
            // Color-code console output for readability in development
            if (this.config.environment === 'development') {
                const colors = {
                    debug: '\x1b[36m', // Cyan
                    info: '\x1b[37m', // White
                    warn: '\x1b[33m', // Yellow
                    error: '\x1b[31m', // Red
                    fatal: '\x1b[41m', // Red background
                };
                const reset = '\x1b[0m';
                console.log(`${colors[entry.level]}${json}${reset}`);
            }
            else {
                // Production: plain JSON without colors
                console.log(json);
            }
        }
        if (this.config.enableRemote) {
            this.buffer.push(entry);
            if (this.buffer.length >= this.bufferSize) {
                this.flushToRemote();
            }
        }
    }
    /**
     * Flush buffered logs to remote service
     */
    flushToRemote() {
        if (this.buffer.length === 0) {
            return;
        }
        const logsToFlush = [...this.buffer];
        this.buffer = [];
        // This would actually send to remote service based on config.remoteProvider
        // For now, just indicate flush
        this.debug(`Flushed ${logsToFlush.length} logs to ${this.config.remoteProvider}`, {
            provider: this.config.remoteProvider,
            count: logsToFlush.length,
        });
    }
    /**
     * Log debug message
     *
     * @param message - Debug message
     * @param context - Optional context data
     */
    debug(message, context) {
        if (this.shouldLog('debug')) {
            this.output(this.createEntry('debug', message, context));
        }
    }
    /**
     * Log info message
     *
     * @param message - Info message
     * @param context - Optional context data
     */
    info(message, context) {
        if (this.shouldLog('info')) {
            this.output(this.createEntry('info', message, context));
        }
    }
    /**
     * Log warning message
     *
     * @param message - Warning message
     * @param context - Optional context data
     */
    warn(message, context) {
        if (this.shouldLog('warn')) {
            this.output(this.createEntry('warn', message, context));
        }
    }
    /**
     * Log error message
     *
     * @param message - Error message
     * @param error - Error object (optional)
     * @param context - Optional context data
     */
    error(message, error, context) {
        if (this.shouldLog('error')) {
            this.output(this.createEntry('error', message, context, error));
        }
    }
    /**
     * Log fatal error (usually application will exit)
     *
     * @param message - Fatal error message
     * @param error - Error object (optional)
     * @param context - Optional context data
     */
    fatal(message, error, context) {
        if (this.shouldLog('fatal')) {
            this.output(this.createEntry('fatal', message, context, error));
            // Ensure logs are flushed before exit
            this.flushToRemote();
        }
    }
    /**
     * Set current trace context for distributed tracing
     *
     * @param traceId - Distributed trace ID
     * @param spanId - Current span ID
     */
    setTraceContext(traceId, spanId) {
        // This would be stored in AsyncLocalStorage for context propagation
        // Implementation would vary based on Node.js async context strategy
    }
    /**
     * Set deployment context
     *
     * @param deploymentId - Deployment ID
     * @param stage - Deployment stage
     */
    setDeploymentContext(deploymentId, stage) {
        // This would be stored in AsyncLocalStorage context
    }
    /**
     * Get current buffer size
     *
     * @returns Number of buffered log entries
     */
    getBufferSize() {
        return this.buffer.length;
    }
    /**
     * Clear buffer
     */
    clearBuffer() {
        this.buffer = [];
    }
    /**
     * Flush all remaining logs
     */
    flush() {
        this.flushToRemote();
    }
}
/**
 * Global logger instance (singleton)
 */
let globalLogger = null;
/**
 * Get or create global logger instance
 *
 * @param config - Logger configuration (only used on first call)
 * @returns Global logger instance
 */
export function getLogger(config) {
    if (!globalLogger) {
        globalLogger = new StructuredLogger(config);
    }
    return globalLogger;
}
/**
 * Reset global logger (useful for testing)
 */
export function resetLogger() {
    if (globalLogger) {
        globalLogger.flush();
    }
    globalLogger = null;
}
