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
  flushInterval?: number; // Milliseconds
  maxBufferSize?: number;
}

/**
 * Metrics collector for deployment observability
 */
export class MetricsCollector {
  private config: Required<MetricsConfig>;
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private buffer: MetricPoint[] = [];
  private timers = new Map<string, number>(); // For measuring durations

  constructor(config: MetricsConfig = {}) {
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
  incrementCounter(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    if (!this.config.enabled) return;

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
  setGauge(name: string, value: number, tags: Record<string, string> = {}): void {
    if (!this.config.enabled) return;

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
  recordHistogram(name: string, value: number, tags: Record<string, string> = {}): void {
    if (!this.config.enabled) return;

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
  startTimer(name: string): string {
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
  stopTimer(timerId: string, tags: Record<string, string> = {}): number {
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
  recordDuration(name: string, duration: number, tags: Record<string, string> = {}): void {
    this.recordHistogram(name, duration, tags);
  }

  /**
   * Record a metric point
   *
   * @param name - Metric name
   * @param value - Metric value
   * @param tags - Optional metric tags
   */
  private recordPoint(name: string, value: number, tags: Record<string, string>): void {
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
  private getKey(name: string, tags: Record<string, string>): string {
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
  getCounter(name: string, tags: Record<string, string> = {}): number {
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
  getGauge(name: string, tags: Record<string, string> = {}): number {
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
  getHistogramStats(
    name: string,
    tags: Record<string, string> = {}
  ): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
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
  flush(): void {
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
  getSnapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, any>;
    bufferSize: number;
  } {
    const countersObj: Record<string, number> = {};
    this.counters.forEach((v, k) => (countersObj[k] = v));

    const gaugesObj: Record<string, number> = {};
    this.gauges.forEach((v, k) => (gaugesObj[k] = v));

    const histogramsObj: Record<string, any> = {};
    this.histograms.forEach((_, k) => {
      const parts = k.split('|');
      const name = parts[0];
      const tags: Record<string, string> = {};
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
  reset(): void {
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
let globalCollector: MetricsCollector | null = null;

/**
 * Get or create global metrics collector
 *
 * @param config - Metrics configuration
 * @returns Global metrics collector instance
 */
export function getMetricsCollector(config?: MetricsConfig): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector(config);
  }
  return globalCollector;
}

/**
 * Reset global metrics collector
 */
export function resetMetricsCollector(): void {
  if (globalCollector) {
    globalCollector.flush();
  }
  globalCollector = null;
}
