/**
 * Canary Deployment Manager
 *
 * Orchestrates blue-green deployments with gradual traffic shifting and health monitoring.
 * Automatically rolls back if error rates or latency thresholds are exceeded.
 */

import type { HealthCheck } from '../types.js';
import { TrafficShifter, type TrafficShiftConfig, type TrafficShiftState } from './traffic-shifter.js';

/**
 * Health thresholds that trigger automatic rollback
 */
export interface HealthThresholds {
  errorRate?: number; // Percentage (0-100), default: 5
  latencyP95?: number; // Milliseconds, default: 3000
  latencyP99?: number; // Milliseconds, default: 5000
  successRate?: number; // Percentage (0-100), default: 95
}

/**
 * Canary deployment configuration combining traffic shift and health monitoring
 */
export interface CanaryConfig extends TrafficShiftConfig {
  rollbackOn: HealthThresholds;
  healthChecks: HealthCheck[];
  failureThresholdCount?: number; // Number of health check failures before rollback (default: 3)
}

/**
 * Health metrics snapshot
 */
export interface HealthMetrics {
  timestamp: Date;
  errorRate: number; // Percentage (0-100)
  latencyP95: number; // Milliseconds
  latencyP99: number; // Milliseconds
  latencyAvg: number; // Milliseconds
  successRate: number; // Percentage (0-100)
  requestCount: number;
  errorCount: number;
}

/**
 * Canary deployment state
 */
export interface CanaryState {
  deploymentId: string;
  config: CanaryConfig;
  trafficState: TrafficShiftState;
  currentMetrics: HealthMetrics | null;
  healthCheckFailures: number;
  shouldRollback: boolean;
  rollbackReason: string | null;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'rolled-back';
}

/**
 * Canary deployment manager
 */
export class CanaryManager {
  private shifter: TrafficShifter;
  private states = new Map<string, CanaryState>();

  constructor() {
    this.shifter = new TrafficShifter();
  }

  /**
   * Start a new canary deployment
   *
   * @param deploymentId - Unique identifier for this deployment
   * @param blueVersion - Current (blue) deployment version
   * @param greenVersion - New (green) deployment version
   * @param config - Canary deployment configuration
   * @returns Initial canary state
   */
  startCanary(
    deploymentId: string,
    blueVersion: string,
    greenVersion: string,
    config: CanaryConfig
  ): CanaryState {
    const trafficState = this.shifter.startShift(
      deploymentId,
      blueVersion,
      greenVersion,
      config
    );

    const state: CanaryState = {
      deploymentId,
      config,
      trafficState,
      currentMetrics: null,
      healthCheckFailures: 0,
      shouldRollback: false,
      rollbackReason: null,
      status: 'healthy',
    };

    this.states.set(deploymentId, state);
    return state;
  }

  /**
   * Update health metrics and check thresholds
   *
   * @param deploymentId - Deployment ID
   * @param metrics - Current health metrics
   * @returns Updated canary state with rollback recommendation
   */
  updateMetrics(deploymentId: string, metrics: HealthMetrics): CanaryState {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    state.currentMetrics = metrics;
    const violations = this.checkHealthThresholds(metrics, state.config.rollbackOn);

    if (violations.length > 0) {
      state.healthCheckFailures++;

      if (state.healthCheckFailures >= (state.config.failureThresholdCount ?? 3)) {
        state.shouldRollback = true;
        state.rollbackReason = `Health threshold violations: ${violations.join('; ')}`;
        state.status = 'unhealthy';
      } else {
        state.status = 'degraded';
      }
    } else {
      state.healthCheckFailures = 0;
      state.status = 'healthy';
    }

    return state;
  }

  /**
   * Check if any health thresholds are violated
   *
   * @param metrics - Health metrics
   * @param thresholds - Health thresholds
   * @returns Array of violation messages
   */
  private checkHealthThresholds(metrics: HealthMetrics, thresholds: HealthThresholds): string[] {
    const violations: string[] = [];

    if (thresholds.errorRate !== undefined && metrics.errorRate > thresholds.errorRate) {
      violations.push(
        `Error rate ${metrics.errorRate.toFixed(1)}% exceeds threshold ${thresholds.errorRate}%`
      );
    }

    if (thresholds.latencyP95 !== undefined && metrics.latencyP95 > thresholds.latencyP95) {
      violations.push(
        `P95 latency ${metrics.latencyP95}ms exceeds threshold ${thresholds.latencyP95}ms`
      );
    }

    if (thresholds.latencyP99 !== undefined && metrics.latencyP99 > thresholds.latencyP99) {
      violations.push(
        `P99 latency ${metrics.latencyP99}ms exceeds threshold ${thresholds.latencyP99}ms`
      );
    }

    if (thresholds.successRate !== undefined && metrics.successRate < thresholds.successRate) {
      violations.push(
        `Success rate ${metrics.successRate.toFixed(1)}% below threshold ${thresholds.successRate}%`
      );
    }

    return violations;
  }

  /**
   * Proceed to next traffic shift step
   *
   * @param deploymentId - Deployment ID
   * @param reason - Reason for traffic shift
   * @returns Updated canary state
   */
  advanceTraffic(deploymentId: string, reason: string = 'Canary progression'): CanaryState {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    const nextTarget = this.shifter.getNextTarget(deploymentId, state.config);
    if (nextTarget !== null) {
      this.shifter.updateTraffic(deploymentId, nextTarget, reason);
      state.trafficState = this.shifter.getState(deploymentId)!;
    }

    return state;
  }

  /**
   * Rollback canary deployment to blue
   *
   * @param deploymentId - Deployment ID
   * @param reason - Reason for rollback
   * @returns Updated canary state
   */
  rollback(deploymentId: string, reason: string = 'Manual rollback'): CanaryState {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    this.shifter.rollback(deploymentId, reason);
    state.trafficState = this.shifter.getState(deploymentId)!;
    state.shouldRollback = false;
    state.rollbackReason = reason;
    state.status = 'rolled-back';

    return state;
  }

  /**
   * Complete successful canary deployment (100% green traffic)
   *
   * @param deploymentId - Deployment ID
   * @returns Updated canary state
   */
  complete(deploymentId: string): CanaryState {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    this.shifter.updateTraffic(deploymentId, 100, 'Canary deployment completed');
    state.trafficState = this.shifter.getState(deploymentId)!;
    state.status = 'healthy';

    return state;
  }

  /**
   * Get current canary state
   *
   * @param deploymentId - Deployment ID
   * @returns Current canary state
   */
  getState(deploymentId: string): CanaryState | undefined {
    return this.states.get(deploymentId);
  }

  /**
   * Check if canary is ready for next progression
   *
   * @param deploymentId - Deployment ID
   * @returns true if time interval has passed
   */
  isReadyForProgression(deploymentId: string): boolean {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    const interval = state.config.incrementInterval ?? 5 * 60 * 1000; // Default 5 minutes
    return this.shifter.isReadyForNextIncrement(deploymentId, interval);
  }

  /**
   * Get canary deployment summary
   *
   * @param deploymentId - Deployment ID
   * @returns Summary with key metrics
   */
  getSummary(deploymentId: string): {
    status: string;
    currentTraffic: number;
    healthStatus: string;
    metrics: HealthMetrics | null;
    shouldRollback: boolean;
    duration: number;
  } {
    const state = this.states.get(deploymentId);
    if (!state) {
      throw new Error(`Canary ${deploymentId} not found`);
    }

    return {
      status: state.trafficState.status,
      currentTraffic: state.trafficState.currentPercentage,
      healthStatus: state.status,
      metrics: state.currentMetrics,
      shouldRollback: state.shouldRollback,
      duration: Date.now() - state.trafficState.startTime.getTime(),
    };
  }

  /**
   * Clear completed canary record
   *
   * @param deploymentId - Deployment ID
   */
  clear(deploymentId: string): void {
    this.shifter.clear(deploymentId);
    this.states.delete(deploymentId);
  }
}
