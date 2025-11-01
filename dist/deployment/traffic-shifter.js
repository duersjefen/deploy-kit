/**
 * Traffic Shifting for Blue-Green Deployments
 *
 * Handles gradual traffic migration from blue (old) to green (new) deployment versions.
 * Supports CloudFront weighted cache behaviors, ALB target group weights, and manual strategies.
 */
/**
 * Traffic shifter for managing blue-green traffic distribution
 */
export class TrafficShifter {
    constructor() {
        this.shifts = new Map();
    }
    /**
     * Start a new traffic shift from blue to green deployment
     *
     * @param deploymentId - Unique identifier for this deployment
     * @param blueVersion - Current (blue) deployment version
     * @param greenVersion - New (green) deployment version
     * @param config - Traffic shift configuration
     * @returns Initial traffic shift state
     */
    startShift(deploymentId, blueVersion, greenVersion, config) {
        const state = {
            deploymentId,
            blueVersion,
            greenVersion,
            currentPercentage: config.initialPercentage,
            status: 'starting',
            startTime: new Date(),
            lastUpdateTime: new Date(),
            history: [
                {
                    timestamp: new Date(),
                    fromPercentage: 0,
                    toPercentage: config.initialPercentage,
                    reason: 'Initial canary traffic shift',
                    success: true,
                },
            ],
        };
        this.shifts.set(deploymentId, state);
        return state;
    }
    /**
     * Get next traffic shift percentage based on config
     *
     * @param deploymentId - Deployment ID
     * @param config - Traffic shift configuration
     * @returns Next target percentage, or null if at final percentage
     */
    getNextTarget(deploymentId, config) {
        const state = this.shifts.get(deploymentId);
        if (!state) {
            throw new Error(`Shift ${deploymentId} not found`);
        }
        const increment = config.incrementPercentage ?? 25;
        const finalPercentage = config.finalPercentage ?? 100;
        const nextTarget = Math.min(state.currentPercentage + increment, finalPercentage);
        return nextTarget < finalPercentage || state.currentPercentage < finalPercentage
            ? nextTarget
            : null;
    }
    /**
     * Apply traffic shift to specified percentage
     *
     * @param deploymentId - Deployment ID
     * @param targetPercentage - Target percentage (0-100)
     * @param reason - Reason for this shift
     * @returns Updated traffic shift state
     */
    updateTraffic(deploymentId, targetPercentage, reason) {
        const state = this.shifts.get(deploymentId);
        if (!state) {
            throw new Error(`Shift ${deploymentId} not found`);
        }
        if (targetPercentage < 0 || targetPercentage > 100) {
            throw new Error(`Invalid target percentage: ${targetPercentage}`);
        }
        const fromPercentage = state.currentPercentage;
        state.currentPercentage = targetPercentage;
        state.lastUpdateTime = new Date();
        state.status = targetPercentage === 100 ? 'completed' : 'in-progress';
        state.history.push({
            timestamp: new Date(),
            fromPercentage,
            toPercentage: targetPercentage,
            reason,
            success: true,
        });
        return state;
    }
    /**
     * Rollback traffic shift - restore all traffic to blue
     *
     * @param deploymentId - Deployment ID
     * @param reason - Reason for rollback
     * @returns Updated traffic shift state
     */
    rollback(deploymentId, reason) {
        const state = this.shifts.get(deploymentId);
        if (!state) {
            throw new Error(`Shift ${deploymentId} not found`);
        }
        const fromPercentage = state.currentPercentage;
        state.currentPercentage = 0;
        state.status = 'rolled-back';
        state.lastUpdateTime = new Date();
        state.history.push({
            timestamp: new Date(),
            fromPercentage,
            toPercentage: 0,
            reason,
            success: true,
        });
        return state;
    }
    /**
     * Get current traffic shift state
     *
     * @param deploymentId - Deployment ID
     * @returns Current traffic shift state
     */
    getState(deploymentId) {
        return this.shifts.get(deploymentId);
    }
    /**
     * Calculate time since last traffic update
     *
     * @param deploymentId - Deployment ID
     * @returns Milliseconds since last update
     */
    getTimeSinceLastUpdate(deploymentId) {
        const state = this.shifts.get(deploymentId);
        if (!state) {
            throw new Error(`Shift ${deploymentId} not found`);
        }
        return Date.now() - state.lastUpdateTime.getTime();
    }
    /**
     * Check if traffic shift is ready for next increment
     *
     * @param deploymentId - Deployment ID
     * @param interval - Time interval in milliseconds
     * @returns true if ready for next increment
     */
    isReadyForNextIncrement(deploymentId, interval) {
        return this.getTimeSinceLastUpdate(deploymentId) >= interval;
    }
    /**
     * Get traffic shift summary for reporting
     *
     * @param deploymentId - Deployment ID
     * @returns Summary with key metrics
     */
    getSummary(deploymentId) {
        const state = this.shifts.get(deploymentId);
        if (!state) {
            throw new Error(`Shift ${deploymentId} not found`);
        }
        return {
            currentPercentage: state.currentPercentage,
            status: state.status,
            duration: Date.now() - state.startTime.getTime(),
            eventsCount: state.history.length,
            successCount: state.history.filter((e) => e.success).length,
        };
    }
    /**
     * Clear completed shift record
     *
     * @param deploymentId - Deployment ID
     */
    clear(deploymentId) {
        this.shifts.delete(deploymentId);
    }
}
/**
 * CloudFront-specific traffic shifter using weighted cache behaviors
 */
export class CloudFrontTrafficShifter extends TrafficShifter {
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
    async applyToCloudFront(distribution, greenPercentage) {
        const blueWeight = 100 - greenPercentage;
        // This would be implemented to actually update CloudFront via API
        // For now, return the weights for validation
        return {
            blueWeight,
            greenWeight: greenPercentage,
        };
    }
}
