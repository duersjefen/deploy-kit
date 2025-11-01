/**
 * Tests for Traffic Shifter (Blue-Green Deployment)
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  TrafficShifter,
  CloudFrontTrafficShifter,
  type TrafficShiftConfig,
} from './traffic-shifter.js';

describe('TrafficShifter - Blue-Green Deployment', () => {
  describe('Starting Traffic Shifts', () => {
    it('starts traffic shift from blue to green', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = {
        initialPercentage: 10,
        incrementPercentage: 25,
        incrementInterval: 5 * 60 * 1000,
      };

      const state = shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);

      assert.strictEqual(state.deploymentId, 'deploy-1');
      assert.strictEqual(state.blueVersion, '1.0.0');
      assert.strictEqual(state.greenVersion, '1.1.0');
      assert.strictEqual(state.currentPercentage, 10);
      assert.strictEqual(state.status, 'starting');
      assert.strictEqual(state.history.length, 1);
    });

    it('records initial shift in history', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 5 };

      const state = shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);

      const event = state.history[0];
      assert.strictEqual(event.fromPercentage, 0);
      assert.strictEqual(event.toPercentage, 5);
      assert.strictEqual(event.success, true);
      assert.ok(event.reason.includes('canary'));
    });

    it('starts with custom initial percentage', () => {
      const shifter = new TrafficShifter();

      for (const percentage of [1, 5, 25, 50]) {
        const config: TrafficShiftConfig = { initialPercentage: percentage };
        const state = shifter.startShift(`deploy-${percentage}`, '1.0.0', '1.1.0', config);
        assert.strictEqual(state.currentPercentage, percentage);
      }
    });
  });

  describe('Traffic Shift Progression', () => {
    it('calculates next target percentage correctly', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = {
        initialPercentage: 10,
        incrementPercentage: 25,
      };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const nextTarget = shifter.getNextTarget('deploy-1', config);

      assert.strictEqual(nextTarget, 35); // 10 + 25
    });

    it('reaches final percentage and stops progression', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = {
        initialPercentage: 10,
        incrementPercentage: 40,
        finalPercentage: 100,
      };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);

      // Progress: 10 -> 50 -> 90 -> 100
      let nextTarget = shifter.getNextTarget('deploy-1', config); // 50
      shifter.updateTraffic('deploy-1', nextTarget!, 'Step 1');

      nextTarget = shifter.getNextTarget('deploy-1', config); // 90
      shifter.updateTraffic('deploy-1', nextTarget!, 'Step 2');

      nextTarget = shifter.getNextTarget('deploy-1', config); // 100
      shifter.updateTraffic('deploy-1', nextTarget!, 'Step 3');

      const finalTarget = shifter.getNextTarget('deploy-1', config);
      assert.strictEqual(finalTarget, null); // Completed
    });

    it('handles default increment percentage', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = {
        initialPercentage: 10,
        // No incrementPercentage specified - should default to 25
      };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const nextTarget = shifter.getNextTarget('deploy-1', config);

      assert.strictEqual(nextTarget, 35);
    });

    it('caps final percentage at 100', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = {
        initialPercentage: 85,
        incrementPercentage: 25,
      };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const nextTarget = shifter.getNextTarget('deploy-1', config);

      assert.strictEqual(nextTarget, 100); // Capped at 100, not 110
    });
  });

  describe('Updating Traffic', () => {
    it('updates traffic percentage', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const updated = shifter.updateTraffic('deploy-1', 50, 'Health check passed');

      assert.strictEqual(updated.currentPercentage, 50);
      assert.strictEqual(updated.status, 'in-progress');
    });

    it('marks deployment complete at 100%', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const updated = shifter.updateTraffic('deploy-1', 100, 'Deployment complete');

      assert.strictEqual(updated.currentPercentage, 100);
      assert.strictEqual(updated.status, 'completed');
    });

    it('records traffic shift in history', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      shifter.updateTraffic('deploy-1', 50, 'Health metrics improved');
      shifter.updateTraffic('deploy-1', 100, 'Deployment successful');

      const state = shifter.getState('deploy-1')!;
      assert.strictEqual(state.history.length, 3); // Initial + 2 updates

      assert.strictEqual(state.history[1].fromPercentage, 10);
      assert.strictEqual(state.history[1].toPercentage, 50);
      assert.strictEqual(state.history[2].fromPercentage, 50);
      assert.strictEqual(state.history[2].toPercentage, 100);
    });

    it('rejects invalid traffic percentages', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);

      assert.throws(() => shifter.updateTraffic('deploy-1', -1, 'Invalid'));
      assert.throws(() => shifter.updateTraffic('deploy-1', 101, 'Invalid'));
    });
  });

  describe('Traffic Shift Rollback', () => {
    it('rolls back traffic to blue (0%)', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      shifter.updateTraffic('deploy-1', 50, 'Step 1');
      const rolledBack = shifter.rollback('deploy-1', 'Error rate exceeded threshold');

      assert.strictEqual(rolledBack.currentPercentage, 0);
      assert.strictEqual(rolledBack.status, 'rolled-back');
    });

    it('records rollback event in history', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      shifter.updateTraffic('deploy-1', 50, 'Step 1');
      shifter.rollback('deploy-1', 'Error rate 15% exceeded 5%');

      const state = shifter.getState('deploy-1')!;
      const lastEvent = state.history[state.history.length - 1];

      assert.strictEqual(lastEvent.fromPercentage, 50);
      assert.strictEqual(lastEvent.toPercentage, 0);
      assert.ok(lastEvent.reason.includes('Error rate'));
    });

    it('can rollback from any traffic percentage', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      for (const trafficPercent of [10, 25, 50, 75, 99]) {
        shifter.startShift(`deploy-${trafficPercent}`, '1.0.0', '1.1.0', config);
        const state = shifter.getState(`deploy-${trafficPercent}`)!;
        state.currentPercentage = trafficPercent;

        const rolled = shifter.rollback(`deploy-${trafficPercent}`, 'Test rollback');
        assert.strictEqual(rolled.currentPercentage, 0);
      }
    });
  });

  describe('Time-Based Traffic Progression', () => {
    it('checks if ready for next increment', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10, incrementInterval: 1000 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);

      // Should not be ready immediately
      assert.strictEqual(shifter.isReadyForNextIncrement('deploy-1', 1000), false);
    });

    it('tracks time since last update', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const initialTime = shifter.getTimeSinceLastUpdate('deploy-1');

      assert.ok(initialTime >= 0);
      assert.ok(initialTime < 100); // Should be very recent
    });
  });

  describe('Shift State Management', () => {
    it('retrieves shift state by deployment ID', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      const state = shifter.getState('deploy-1');

      assert.ok(state);
      assert.strictEqual(state.blueVersion, '1.0.0');
    });

    it('returns undefined for non-existent deployment', () => {
      const shifter = new TrafficShifter();

      const state = shifter.getState('non-existent');
      assert.strictEqual(state, undefined);
    });

    it('provides summary with key metrics', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      shifter.updateTraffic('deploy-1', 50, 'Step 1');
      shifter.updateTraffic('deploy-1', 100, 'Complete');

      const summary = shifter.getSummary('deploy-1');

      assert.strictEqual(summary.currentPercentage, 100);
      assert.strictEqual(summary.status, 'completed');
      assert.strictEqual(summary.eventsCount, 3); // Initial + 2 updates
      assert.strictEqual(summary.successCount, 3);
    });

    it('clears shift records', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      assert.ok(shifter.getState('deploy-1'));

      shifter.clear('deploy-1');
      assert.strictEqual(shifter.getState('deploy-1'), undefined);
    });
  });

  describe('Error Handling', () => {
    it('throws on invalid deployment ID', () => {
      const shifter = new TrafficShifter();

      assert.throws(() => shifter.getNextTarget('non-existent', { initialPercentage: 10 }));
      assert.throws(() => shifter.updateTraffic('non-existent', 50, 'Update'));
      assert.throws(() => shifter.rollback('non-existent', 'Rollback'));
    });
  });

  describe('CloudFront Traffic Shifter', () => {
    it('extends TrafficShifter with CloudFront-specific methods', () => {
      const cfShifter = new CloudFrontTrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      const state = cfShifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      assert.ok(state);
    });

    it('calculates CloudFront cache behavior weights', async () => {
      const cfShifter = new CloudFrontTrafficShifter();

      // Mock distribution object
      const distribution = {
        Id: 'E1234',
        DomainName: 'example.cloudfront.net',
      } as any;

      const weights = await cfShifter.applyToCloudFront(distribution, 25);

      assert.strictEqual(weights.blueWeight, 75); // 100 - 25
      assert.strictEqual(weights.greenWeight, 25);
    });

    it('handles various traffic percentages for CloudFront', async () => {
      const cfShifter = new CloudFrontTrafficShifter();
      const distribution = { Id: 'E1234' } as any;

      const testCases = [
        { greenPercent: 10, expectedBlue: 90 },
        { greenPercent: 50, expectedBlue: 50 },
        { greenPercent: 100, expectedBlue: 0 },
      ];

      for (const { greenPercent, expectedBlue } of testCases) {
        const weights = await cfShifter.applyToCloudFront(distribution, greenPercent);
        assert.strictEqual(weights.blueWeight, expectedBlue);
        assert.strictEqual(weights.greenWeight, greenPercent);
      }
    });
  });

  describe('Multiple Concurrent Deployments', () => {
    it('manages multiple shifts simultaneously', () => {
      const shifter = new TrafficShifter();
      const config: TrafficShiftConfig = { initialPercentage: 10 };

      shifter.startShift('deploy-1', '1.0.0', '1.1.0', config);
      shifter.startShift('deploy-2', '2.0.0', '2.1.0', config);
      shifter.startShift('deploy-3', '3.0.0', '3.1.0', config);

      shifter.updateTraffic('deploy-1', 50, 'Update 1');
      shifter.updateTraffic('deploy-2', 75, 'Update 2');

      assert.strictEqual(shifter.getState('deploy-1')!.currentPercentage, 50);
      assert.strictEqual(shifter.getState('deploy-2')!.currentPercentage, 75);
      assert.strictEqual(shifter.getState('deploy-3')!.currentPercentage, 10);
    });
  });
});
