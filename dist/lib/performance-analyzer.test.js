/**
 * Performance Analyzer Test Suite
 *
 * Tests for operation timing analysis and performance reporting.
 */
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { PerformanceAnalyzer } from './performance-analyzer.js';
describe('PerformanceAnalyzer', () => {
    let analyzer;
    beforeEach(() => {
        analyzer = new PerformanceAnalyzer();
    });
    describe('Constructor', () => {
        it('creates analyzer instance', () => {
            assert.ok(analyzer);
        });
        it('starts with no timings', () => {
            const timings = analyzer.getTimings();
            assert.strictEqual(timings.length, 0);
        });
    });
    describe('start/end timing', () => {
        it('measures operation duration', () => {
            analyzer.start('test-op');
            const timing = analyzer.end('test-op');
            assert.strictEqual(timing.name, 'test-op');
            assert.ok(timing.duration >= 0);
            assert.ok(timing.startTime > 0);
            assert.ok(timing.endTime > 0);
        });
        it('records timing with metadata', () => {
            analyzer.start('op-with-meta');
            const timing = analyzer.end('op-with-meta', { stage: 'staging', region: 'eu-west-1' });
            assert.ok(timing.metadata);
            assert.strictEqual(timing.metadata?.stage, 'staging');
            assert.strictEqual(timing.metadata?.region, 'eu-west-1');
        });
        it('throws when ending non-existent timer', () => {
            assert.throws(() => analyzer.end('non-existent'), /No active timer/);
        });
        it('throws when starting duplicate timer', () => {
            analyzer.start('op');
            assert.throws(() => analyzer.start('op'), /already running/);
            analyzer.end('op');
        });
        it('tracks multiple operations', () => {
            analyzer.start('op1');
            analyzer.start('op2');
            analyzer.start('op3');
            const timing1 = analyzer.end('op1');
            const timing2 = analyzer.end('op2');
            const timing3 = analyzer.end('op3');
            const timings = analyzer.getTimings();
            assert.strictEqual(timings.length, 3);
            assert.ok(timings.find(t => t.name === 'op1'));
            assert.ok(timings.find(t => t.name === 'op2'));
            assert.ok(timings.find(t => t.name === 'op3'));
        });
        it('handles sequential operations', () => {
            analyzer.start('first');
            analyzer.end('first');
            analyzer.start('second');
            analyzer.end('second');
            const timings = analyzer.getTimings();
            assert.strictEqual(timings.length, 2);
        });
    });
    describe('record', () => {
        it('manually records a timing', () => {
            const timing = analyzer.record('manual-op', 1500);
            assert.strictEqual(timing.name, 'manual-op');
            assert.strictEqual(timing.duration, 1500);
        });
        it('includes metadata in manual recording', () => {
            const timing = analyzer.record('with-meta', 500, { type: 'cache-hit' });
            assert.strictEqual(timing.metadata?.type, 'cache-hit');
        });
        it('stores manual recordings in timings', () => {
            analyzer.record('manual1', 100);
            analyzer.record('manual2', 200);
            const timings = analyzer.getTimings();
            assert.strictEqual(timings.length, 2);
        });
    });
    describe('getStats', () => {
        it('returns null for non-existent operation', () => {
            const stats = analyzer.getStats('non-existent');
            assert.strictEqual(stats, null);
        });
        it('calculates statistics for single operation', () => {
            analyzer.record('single', 100);
            const stats = analyzer.getStats('single');
            assert.ok(stats);
            assert.strictEqual(stats.count, 1);
            assert.strictEqual(stats.totalTime, 100);
            assert.strictEqual(stats.average, 100);
            assert.strictEqual(stats.min, 100);
            assert.strictEqual(stats.max, 100);
        });
        it('calculates statistics for multiple operations', () => {
            analyzer.record('op', 100);
            analyzer.record('op', 200);
            analyzer.record('op', 300);
            const stats = analyzer.getStats('op');
            assert.ok(stats);
            assert.strictEqual(stats.count, 3);
            assert.strictEqual(stats.totalTime, 600);
            assert.strictEqual(stats.average, 200);
            assert.strictEqual(stats.min, 100);
            assert.strictEqual(stats.max, 300);
        });
        it('calculates median correctly', () => {
            analyzer.record('op', 10);
            analyzer.record('op', 20);
            analyzer.record('op', 30);
            const stats = analyzer.getStats('op');
            assert.strictEqual(stats?.median, 20);
        });
        it('calculates percentiles correctly', () => {
            // Create 100 operations with values 1-100
            for (let i = 1; i <= 100; i++) {
                analyzer.record('op', i);
            }
            const stats = analyzer.getStats('op');
            assert.ok(stats);
            assert.ok(stats.p95 > 90);
            assert.ok(stats.p95 <= 100);
            assert.ok(stats.p99 > 98);
            assert.ok(stats.p99 <= 100);
        });
        it('groups stats by operation name', () => {
            analyzer.record('api-call', 100);
            analyzer.record('api-call', 200);
            analyzer.record('db-query', 500);
            const apiStats = analyzer.getStats('api-call');
            const dbStats = analyzer.getStats('db-query');
            assert.strictEqual(apiStats?.count, 2);
            assert.strictEqual(dbStats?.count, 1);
            assert.strictEqual(dbStats?.average, 500);
        });
    });
    describe('generateReport', () => {
        it('generates report with empty timings', () => {
            const report = analyzer.generateReport();
            assert.ok(report);
            assert.ok(report.timestamp instanceof Date);
            assert.strictEqual(report.timings.length, 0);
            assert.deepStrictEqual(report.statsByName, {});
            assert.strictEqual(report.slowOperations.length, 0);
        });
        it('includes total time in report', () => {
            analyzer.record('op', 100);
            const report = analyzer.generateReport();
            assert.ok(report.totalTime > 0);
        });
        it('identifies slow operations', () => {
            analyzer.record('slow1', 6000);
            analyzer.record('slow2', 8000);
            analyzer.record('fast', 500);
            const report = analyzer.generateReport();
            assert.strictEqual(report.slowOperations.length, 2);
            assert.ok(report.slowOperations.every(op => op.duration > 5000));
        });
        it('generates recommendations for slow operations', () => {
            analyzer.record('slow', 10000);
            const report = analyzer.generateReport();
            assert.ok(report.recommendations.length > 0);
            assert.ok(report.recommendations.some(r => r.includes('Slow')));
        });
        it('generates recommendations for duplicate operations', () => {
            analyzer.record('api-call', 100);
            analyzer.record('api-call', 100);
            analyzer.record('api-call', 100);
            const report = analyzer.generateReport();
            assert.ok(report.recommendations.some(r => r.includes('cache')));
        });
        it('includes statistics by operation name', () => {
            analyzer.record('op1', 100);
            analyzer.record('op1', 200);
            analyzer.record('op2', 500);
            const report = analyzer.generateReport();
            assert.ok(report.statsByName['op1']);
            assert.ok(report.statsByName['op2']);
            assert.strictEqual(report.statsByName['op1'].count, 2);
            assert.strictEqual(report.statsByName['op2'].count, 1);
        });
    });
    describe('formatReport', () => {
        it('formats report as string', () => {
            analyzer.record('test', 100);
            const report = analyzer.generateReport();
            const formatted = PerformanceAnalyzer.formatReport(report);
            assert.ok(typeof formatted === 'string');
            assert.ok(formatted.length > 0);
        });
        it('includes operation statistics in formatted report', () => {
            analyzer.record('api', 100);
            analyzer.record('api', 200);
            const report = analyzer.generateReport();
            const formatted = PerformanceAnalyzer.formatReport(report);
            assert.ok(formatted.includes('api'));
            assert.ok(formatted.includes('Average'));
        });
        it('includes recommendations in formatted report', () => {
            analyzer.record('slow-op', 10000);
            const report = analyzer.generateReport();
            const formatted = PerformanceAnalyzer.formatReport(report);
            if (report.recommendations.length > 0) {
                assert.ok(formatted.includes('RECOMMENDATIONS'));
            }
        });
        it('is human-readable', () => {
            analyzer.record('fetch', 500);
            analyzer.record('parse', 200);
            analyzer.record('save', 100);
            const report = analyzer.generateReport();
            const formatted = PerformanceAnalyzer.formatReport(report);
            assert.ok(formatted.includes('PERFORMANCE ANALYSIS'));
            assert.ok(formatted.includes('Total Time'));
            assert.ok(formatted.includes('OPERATION STATISTICS'));
        });
    });
    describe('exportJSON', () => {
        it('exports report as JSON', () => {
            analyzer.record('op', 100);
            const report = analyzer.generateReport();
            const json = PerformanceAnalyzer.exportJSON(report);
            assert.ok(typeof json === 'string');
            const parsed = JSON.parse(json);
            assert.ok(parsed.timestamp);
            assert.strictEqual(parsed.timings.length, 1);
        });
        it('handles dates correctly in JSON export', () => {
            analyzer.record('op', 100);
            const report = analyzer.generateReport();
            const json = PerformanceAnalyzer.exportJSON(report);
            const parsed = JSON.parse(json);
            assert.ok(typeof parsed.timestamp === 'string');
            assert.ok(parsed.timestamp.includes('T'));
        });
        it('preserves all data in JSON export', () => {
            analyzer.record('op1', 100, { stage: 'prod' });
            analyzer.record('op2', 200);
            const report = analyzer.generateReport();
            const json = PerformanceAnalyzer.exportJSON(report);
            const parsed = JSON.parse(json);
            assert.strictEqual(parsed.timings.length, 2);
            assert.strictEqual(parsed.timings[0].metadata.stage, 'prod');
        });
    });
    describe('Real-world scenarios', () => {
        it('measures deployment pipeline', () => {
            analyzer.start('validate-config');
            analyzer.end('validate-config', { files: 5 });
            analyzer.start('build');
            analyzer.end('build', { errors: 0 });
            analyzer.start('health-checks');
            analyzer.end('health-checks', { passed: 8 });
            const report = analyzer.generateReport();
            assert.strictEqual(Object.keys(report.statsByName).length, 3);
            assert.ok(report.statsByName['validate-config']);
            assert.ok(report.statsByName['build']);
            assert.ok(report.statsByName['health-checks']);
        });
        it('detects performance regression', () => {
            // First deployment
            analyzer.record('api-check', 1000);
            analyzer.record('api-check', 1100);
            analyzer.record('api-check', 1050);
            const report1 = analyzer.generateReport();
            const avg1 = report1.statsByName['api-check'].average;
            // Second deployment (slower)
            analyzer.record('api-check', 8000);
            analyzer.record('api-check', 9000);
            const report2 = analyzer.generateReport();
            const slowOps = report2.slowOperations;
            assert.ok(slowOps.length > 0);
        });
        it('tracks concurrent operations', () => {
            analyzer.start('fetch-config');
            analyzer.start('fetch-certs');
            analyzer.start('fetch-state');
            analyzer.end('fetch-config');
            analyzer.end('fetch-certs');
            analyzer.end('fetch-state');
            const timings = analyzer.getTimings();
            assert.strictEqual(timings.length, 3);
        });
        it('identifies parallelization opportunities', () => {
            // Sequential operations taking 100ms each
            for (let i = 0; i < 10; i++) {
                analyzer.record(`step-${i}`, 100);
            }
            const report = analyzer.generateReport();
            const totalSequential = report.statsByName
                ? Object.values(report.statsByName).reduce((sum, s) => sum + s.totalTime, 0)
                : 0;
            // If sequential time >> total time, could be parallelized
            if (totalSequential > report.totalTime * 1.5) {
                assert.ok(report.recommendations.some(r => r.includes('parallelize')));
            }
        });
    });
    describe('Edge cases', () => {
        it('handles very fast operations', () => {
            analyzer.record('fast', 1);
            const stats = analyzer.getStats('fast');
            assert.ok(stats);
            assert.strictEqual(stats.min, 1);
        });
        it('handles very slow operations', () => {
            analyzer.record('slow', 600000); // 10 minutes
            const stats = analyzer.getStats('slow');
            assert.ok(stats);
            assert.strictEqual(stats.max, 600000);
        });
        it('handles many operations', () => {
            for (let i = 0; i < 1000; i++) {
                analyzer.record('bulk-op', Math.random() * 1000);
            }
            const stats = analyzer.getStats('bulk-op');
            assert.strictEqual(stats?.count, 1000);
        });
        it('handles zero-duration operations', () => {
            analyzer.record('instant', 0);
            const stats = analyzer.getStats('instant');
            assert.ok(stats);
            assert.strictEqual(stats.min, 0);
        });
        it('handles operations with special characters in names', () => {
            analyzer.record('op::with-special_chars', 100);
            const stats = analyzer.getStats('op::with-special_chars');
            assert.ok(stats);
        });
    });
});
