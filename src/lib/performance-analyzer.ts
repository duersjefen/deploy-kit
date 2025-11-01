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
export class PerformanceAnalyzer {
  private timings: PerformanceTiming[] = [];
  private activeTimers = new Map<string, number>();
  private startTime = Date.now();

  /**
   * Start timing an operation
   *
   * @param name - Operation name
   * @throws Error if operation with same name already in progress
   */
  start(name: string): void {
    if (this.activeTimers.has(name)) {
      throw new Error(`Timer "${name}" is already running`);
    }
    this.activeTimers.set(name, Date.now());
  }

  /**
   * End timing an operation
   *
   * @param name - Operation name
   * @param metadata - Optional metadata to attach to timing
   * @returns PerformanceTiming with duration
   * @throws Error if no active timer with this name
   */
  end(name: string, metadata?: Record<string, unknown>): PerformanceTiming {
    const startTime = this.activeTimers.get(name);

    if (startTime === undefined) {
      throw new Error(`No active timer for "${name}"`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    this.activeTimers.delete(name);

    const timing: PerformanceTiming = {
      name,
      duration,
      startTime,
      endTime,
      metadata,
    };

    this.timings.push(timing);
    return timing;
  }

  /**
   * Manually record a timing
   *
   * @param name - Operation name
   * @param duration - Duration in milliseconds
   * @param metadata - Optional metadata
   */
  record(name: string, duration: number, metadata?: Record<string, unknown>): PerformanceTiming {
    const startTime = Date.now() - duration;
    const endTime = Date.now();

    const timing: PerformanceTiming = {
      name,
      duration,
      startTime,
      endTime,
      metadata,
    };

    this.timings.push(timing);
    return timing;
  }

  /**
   * Get all recorded timings
   */
  getTimings(): PerformanceTiming[] {
    return [...this.timings];
  }

  /**
   * Get statistics for a specific operation
   *
   * @param name - Operation name to analyze
   * @returns PerformanceStats for that operation
   */
  getStats(name: string): PerformanceStats | null {
    const operationTimings = this.timings.filter(t => t.name === name);

    if (operationTimings.length === 0) {
      return null;
    }

    const durations = operationTimings.map(t => t.duration).sort((a, b) => a - b);
    const totalTime = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: durations.length,
      totalTime,
      average: totalTime / durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      median: durations[Math.floor(durations.length / 2)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
    };
  }

  /**
   * Generate performance report
   *
   * @returns PerformanceReport with analysis and recommendations
   */
  generateReport(): PerformanceReport {
    const totalTime = Date.now() - this.startTime;
    const slowOperations = this.timings.filter(t => t.duration > 5000);

    // Group timings by name
    const statsByName: Record<string, PerformanceStats> = {};
    const operationNames = new Set(this.timings.map(t => t.name));

    for (const name of operationNames) {
      const stats = this.getStats(name);
      if (stats) {
        statsByName[name] = stats;
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];

    // Check for slow operations
    if (slowOperations.length > 0) {
      recommendations.push(
        `⚠️  Slow operations detected: ${slowOperations.length} operation(s) took > 5 seconds. Consider optimization.`
      );
    }

    // Check for operations that could be parallelized
    const sequentialTime = Object.values(statsByName).reduce(
      (sum, stats) => sum + stats.totalTime,
      0
    );
    if (sequentialTime > totalTime * 1.5) {
      recommendations.push(
        '💡 Consider options to parallelize operations. Sequential operations take longer than total time.'
      );
    }

    // Check for high variance operations
    for (const [name, stats] of Object.entries(statsByName)) {
      const variance = stats.max - stats.min;
      if (variance > stats.average * 2) {
        recommendations.push(
          `📊 Operation "${name}" has high variance (${variance}ms). May indicate resource contention.`
        );
      }
    }

    // Check for operations that should be cached
    const duplicateOps = Array.from(operationNames).filter(name => {
      const stats = statsByName[name];
      return stats?.count ?? 0 > 1;
    });

    if (duplicateOps.length > 0) {
      recommendations.push(
        `💾 ${duplicateOps.length} operation(s) run multiple times. Consider adding cache for results.`
      );
    }

    return {
      timestamp: new Date(),
      totalTime,
      timings: this.timings,
      statsByName,
      slowOperations,
      recommendations,
    };
  }

  /**
   * Format report as human-readable string
   *
   * @param report - PerformanceReport to format
   * @returns Formatted report string
   */
  static formatReport(report: PerformanceReport): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('📊 PERFORMANCE ANALYSIS REPORT');
    lines.push('═'.repeat(60));
    lines.push('');

    // Header
    lines.push(`Generated: ${report.timestamp.toISOString()}`);
    lines.push(`Total Time: ${report.totalTime}ms`);
    lines.push(`Operations: ${report.timings.length}`);
    lines.push('');

    // Slow operations
    if (report.slowOperations.length > 0) {
      lines.push('🐢 SLOW OPERATIONS (> 5 seconds):');
      for (const op of report.slowOperations) {
        lines.push(`  ${op.name.padEnd(30)} ${op.duration}ms`);
      }
      lines.push('');
    }

    // Summary by operation
    lines.push('⚡ OPERATION STATISTICS:');
    lines.push('');

    const operationNames = Object.keys(report.statsByName).sort();
    for (const name of operationNames) {
      const stats = report.statsByName[name];
      lines.push(`  ${name}:`);
      lines.push(`    Count:    ${stats.count}`);
      lines.push(`    Total:    ${stats.totalTime}ms`);
      lines.push(`    Average:  ${Math.round(stats.average)}ms`);
      lines.push(`    Min:      ${stats.min}ms`);
      lines.push(`    Max:      ${stats.max}ms`);
      lines.push(`    Median:   ${stats.median}ms`);
      lines.push(`    P95:      ${stats.p95}ms`);
      lines.push(`    P99:      ${stats.p99}ms`);
      lines.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      for (const rec of report.recommendations) {
        lines.push(`  ${rec}`);
      }
      lines.push('');
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * Export report as JSON
   *
   * @param report - PerformanceReport to export
   * @returns JSON string
   */
  static exportJSON(report: PerformanceReport): string {
    return JSON.stringify(report, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2);
  }
}
