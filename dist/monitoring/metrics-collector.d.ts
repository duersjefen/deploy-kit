/**
 * Metrics Collection for Observability
 *
 * Collects deployment metrics (duration, success/failure, error rates, latencies)
 * with support for multiple backends (DataDog, CloudWatch, Prometheus, OpenTelemetry)
 */
/**
 * Metric data point
 */
export interface MetricPoint {
    name: string;
    value: number;
    timestamp: Date;
    tags?: Record<string, string>;
    unit?: string;
}
/**
 * Metric counter
 */
export interface MetricCounter {
    name: string;
    value: number;
    tags: Record<string, string>;
}
/**
 * Metric gauge (instantaneous value)
 */
export interface MetricGauge {
    name: string;
    value: number;
    tags: Record<string, string>;
}
/**
 * Metric histogram (distribution of values)
 */
export interface MetricHistogram {
    name: string;
    buckets: number[];
    values: number[];
    tags: Record<string, string>;
}
/**
 * Metrics collector configuration
 */
export interface MetricsConfig {
    enabled?: boolean;
    backend?: 'datadog' | 'cloudwatch' | 'prometheus' | 'otel' | 'memory';
    serviceName?: string;
    environment?: string;
    flushInterval?: number;
    maxBufferSize?: number;
}
/**
 * Metrics collector for deployment observability
 */
export declare class MetricsCollector {
    private config;
    private counters;
    private gauges;
    private histograms;
    private buffer;
    private timers;
    constructor(config?: MetricsConfig);
    /**
     * Increment a counter metric
     *
     * @param name - Metric name
     * @param value - Amount to increment (default: 1)
     * @param tags - Optional metric tags
     */
    incrementCounter(name: string, value?: number, tags?: Record<string, string>): void;
    /**
     * Set a gauge metric (instantaneous value)
     *
     * @param name - Metric name
     * @param value - Gauge value
     * @param tags - Optional metric tags
     */
    setGauge(name: string, value: number, tags?: Record<string, string>): void;
    /**
     * Record a histogram value (distribution metric)
     *
     * @param name - Metric name
     * @param value - Value to add to histogram
     * @param tags - Optional metric tags
     */
    recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
    /**
     * Start a timer for measuring duration
     *
     * @param name - Timer name
     * @returns Timer ID
     */
    startTimer(name: string): string;
    /**
     * Stop a timer and record the duration
     *
     * @param timerId - Timer ID from startTimer()
     * @param tags - Optional metric tags
     * @returns Duration in milliseconds
     */
    stopTimer(timerId: string, tags?: Record<string, string>): number;
    /**
     * Record a duration directly
     *
     * @param name - Metric name
     * @param duration - Duration in milliseconds
     * @param tags - Optional metric tags
     */
    recordDuration(name: string, duration: number, tags?: Record<string, string>): void;
    /**
     * Record a metric point
     *
     * @param name - Metric name
     * @param value - Metric value
     * @param tags - Optional metric tags
     */
    private recordPoint;
    /**
     * Get metric key (name + tags)
     *
     * @param name - Metric name
     * @param tags - Tags
     * @returns Unique key
     */
    private getKey;
    /**
     * Get counter value
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Counter value
     */
    getCounter(name: string, tags?: Record<string, string>): number;
    /**
     * Get gauge value
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Gauge value
     */
    getGauge(name: string, tags?: Record<string, string>): number;
    /**
     * Get histogram statistics
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Histogram stats (min, max, avg, p50, p95, p99)
     */
    getHistogramStats(name: string, tags?: Record<string, string>): {
        count: number;
        min: number;
        max: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
    };
    /**
     * Flush metrics to backend
     *
     * This would send metrics to the configured backend (DataDog, CloudWatch, etc.)
     */
    flush(): void;
    /**
     * Get all metrics snapshot
     *
     * @returns Current metrics state
     */
    getSnapshot(): {
        counters: Record<string, number>;
        gauges: Record<string, number>;
        histograms: Record<string, any>;
        bufferSize: number;
    };
    /**
     * Reset all metrics
     */
    reset(): void;
}
/**
 * Get or create global metrics collector
 *
 * @param config - Metrics configuration
 * @returns Global metrics collector instance
 */
export declare function getMetricsCollector(config?: MetricsConfig): MetricsCollector;
/**
 * Reset global metrics collector
 */
export declare function resetMetricsCollector(): void;
//# sourceMappingURL=metrics-collector.d.ts.map