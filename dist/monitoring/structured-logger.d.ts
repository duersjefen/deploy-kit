/**
 * Structured Logging System
 *
 * Provides JSON-formatted logging with log levels, context, and optional
 * integration with third-party observability providers (DataDog, CloudWatch, etc.)
 */
/**
 * Log severity levels (compatible with syslog and standard logging frameworks)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/**
 * Structured log entry with contextual metadata
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    traceId?: string;
    spanId?: string;
    userId?: string;
    deploymentId?: string;
    stage?: string;
}
/**
 * Logger configuration
 */
export interface LoggerConfig {
    minLevel?: LogLevel;
    enableConsole?: boolean;
    enableFile?: boolean;
    enableRemote?: boolean;
    remoteProvider?: 'datadog' | 'cloudwatch' | 'otel' | 'custom';
    serviceName?: string;
    version?: string;
    environment?: 'development' | 'staging' | 'production';
}
/**
 * Structured logger for deployments with optional observability integration
 */
export declare class StructuredLogger {
    private config;
    private buffer;
    private bufferSize;
    constructor(config?: LoggerConfig);
    /**
     * Check if log level should be processed
     *
     * @param level - Log level to check
     * @returns true if level meets minimum threshold
     */
    private shouldLog;
    /**
     * Create a structured log entry
     *
     * @param level - Log severity level
     * @param message - Log message
     * @param context - Additional contextual data
     * @returns Formatted log entry
     */
    private createEntry;
    /**
     * Get contextual data (trace ID, deployment ID, etc.)
     *
     * @returns Contextual metadata
     */
    private getContextualData;
    /**
     * Format log entry as JSON
     *
     * @param entry - Log entry to format
     * @returns JSON string
     */
    private formatAsJson;
    /**
     * Output log entry to appropriate destination
     *
     * @param entry - Log entry to output
     */
    private output;
    /**
     * Flush buffered logs to remote service
     */
    private flushToRemote;
    /**
     * Log debug message
     *
     * @param message - Debug message
     * @param context - Optional context data
     */
    debug(message: string, context?: Record<string, unknown>): void;
    /**
     * Log info message
     *
     * @param message - Info message
     * @param context - Optional context data
     */
    info(message: string, context?: Record<string, unknown>): void;
    /**
     * Log warning message
     *
     * @param message - Warning message
     * @param context - Optional context data
     */
    warn(message: string, context?: Record<string, unknown>): void;
    /**
     * Log error message
     *
     * @param message - Error message
     * @param error - Error object (optional)
     * @param context - Optional context data
     */
    error(message: string, error?: Error, context?: Record<string, unknown>): void;
    /**
     * Log fatal error (usually application will exit)
     *
     * @param message - Fatal error message
     * @param error - Error object (optional)
     * @param context - Optional context data
     */
    fatal(message: string, error?: Error, context?: Record<string, unknown>): void;
    /**
     * Set current trace context for distributed tracing
     *
     * @param traceId - Distributed trace ID
     * @param spanId - Current span ID
     */
    setTraceContext(traceId: string, spanId: string): void;
    /**
     * Set deployment context
     *
     * @param deploymentId - Deployment ID
     * @param stage - Deployment stage
     */
    setDeploymentContext(deploymentId: string, stage: string): void;
    /**
     * Get current buffer size
     *
     * @returns Number of buffered log entries
     */
    getBufferSize(): number;
    /**
     * Clear buffer
     */
    clearBuffer(): void;
    /**
     * Flush all remaining logs
     */
    flush(): void;
}
/**
 * Get or create global logger instance
 *
 * @param config - Logger configuration (only used on first call)
 * @returns Global logger instance
 */
export declare function getLogger(config?: LoggerConfig): StructuredLogger;
/**
 * Reset global logger (useful for testing)
 */
export declare function resetLogger(): void;
//# sourceMappingURL=structured-logger.d.ts.map