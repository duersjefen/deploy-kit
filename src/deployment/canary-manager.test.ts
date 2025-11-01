/**
 * Tests for Canary Manager (Blue-Green Deployment with Health Monitoring)
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CanaryManager,
  type CanaryConfig,
  type HealthMetrics,
} from './canary-manager.js';

describe('CanaryManager - Canary Deployments with Health Monitoring', () => {
  describe('Starting Canary Deployments', () => {
    it('starts canary deployment with configuration', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        incrementPercentage: 25,
        rollbackOn: { errorRate: 5, latencyP99: 5000 },
        healthChecks: [{ url: 'https://example.com/health', expectedStatus: 200 }],
      };

      const state = manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      assert.strictEqual(state.deploymentId, 'canary-1');
      assert.strictEqual(state.trafficState.currentPercentage, 10);
      assert.strictEqual(state.status, 'healthy');
      assert.strictEqual(state.shouldRollback, false);
    });

    it('initializes with zero health check failures', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      const state = manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      assert.strictEqual(state.healthCheckFailures, 0);
    });
  });

  describe('Health Metrics Monitoring', () => {
    it('records health metrics', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5, latencyP99: 5000 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 0.5,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 99.5,
        requestCount: 1000,
        errorCount: 5,
      };

      const state = manager.updateMetrics('canary-1', metrics);

      assert.ok(state.currentMetrics);
      assert.strictEqual(state.currentMetrics.errorRate, 0.5);
      assert.strictEqual(state.status, 'healthy');
    });

    it('marks deployment healthy when metrics pass thresholds', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5, latencyP99: 5000, successRate: 95 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 2,
        latencyP95: 200,
        latencyP99: 1000,
        latencyAvg: 50,
        successRate: 98,
        requestCount: 1000,
        errorCount: 20,
      };

      const state = manager.updateMetrics('canary-1', metrics);

      assert.strictEqual(state.status, 'healthy');
      assert.strictEqual(state.healthCheckFailures, 0);
    });
  });

  describe('Health Threshold Violations', () => {
    it('detects error rate threshold violation', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        failureThresholdCount: 1,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 10, // Exceeds 5%
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 90,
        requestCount: 1000,
        errorCount: 100,
      };

      const state = manager.updateMetrics('canary-1', metrics);

      assert.strictEqual(state.status, 'unhealthy');
      assert.strictEqual(state.shouldRollback, true);
      assert.ok(state.rollbackReason?.includes('Error rate'));
    });

    it('detects P99 latency threshold violation', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { latencyP99: 5000 },
        healthChecks: [],
        failureThresholdCount: 1,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 0.5,
        latencyP95: 2000,
        latencyP99: 8000, // Exceeds 5000ms
        latencyAvg: 1000,
        successRate: 99.5,
        requestCount: 1000,
        errorCount: 5,
      };

      const state = manager.updateMetrics('canary-1', metrics);

      assert.strictEqual(state.status, 'unhealthy');
      assert.ok(state.rollbackReason?.includes('P99 latency'));
    });

    it('detects success rate threshold violation', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { successRate: 95 },
        healthChecks: [],
        failureThresholdCount: 1,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 10,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 85, // Below 95%
        requestCount: 1000,
        errorCount: 150,
      };

      const state = manager.updateMetrics('canary-1', metrics);

      assert.strictEqual(state.status, 'unhealthy');
      assert.ok(state.rollbackReason?.includes('Success rate'));
    });

    it('marks degraded on first threshold violation', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        failureThresholdCount: 3, // Need 3 failures before rollback
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const badMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 7, // Exceeds 5%
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 93,
        requestCount: 1000,
        errorCount: 70,
      };

      const state = manager.updateMetrics('canary-1', badMetrics);

      assert.strictEqual(state.status, 'degraded');
      assert.strictEqual(state.healthCheckFailures, 1);
      assert.strictEqual(state.shouldRollback, false);
    });

    it('triggers rollback after failure threshold', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        failureThresholdCount: 2,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const badMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 8,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 92,
        requestCount: 1000,
        errorCount: 80,
      };

      // First failure - degraded
      let state = manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(state.status, 'degraded');

      // Second failure - unhealthy and rollback
      state = manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(state.status, 'unhealthy');
      assert.strictEqual(state.shouldRollback, true);
    });

    it('resets failure counter when metrics improve', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        failureThresholdCount: 3,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const badMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 8,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 92,
        requestCount: 1000,
        errorCount: 80,
      };

      const goodMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 2,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 98,
        requestCount: 1000,
        errorCount: 20,
      };

      // Bad metrics
      let state = manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(state.healthCheckFailures, 1);

      // Good metrics
      state = manager.updateMetrics('canary-1', goodMetrics);
      assert.strictEqual(state.healthCheckFailures, 0);
      assert.strictEqual(state.status, 'healthy');
    });
  });

  describe('Traffic Progression', () => {
    it('advances traffic to next step', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        incrementPercentage: 25,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      const state = manager.advanceTraffic('canary-1');

      assert.strictEqual(state.trafficState.currentPercentage, 35); // 10 + 25
    });

    it('completes deployment at 100% traffic', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        incrementPercentage: 45,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      manager.advanceTraffic('canary-1'); // 10 -> 55
      manager.advanceTraffic('canary-1'); // 55 -> 100

      const state = manager.getState('canary-1')!;
      assert.strictEqual(state.trafficState.currentPercentage, 100);
      assert.strictEqual(state.trafficState.status, 'completed');
    });

    it('provides explicit completion method', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 50,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      const state = manager.complete('canary-1');

      assert.strictEqual(state.trafficState.currentPercentage, 100);
      assert.strictEqual(state.status, 'healthy');
    });
  });

  describe('Canary Rollback', () => {
    it('rolls back to blue on health violation', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        failureThresholdCount: 1,
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      // Trigger rollback condition
      const badMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 10,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 90,
        requestCount: 1000,
        errorCount: 100,
      };

      manager.updateMetrics('canary-1', badMetrics);
      const state = manager.rollback('canary-1', 'Automatic rollback: Error rate exceeded');

      assert.strictEqual(state.trafficState.currentPercentage, 0);
      assert.strictEqual(state.trafficState.status, 'rolled-back');
    });

    it('manual rollback', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      manager.advanceTraffic('canary-1'); // Progress traffic
      const state = manager.rollback('canary-1', 'Manual rollback by operator');

      assert.strictEqual(state.trafficState.currentPercentage, 0);
      assert.ok(state.rollbackReason?.includes('Manual rollback'));
    });
  });

  describe('Readiness Checks', () => {
    it('checks if ready for next progression', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        incrementInterval: 100, // 100ms for testing
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      // Should not be ready immediately
      assert.strictEqual(manager.isReadyForProgression('canary-1'), false);
    });
  });

  describe('Canary State Management', () => {
    it('retrieves canary state', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      const state = manager.getState('canary-1');

      assert.ok(state);
      assert.strictEqual(state.deploymentId, 'canary-1');
      assert.strictEqual(state.trafficState.blueVersion, '1.0.0');
      assert.strictEqual(state.trafficState.greenVersion, '1.1.0');
    });

    it('returns undefined for non-existent canary', () => {
      const manager = new CanaryManager();

      const state = manager.getState('non-existent');
      assert.strictEqual(state, undefined);
    });

    it('provides canary summary', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const metrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 1,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 99,
        requestCount: 1000,
        errorCount: 10,
      };

      manager.updateMetrics('canary-1', metrics);

      const summary = manager.getSummary('canary-1');

      assert.strictEqual(summary.status, 'starting');
      assert.strictEqual(summary.currentTraffic, 10);
      assert.strictEqual(summary.healthStatus, 'healthy');
      assert.ok(summary.metrics);
      assert.strictEqual(summary.shouldRollback, false);
      assert.ok(summary.duration >= 0);
    });

    it('clears canary records', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      assert.ok(manager.getState('canary-1'));

      manager.clear('canary-1');
      assert.strictEqual(manager.getState('canary-1'), undefined);
    });
  });

  describe('Multiple Concurrent Canaries', () => {
    it('manages multiple canary deployments simultaneously', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);
      manager.startCanary('canary-2', '2.0.0', '2.1.0', config);
      manager.startCanary('canary-3', '3.0.0', '3.1.0', config);

      manager.advanceTraffic('canary-1'); // 10 -> 35
      manager.advanceTraffic('canary-2'); // 10 -> 35
      manager.advanceTraffic('canary-2'); // 35 -> 60

      assert.strictEqual(manager.getState('canary-1')!.trafficState.currentPercentage, 35);
      assert.strictEqual(manager.getState('canary-2')!.trafficState.currentPercentage, 60);
      assert.strictEqual(manager.getState('canary-3')!.trafficState.currentPercentage, 10);
    });
  });

  describe('Default Configuration Values', () => {
    it('uses default failure threshold count', () => {
      const manager = new CanaryManager();
      const config: CanaryConfig = {
        initialPercentage: 10,
        rollbackOn: { errorRate: 5 },
        healthChecks: [],
        // failureThresholdCount not specified, should default to 3
      };

      manager.startCanary('canary-1', '1.0.0', '1.1.0', config);

      const badMetrics: HealthMetrics = {
        timestamp: new Date(),
        errorRate: 10,
        latencyP95: 100,
        latencyP99: 200,
        latencyAvg: 50,
        successRate: 90,
        requestCount: 1000,
        errorCount: 100,
      };

      // First failure
      manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(manager.getState('canary-1')!.shouldRollback, false);

      // Second failure
      manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(manager.getState('canary-1')!.shouldRollback, false);

      // Third failure - should trigger rollback
      manager.updateMetrics('canary-1', badMetrics);
      assert.strictEqual(manager.getState('canary-1')!.shouldRollback, true);
    });
  });
});
