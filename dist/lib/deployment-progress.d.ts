/**
 * Deployment Progress Tracker
 * Manages stage tracking, progress bars, and time estimation for deployments
 */
export interface DeploymentStage {
    number: number;
    total: number;
    name: string;
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
    duration?: number;
    startTime?: number;
}
export declare class DeploymentProgress {
    private stages;
    private currentStageIndex;
    constructor(stageNames: string[]);
    /**
     * Start tracking a stage
     */
    startStage(stageNumber: number): void;
    /**
     * Mark a stage as complete (passed or failed)
     */
    completeStage(stageNumber: number, passed: boolean): void;
    /**
     * Mark a stage as skipped
     */
    skipStage(stageNumber: number): void;
    /**
     * Get formatted stage header (e.g., "STAGE 1/5: SST Environment Checks")
     */
    getStageHeader(stageNumber: number): string;
    /**
     * Get visual progress bar showing all stages
     * Example: ✅ | ✅ | ⏳ | ⏸️ | ⏸️
     */
    getProgressBar(): string;
    /**
     * Get estimated time remaining based on completed stages
     * Returns null if not enough data to estimate
     */
    getEstimatedTimeRemaining(): number | null;
    /**
     * Get formatted failure summary with stage context
     */
    getFailureSummary(failedStageNumber: number): string;
    /**
     * Print progress bar to console
     */
    printProgressBar(): void;
}
//# sourceMappingURL=deployment-progress.d.ts.map