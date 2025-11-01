/**
 * Progress monitoring and reporting
 * - Track deployment stages
 * - Display timing information
 * - Show current status
 */
export interface StageProgress {
    stage: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    startTime?: Date;
    endTime?: Date;
    message?: string;
}
export declare function getProgressMonitor(): {
    registerStage: (stageNum: number, name: string) => void;
    startStage: (stageNum: number, message?: string) => void;
    completeStage: (stageNum: number, message?: string) => void;
    failStage: (stageNum: number, message?: string) => void;
    formatDuration: (ms: number) => string;
    displayProgressBar: () => void;
    displayStages: () => void;
    displaySummary: (success: boolean) => void;
};
//# sourceMappingURL=progress.d.ts.map