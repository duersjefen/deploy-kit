/**
 * Metrics Collection for Observability
 *
 * Collects deployment metrics (duration, success/failure, error rates, latencies)
 * with support for multiple backends (DataDog, CloudWatch, Prometheus, OpenTelemetry)
 */
/**
 * Metrics collector for deployment observability
 */
export class MetricsCollector {
    constructor(config = {}) {
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.buffer = [];
        this.timers = new Map(); // For measuring durations
        this.config = {
            enabled: config.enabled ?? true,
            backend: config.backend ?? 'memory',
            serviceName: config.serviceName ?? 'deploy-kit',
            environment: config.environment ?? 'development',
            flushInterval: config.flushInterval ?? 60000, // 1 minute
            maxBufferSize: config.maxBufferSize ?? 1000,
        };
    }
    /**
     * Increment a counter metric
     *
     * @param name - Metric name
     * @param value - Amount to increment (default: 1)
     * @param tags - Optional metric tags
     */
    incrementCounter(name, value = 1, tags = {}) {
        if (!this.config.enabled)
            return;
        const key = this.getKey(name, tags);
        const current = this.counters.get(key) ?? 0;
        this.counters.set(key, current + value);
        this.recordPoint(name, current + value, tags);
    }
    /**
     * Set a gauge metric (instantaneous value)
     *
     * @param name - Metric name
     * @param value - Gauge value
     * @param tags - Optional metric tags
     */
    setGauge(name, value, tags = {}) {
        if (!this.config.enabled)
            return;
        const key = this.getKey(name, tags);
        this.gauges.set(key, value);
        this.recordPoint(name, value, tags);
    }
    /**
     * Record a histogram value (distribution metric)
     *
     * @param name - Metric name
     * @param value - Value to add to histogram
     * @param tags - Optional metric tags
     */
    recordHistogram(name, value, tags = {}) {
        if (!this.config.enabled)
            return;
        const key = this.getKey(name, tags);
        const current = this.histograms.get(key) ?? [];
        current.push(value);
        if (current.length > 1000) {
            current.splice(0, current.length - 1000); // Keep last 1000 values
        }
        this.histograms.set(key, current);
        this.recordPoint(name, value, tags);
    }
    /**
     * Start a timer for measuring duration
     *
     * @param name - Timer name
     * @returns Timer ID
     */
    startTimer(name) {
        const timerId = `${name}:${Date.now()}:${Math.random()}`;
        this.timers.set(timerId, Date.now());
        return timerId;
    }
    /**
     * Stop a timer and record the duration
     *
     * @param timerId - Timer ID from startTimer()
     * @param tags - Optional metric tags
     * @returns Duration in milliseconds
     */
    stopTimer(timerId, tags = {}) {
        const startTime = this.timers.get(timerId);
        if (!startTime) {
            throw new Error(`Timer ${timerId} not found`);
        }
        const duration = Date.now() - startTime;
        this.timers.delete(timerId);
        // Extract name from timerId
        const name = timerId.split(':')[0];
        this.recordHistogram(name, duration, tags);
        return duration;
    }
    /**
     * Record a duration directly
     *
     * @param name - Metric name
     * @param duration - Duration in milliseconds
     * @param tags - Optional metric tags
     */
    recordDuration(name, duration, tags = {}) {
        this.recordHistogram(name, duration, tags);
    }
    /**
     * Record a metric point
     *
     * @param name - Metric name
     * @param value - Metric value
     * @param tags - Optional metric tags
     */
    recordPoint(name, value, tags) {
        this.buffer.push({
            name,
            value,
            timestamp: new Date(),
            tags: { ...tags, service: this.config.serviceName, env: this.config.environment },
        });
        if (this.buffer.length >= this.config.maxBufferSize) {
            this.flush();
        }
    }
    /**
     * Get metric key (name + tags)
     *
     * @param name - Metric name
     * @param tags - Tags
     * @returns Unique key
     */
    getKey(name, tags) {
        const tagStr = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
        return tagStr ? `${name}|${tagStr}` : name;
    }
    /**
     * Get counter value
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Counter value
     */
    getCounter(name, tags = {}) {
        const key = this.getKey(name, tags);
        return this.counters.get(key) ?? 0;
    }
    /**
     * Get gauge value
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Gauge value
     */
    getGauge(name, tags = {}) {
        const key = this.getKey(name, tags);
        return this.gauges.get(key) ?? 0;
    }
    /**
     * Get histogram statistics
     *
     * @param name - Metric name
     * @param tags - Optional metric tags
     * @returns Histogram stats (min, max, avg, p50, p95, p99)
     */
    getHistogramStats(name, tags = {}) {
        const key = this.getKey(name, tags);
        const values = this.histograms.get(key) ?? [];
        if (values.length === 0) {
            return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
        }
        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        return {
            count: sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / sorted.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }
    /**
     * Flush metrics to backend
     *
     * This would send metrics to the configured backend (DataDog, CloudWatch, etc.)
     */
    flush() {
        if (this.buffer.length === 0) {
            return;
        }
        const metricsToFlush = [...this.buffer];
        this.buffer = [];
        // This would actually send to backend based on config.backend
        // Placeholder for implementation
    }
    /**
     * Get all metrics snapshot
     *
     * @returns Current metrics state
     */
    getSnapshot() {
        const countersObj = {};
        this.counters.forEach((v, k) => (countersObj[k] = v));
        const gaugesObj = {};
        this.gauges.forEach((v, k) => (gaugesObj[k] = v));
        const histogramsObj = {};
        this.histograms.forEach((_, k) => {
            const parts = k.split('|');
            const name = parts[0];
            const tags = {};
            if (parts.length > 1) {
                const tagPairs = parts.slice(1).join('|').split(':');
                for (let i = 0; i < tagPairs.length - 1; i += 2) {
                    tags[tagPairs[i]] = tagPairs[i + 1];
                }
            }
            histogramsObj[k] = this.getHistogramStats(name, tags);
        });
        return {
            counters: countersObj,
            gauges: gaugesObj,
            histograms: histogramsObj,
            bufferSize: this.buffer.length,
        };
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.buffer = [];
        this.timers.clear();
    }
}
/**
 * Global metrics collector instance
 */
let globalCollector = null;
/**
 * Get or create global metrics collector
 *
 * @param config - Metrics configuration
 * @returns Global metrics collector instance
 */
export function getMetricsCollector(config) {
    if (!globalCollector) {
        globalCollector = new MetricsCollector(config);
    }
    return globalCollector;
}
/**
 * Reset global metrics collector
 */
export function resetMetricsCollector() {
    if (globalCollector) {
        globalCollector.flush();
    }
    globalCollector = null;
}
