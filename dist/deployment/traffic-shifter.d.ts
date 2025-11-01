/**
 * Traffic Shifting for Blue-Green Deployments
 *
 * Handles gradual traffic migration from blue (old) to green (new) deployment versions.
 * Supports CloudFront weighted cache behaviors, ALB target group weights, and manual strategies.
 */
/**
 * Traffic shift configuration
 */
export interface TrafficShiftConfig {
    initialPercentage: number;
    incrementPercentage?: number;
    incrementInterval?: number;
    finalPercentage?: number;
}
/**
 * Traffic shift state and history
 */
export interface TrafficShiftState {
    deploymentId: string;
    blueVersion: string;
    greenVersion: string;
    currentPercentage: number;
    status: 'starting' | 'in-progress' | 'completed' | 'rolled-back';
    startTime: Date;
    lastUpdateTime: Date;
    history: TrafficShiftEvent[];
}
/**
 * Individual traffic shift event
 */
export interface TrafficShiftEvent {
    timestamp: Date;
    fromPercentage: number;
    toPercentage: number;
    reason: string;
    success: boolean;
}
/**
 * Traffic shifter for managing blue-green traffic distribution
 */
export declare class TrafficShifter {
    private shifts;
    /**
     * Start a new traffic shift from blue to green deployment
     *
     * @param deploymentId - Unique identifier for this deployment
     * @param blueVersion - Current (blue) deployment version
     * @param greenVersion - New (green) deployment version
     * @param config - Traffic shift configuration
     * @returns Initial traffic shift state
     */
    startShift(deploymentId: string, blueVersion: string, greenVersion: string, config: TrafficShiftConfig): TrafficShiftState;
    /**
     * Get next traffic shift percentage based on config
     *
     * @param deploymentId - Deployment ID
     * @param config - Traffic shift configuration
     * @returns Next target percentage, or null if at final percentage
     */
    getNextTarget(deploymentId: string, config: TrafficShiftConfig): number | null;
    /**
     * Apply traffic shift to specified percentage
     *
     * @param deploymentId - Deployment ID
     * @param targetPercentage - Target percentage (0-100)
     * @param reason - Reason for this shift
     * @returns Updated traffic shift state
     */
    updateTraffic(deploymentId: string, targetPercentage: number, reason: string): TrafficShiftState;
    /**
     * Rollback traffic shift - restore all traffic to blue
     *
     * @param deploymentId - Deployment ID
     * @param reason - Reason for rollback
     * @returns Updated traffic shift state
     */
    rollback(deploymentId: string, reason: string): TrafficShiftState;
    /**
     * Get current traffic shift state
     *
     * @param deploymentId - Deployment ID
     * @returns Current traffic shift state
     */
    getState(deploymentId: string): TrafficShiftState | undefined;
    /**
     * Calculate time since last traffic update
     *
     * @param deploymentId - Deployment ID
     * @returns Milliseconds since last update
     */
    getTimeSinceLastUpdate(deploymentId: string): number;
    /**
     * Check if traffic shift is ready for next increment
     *
     * @param deploymentId - Deployment ID
     * @param interval - Time interval in milliseconds
     * @returns true if ready for next increment
     */
    isReadyForNextIncrement(deploymentId: string, interval: number): boolean;
    /**
     * Get traffic shift summary for reporting
     *
     * @param deploymentId - Deployment ID
     * @returns Summary with key metrics
     */
    getSummary(deploymentId: string): {
        currentPercentage: number;
        status: string;
        duration: number;
        eventsCount: number;
        successCount: number;
    };
    /**
     * Clear completed shift record
     *
     * @param deploymentId - Deployment ID
     */
    clear(deploymentId: string): void;
}
/**
 * CloudFront-specific traffic shifter using weighted cache behaviors
 */
export declare class CloudFrontTrafficShifter extends TrafficShifter {
    /**
     * Apply traffic shift via CloudFront weighted cache behaviors
     *
     * Maps green traffic percentage to CloudFront cache behavior weights:
     * - Blue version: weight = (100 - greenPercent)
     * - Green version: weight = greenPercent
     *
     * @param distribution - CloudFront distribution to update
     * @param greenPercentage - Target percentage for green version (0-100)
     * @returns Updated cache behavior weights
     */
    applyToCloudFront(distribution: Record<string, unknown>, greenPercentage: number): Promise<{
        blueWeight: number;
        greenWeight: number;
    }>;
}
//# sourceMappingURL=traffic-shifter.d.ts.map