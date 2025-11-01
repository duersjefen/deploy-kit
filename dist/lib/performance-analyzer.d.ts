/**
 * Performance Analysis Utilities
 *
 * Provides tools for analyzing and reporting on deployment performance metrics.
 * Tracks operation timings, identifies bottlenecks, and generates performance reports.
 *
 * @example
 * ```typescript
 * const analyzer = new PerformanceAnalyzer();
 * analyzer.start('database-check');
 * // ... perform operation ...
 * const timing = analyzer.end('database-check');
 * console.log(`Operation took ${timing.duration}ms`);
 * ```
 */
/**
 * Performance timing for a single operation
 */
export interface PerformanceTiming {
    /** Operation name */
    name: string;
    /** Duration in milliseconds */
    duration: number;
    /** When operation started */
    startTime: number;
    /** When operation ended */
    endTime: number;
    /** Optional metadata about the operation */
    metadata?: Record<string, unknown>;
}
/**
 * Summary statistics for performance metrics
 */
export interface PerformanceStats {
    /** Total operations tracked */
    count: number;
    /** Total time across all operations */
    totalTime: number;
    /** Average operation time */
    average: number;
    /** Minimum operation time */
    min: number;
    /** Maximum operation time */
    max: number;
    /** Median operation time */
    median: number;
    /** 95th percentile (P95) */
    p95: number;
    /** 99th percentile (P99) */
    p99: number;
}
/**
 * Performance analysis report
 */
export interface PerformanceReport {
    /** When report was generated */
    timestamp: Date;
    /** Total deployment time */
    totalTime: number;
    /** All operation timings */
    timings: PerformanceTiming[];
    /** Statistics grouped by operation name */
    statsByName: Record<string, PerformanceStats>;
    /** Critical operations (> 5 seconds) */
    slowOperations: PerformanceTiming[];
    /** Performance recommendations */
    recommendations: string[];
}
/**
 * Performance analyzer for tracking operation timings
 *
 * @example
 * ```typescript
 * const analyzer = new PerformanceAnalyzer();
 * analyzer.start('api-check');
 * await checkApi();
 * const timing = analyzer.end('api-check');
 *
 * analyzer.start('db-check');
 * await checkDatabase();
 * analyzer.end('db-check');
 *
 * const report = analyzer.generateReport();
 * console.log(report);
 * ```
 */
export declare class PerformanceAnalyzer {
    private timings;
    private activeTimers;
    private startTime;
    /**
     * Start timing an operation
     *
     * @param name - Operation name
     * @throws Error if operation with same name already in progress
     */
    start(name: string): void;
    /**
     * End timing an operation
     *
     * @param name - Operation name
     * @param metadata - Optional metadata to attach to timing
     * @returns PerformanceTiming with duration
     * @throws Error if no active timer with this name
     */
    end(name: string, metadata?: Record<string, unknown>): PerformanceTiming;
    /**
     * Manually record a timing
     *
     * @param name - Operation name
     * @param duration - Duration in milliseconds
     * @param metadata - Optional metadata
     */
    record(name: string, duration: number, metadata?: Record<string, unknown>): PerformanceTiming;
    /**
     * Get all recorded timings
     */
    getTimings(): PerformanceTiming[];
    /**
     * Get statistics for a specific operation
     *
     * @param name - Operation name to analyze
     * @returns PerformanceStats for that operation
     */
    getStats(name: string): PerformanceStats | null;
    /**
     * Generate performance report
     *
     * @returns PerformanceReport with analysis and recommendations
     */
    generateReport(): PerformanceReport;
    /**
     * Format report as human-readable string
     *
     * @param report - PerformanceReport to format
     * @returns Formatted report string
     */
    static formatReport(report: PerformanceReport): string;
    /**
     * Export report as JSON
     *
     * @param report - PerformanceReport to export
     * @returns JSON string
     */
    static exportJSON(report: PerformanceReport): string;
}
//# sourceMappingURL=performance-analyzer.d.ts.map