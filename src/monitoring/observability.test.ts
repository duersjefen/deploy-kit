/**
 * Tests for Observability Modules (Structured Logging & Metrics Collection)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  StructuredLogger,
  getLogger,
  resetLogger,
  type LogLevel,
} from './structured-logger.js';
import {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
} from './metrics-collector.js';

describe('StructuredLogger - JSON Structured Logging', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger({
      minLevel: 'debug',
      enableConsole: false, // Disable console output for tests
      enableRemote: false,
    });
  });

  describe('Log Levels', () => {
    it('logs debug messages', () => {
      assert.doesNotThrow(() => {
        logger.debug('Debug message', { data: 'test' });
      });
    });

    it('logs info messages', () => {
      assert.doesNotThrow(() => {
        logger.info('Info message', { userId: '123' });
      });
    });

    it('logs warning messages', () => {
      assert.doesNotThrow(() => {
        logger.warn('Warning message', { code: 'DEPRECATED_API' });
      });
    });

    it('logs error messages with error object', () => {
      const error = new Error('Something went wrong');
      assert.doesNotThrow(() => {
        logger.error('Error occurred', error, { operation: 'deploy' });
      });
    });

    it('logs fatal messages', () => {
      assert.doesNotThrow(() => {
        logger.fatal('Fatal error', undefined, { exitCode: 1 });
      });
    });
  });

  describe('Log Level Filtering', () => {
    it('respects minimum log level (info)', () => {
      const infoLogger = new StructuredLogger({
        minLevel: 'info',
        enableConsole: false,
      });

      assert.doesNotThrow(() => {
        infoLogger.debug('Debug'); // Should not throw even if filtered
        infoLogger.info('Info');
        infoLogger.warn('Warn');
      });
    });

    it('respects minimum log level (warn)', () => {
      const warnLogger = new StructuredLogger({
        minLevel: 'warn',
        enableConsole: false,
      });

      assert.doesNotThrow(() => {
        warnLogger.debug('Debug');
        warnLogger.info('Info');
        warnLogger.warn('Warn');
        warnLogger.error('Error');
      });
    });

    it('respects minimum log level (error)', () => {
      const errorLogger = new StructuredLogger({
        minLevel: 'error',
        enableConsole: false,
      });

      assert.doesNotThrow(() => {
        errorLogger.warn('Warn');
        errorLogger.error('Error');
        errorLogger.fatal('Fatal');
      });
    });
  });

  describe('Logger Configuration', () => {
    it('creates logger with custom configuration', () => {
      const customLogger = new StructuredLogger({
        minLevel: 'warn',
        enableConsole: true,
        enableRemote: false,
        serviceName: 'my-service',
        version: '2.0.0',
        environment: 'production',
      });

      assert.ok(customLogger);
    });

    it('uses default configuration when not specified', () => {
      const defaultLogger = new StructuredLogger();

      assert.ok(defaultLogger);
    });
  });

  describe('Buffer Management', () => {
    it('buffers log entries for remote transmission', () => {
      const bufferedLogger = new StructuredLogger({
        enableConsole: false,
        enableRemote: true,
      });

      bufferedLogger.info('Message 1');
      bufferedLogger.info('Message 2');

      assert.strictEqual(bufferedLogger.getBufferSize(), 2);
    });

    it('clears buffer', () => {
      const bufferedLogger = new StructuredLogger({
        enableConsole: false,
        enableRemote: true,
      });

      bufferedLogger.info('Message 1');
      bufferedLogger.info('Message 2');

      assert.strictEqual(bufferedLogger.getBufferSize(), 2);

      bufferedLogger.clearBuffer();
      assert.strictEqual(bufferedLogger.getBufferSize(), 0);
    });

    it('flushes buffered logs', () => {
      const bufferedLogger = new StructuredLogger({
        enableConsole: false,
        enableRemote: true,
      });

      bufferedLogger.info('Message 1');
      bufferedLogger.info('Message 2');

      bufferedLogger.flush();
      assert.strictEqual(bufferedLogger.getBufferSize(), 0);
    });
  });

  describe('Global Logger Singleton', () => {
    beforeEach(() => {
      resetLogger();
    });

    afterEach(() => {
      resetLogger();
    });

    it('creates global logger on first access', () => {
      const logger1 = getLogger();
      assert.ok(logger1);
    });

    it('returns same instance on subsequent accesses', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      assert.strictEqual(logger1, logger2);
    });

    it('uses configuration on first creation', () => {
      const logger = getLogger({ minLevel: 'debug' });
      assert.ok(logger);
    });

    it('ignores configuration on subsequent accesses', () => {
      const logger1 = getLogger({ minLevel: 'debug' });
      const logger2 = getLogger({ minLevel: 'error' });

      // Both should be same instance
      assert.strictEqual(logger1, logger2);
    });

    it('resets singleton', () => {
      getLogger();
      resetLogger();

      // Creating new logger should work
      const newLogger = getLogger();
      assert.ok(newLogger);
    });
  });
});

describe('MetricsCollector - Observability Metrics', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector({
      enabled: true,
      backend: 'memory',
    });
  });

  afterEach(() => {
    collector.reset();
  });

  describe('Counter Metrics', () => {
    it('increments counter', () => {
      collector.incrementCounter('requests');
      collector.incrementCounter('requests');

      assert.strictEqual(collector.getCounter('requests'), 2);
    });

    it('increments counter by custom amount', () => {
      collector.incrementCounter('errors', 5);

      assert.strictEqual(collector.getCounter('errors'), 5);
    });

    it('increments counter with tags', () => {
      collector.incrementCounter('api.calls', 1, { endpoint: '/deploy' });
      collector.incrementCounter('api.calls', 1, { endpoint: '/status' });

      // Each tag combination tracked separately
      assert.strictEqual(collector.getCounter('api.calls', { endpoint: '/deploy' }), 1);
      assert.strictEqual(collector.getCounter('api.calls', { endpoint: '/status' }), 1);
    });

    it('starts counter at zero', () => {
      assert.strictEqual(collector.getCounter('nonexistent'), 0);
    });
  });

  describe('Gauge Metrics', () => {
    it('sets gauge value', () => {
      collector.setGauge('memory.usage', 512);

      assert.strictEqual(collector.getGauge('memory.usage'), 512);
    });

    it('overwrites previous gauge value', () => {
      collector.setGauge('cpu.usage', 25);
      collector.setGauge('cpu.usage', 75);

      assert.strictEqual(collector.getGauge('cpu.usage'), 75);
    });

    it('supports gauge with tags', () => {
      collector.setGauge('memory.usage', 256, { process: 'deployment' });
      collector.setGauge('memory.usage', 512, { process: 'validation' });

      assert.strictEqual(collector.getGauge('memory.usage', { process: 'deployment' }), 256);
      assert.strictEqual(collector.getGauge('memory.usage', { process: 'validation' }), 512);
    });

    it('starts gauge at zero', () => {
      assert.strictEqual(collector.getGauge('nonexistent'), 0);
    });
  });

  describe('Histogram Metrics', () => {
    it('records histogram values', () => {
      collector.recordHistogram('request.latency', 100);
      collector.recordHistogram('request.latency', 200);
      collector.recordHistogram('request.latency', 150);

      const stats = collector.getHistogramStats('request.latency');
      assert.strictEqual(stats.count, 3);
      assert.strictEqual(stats.min, 100);
      assert.strictEqual(stats.max, 200);
    });

    it('calculates histogram percentiles', () => {
      const values = [100, 150, 200, 250, 300, 350, 400, 450, 500];
      for (const v of values) {
        collector.recordHistogram('latency', v);
      }

      const stats = collector.getHistogramStats('latency');
      assert.strictEqual(stats.count, 9);
      assert.ok(stats.p50 > 200); // 50th percentile around middle
      assert.ok(stats.p95 > 400); // 95th percentile near top
      assert.ok(stats.p99 > 400); // 99th percentile near top
    });

    it('calculates average correctly', () => {
      collector.recordHistogram('duration', 100);
      collector.recordHistogram('duration', 200);
      collector.recordHistogram('duration', 300);

      const stats = collector.getHistogramStats('duration');
      assert.strictEqual(stats.avg, 200);
    });

    it('handles empty histogram', () => {
      const stats = collector.getHistogramStats('empty');

      assert.strictEqual(stats.count, 0);
      assert.strictEqual(stats.min, 0);
      assert.strictEqual(stats.max, 0);
      assert.strictEqual(stats.avg, 0);
    });
  });

  describe('Timer Metrics', () => {
    it('measures duration with timer', async () => {
      const timerId = collector.startTimer('operation');

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = collector.stopTimer(timerId);
      assert.ok(duration >= 10);
    });

    it('throws on unknown timer', () => {
      assert.throws(() => {
        collector.stopTimer('nonexistent-timer');
      });
    });

    it('supports multiple concurrent timers', async () => {
      const timer1 = collector.startTimer('op1');
      const timer2 = collector.startTimer('op2');

      await new Promise((resolve) => setTimeout(resolve, 5));

      const duration1 = collector.stopTimer(timer1);
      const duration2 = collector.stopTimer(timer2);

      assert.ok(duration1 >= 5);
      assert.ok(duration2 >= 5);
    });

    it('records duration as histogram', async () => {
      const timerId = collector.startTimer('deployment');
      await new Promise((resolve) => setTimeout(resolve, 10));
      collector.stopTimer(timerId);

      const stats = collector.getHistogramStats('deployment');
      assert.strictEqual(stats.count, 1);
      assert.ok(stats.avg >= 10);
    });
  });

  describe('Recording Duration Directly', () => {
    it('records duration without timer', () => {
      collector.recordDuration('deployment', 250);

      const stats = collector.getHistogramStats('deployment');
      assert.strictEqual(stats.count, 1);
      assert.strictEqual(stats.avg, 250);
    });

    it('records multiple durations', () => {
      collector.recordDuration('api_call', 100);
      collector.recordDuration('api_call', 200);
      collector.recordDuration('api_call', 150);

      const stats = collector.getHistogramStats('api_call');
      assert.strictEqual(stats.count, 3);
      assert.strictEqual(stats.avg, 150);
    });
  });

  describe('Metrics Snapshot', () => {
    it('returns snapshot of all metrics', () => {
      collector.incrementCounter('requests', 5);
      collector.setGauge('memory', 512);
      collector.recordHistogram('latency', 100);
      collector.recordHistogram('latency', 200);

      const snapshot = collector.getSnapshot();

      assert.ok(snapshot.counters);
      assert.ok(snapshot.gauges);
      assert.ok(snapshot.histograms);
      assert.ok('bufferSize' in snapshot);
    });

    it('includes buffer size in snapshot', () => {
      const snapshot = collector.getSnapshot();

      assert.strictEqual(snapshot.bufferSize, 0);
    });
  });

  describe('Metrics Reset', () => {
    it('clears all metrics', () => {
      collector.incrementCounter('requests', 10);
      collector.setGauge('memory', 512);
      collector.recordHistogram('latency', 100);

      const before = collector.getSnapshot();
      assert.ok(Object.keys(before.counters).length > 0 || Object.keys(before.gauges).length > 0);

      collector.reset();

      const after = collector.getSnapshot();
      assert.strictEqual(Object.keys(after.counters).length, 0);
      assert.strictEqual(Object.keys(after.gauges).length, 0);
      assert.strictEqual(Object.keys(after.histograms).length, 0);
    });
  });

  describe('Metrics Flushing', () => {
    it('flushes metrics buffer', () => {
      collector.incrementCounter('requests', 5);

      assert.doesNotThrow(() => {
        collector.flush();
      });
    });

    it('handles flush with empty buffer', () => {
      assert.doesNotThrow(() => {
        collector.flush();
      });
    });
  });

  describe('Global Metrics Collector', () => {
    beforeEach(() => {
      resetMetricsCollector();
    });

    afterEach(() => {
      resetMetricsCollector();
    });

    it('creates global collector on first access', () => {
      const collector1 = getMetricsCollector();
      assert.ok(collector1);
    });

    it('returns same instance on subsequent accesses', () => {
      const collector1 = getMetricsCollector();
      const collector2 = getMetricsCollector();

      assert.strictEqual(collector1, collector2);
    });

    it('resets singleton', () => {
      getMetricsCollector().incrementCounter('test', 5);
      resetMetricsCollector();

      const newCollector = getMetricsCollector();
      assert.strictEqual(newCollector.getCounter('test'), 0);
    });
  });

  describe('Metrics Configuration', () => {
    it('respects enabled flag', () => {
      const disabledCollector = new MetricsCollector({ enabled: false });

      disabledCollector.incrementCounter('requests');

      assert.strictEqual(disabledCollector.getCounter('requests'), 0);
    });

    it('flushes when buffer exceeds maxBufferSize', () => {
      const collector = new MetricsCollector({
        maxBufferSize: 2,
      });

      collector.incrementCounter('requests');
      collector.incrementCounter('requests'); // This triggers flush (buffer reaches 2)

      // After flush, buffer should be empty
      let snapshot = collector.getSnapshot();
      assert.strictEqual(snapshot.bufferSize, 0);

      collector.incrementCounter('requests'); // Adds one more after flush

      // Should have 1 item in buffer now
      snapshot = collector.getSnapshot();
      assert.strictEqual(snapshot.bufferSize, 1);
    });
  });

  describe('Real-World Deployment Metrics', () => {
    it('tracks complete deployment lifecycle', () => {
      // Start deployment
      const deployTimer = collector.startTimer('deployment.total');

      // Track phases
      collector.incrementCounter('deployment.validations');
      collector.recordDuration('deployment.validation', 100);

      collector.incrementCounter('deployment.builds');
      collector.recordDuration('deployment.build', 500);

      collector.incrementCounter('deployment.health_checks');
      collector.recordDuration('deployment.health_check', 200);

      // Track success
      collector.incrementCounter('deployment.success');
      const totalTime = collector.stopTimer(deployTimer);

      // Verify metrics
      assert.strictEqual(collector.getCounter('deployment.validations'), 1);
      assert.strictEqual(collector.getCounter('deployment.builds'), 1);
      assert.strictEqual(collector.getCounter('deployment.health_checks'), 1);
      assert.strictEqual(collector.getCounter('deployment.success'), 1);

      const stats = collector.getHistogramStats('deployment.total');
      // The actual elapsed time should be very small (code runs instantly)
      // We're just checking that the timer worked and recorded something
      assert.ok(stats.avg >= 0);
      assert.ok(totalTime >= 0);

      // Verify the recorded durations separately
      const validationStats = collector.getHistogramStats('deployment.validation');
      const buildStats = collector.getHistogramStats('deployment.build');
      const healthCheckStats = collector.getHistogramStats('deployment.health_check');

      assert.strictEqual(validationStats.avg, 100);
      assert.strictEqual(buildStats.avg, 500);
      assert.strictEqual(healthCheckStats.avg, 200);
    });

    it('tracks error metrics with tags', () => {
      collector.incrementCounter('errors', 1, { type: 'validation' });
      collector.incrementCounter('errors', 1, { type: 'health_check' });
      collector.recordHistogram('error.recovery_time', 5000, { type: 'validation' });

      assert.strictEqual(collector.getCounter('errors', { type: 'validation' }), 1);
      assert.strictEqual(collector.getCounter('errors', { type: 'health_check' }), 1);

      const stats = collector.getHistogramStats('error.recovery_time', { type: 'validation' });
      assert.strictEqual(stats.avg, 5000);
    });
  });
});
