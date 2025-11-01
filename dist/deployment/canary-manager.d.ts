/**
 * Canary Deployment Manager
 *
 * Orchestrates blue-green deployments with gradual traffic shifting and health monitoring.
 * Automatically rolls back if error rates or latency thresholds are exceeded.
 */
import type { HealthCheck } from '../types.js';
import { type TrafficShiftConfig, type TrafficShiftState } from './traffic-shifter.js';
/**
 * Health thresholds that trigger automatic rollback
 */
export interface HealthThresholds {
    errorRate?: number;
    latencyP95?: number;
    latencyP99?: number;
    successRate?: number;
}
/**
 * Canary deployment configuration combining traffic shift and health monitoring
 */
export interface CanaryConfig extends TrafficShiftConfig {
    rollbackOn: HealthThresholds;
    healthChecks: HealthCheck[];
    failureThresholdCount?: number;
}
/**
 * Health metrics snapshot
 */
export interface HealthMetrics {
    timestamp: Date;
    errorRate: number;
    latencyP95: number;
    latencyP99: number;
    latencyAvg: number;
    successRate: number;
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
export declare class CanaryManager {
    private shifter;
    private states;
    constructor();
    /**
     * Start a new canary deployment
     *
     * @param deploymentId - Unique identifier for this deployment
     * @param blueVersion - Current (blue) deployment version
     * @param greenVersion - New (green) deployment version
     * @param config - Canary deployment configuration
     * @returns Initial canary state
     */
    startCanary(deploymentId: string, blueVersion: string, greenVersion: string, config: CanaryConfig): CanaryState;
    /**
     * Update health metrics and check thresholds
     *
     * @param deploymentId - Deployment ID
     * @param metrics - Current health metrics
     * @returns Updated canary state with rollback recommendation
     */
    updateMetrics(deploymentId: string, metrics: HealthMetrics): CanaryState;
    /**
     * Check if any health thresholds are violated
     *
     * @param metrics - Health metrics
     * @param thresholds - Health thresholds
     * @returns Array of violation messages
     */
    private checkHealthThresholds;
    /**
     * Proceed to next traffic shift step
     *
     * @param deploymentId - Deployment ID
     * @param reason - Reason for traffic shift
     * @returns Updated canary state
     */
    advanceTraffic(deploymentId: string, reason?: string): CanaryState;
    /**
     * Rollback canary deployment to blue
     *
     * @param deploymentId - Deployment ID
     * @param reason - Reason for rollback
     * @returns Updated canary state
     */
    rollback(deploymentId: string, reason?: string): CanaryState;
    /**
     * Complete successful canary deployment (100% green traffic)
     *
     * @param deploymentId - Deployment ID
     * @returns Updated canary state
     */
    complete(deploymentId: string): CanaryState;
    /**
     * Get current canary state
     *
     * @param deploymentId - Deployment ID
     * @returns Current canary state
     */
    getState(deploymentId: string): CanaryState | undefined;
    /**
     * Check if canary is ready for next progression
     *
     * @param deploymentId - Deployment ID
     * @returns true if time interval has passed
     */
    isReadyForProgression(deploymentId: string): boolean;
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
    };
    /**
     * Clear completed canary record
     *
     * @param deploymentId - Deployment ID
     */
    clear(deploymentId: string): void;
}
//# sourceMappingURL=canary-manager.d.ts.map