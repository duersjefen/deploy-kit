/**
 * Progress Tracker
 * Uses ora spinners for real-time progress feedback
 */
import type { IProgressTracker } from './output-interfaces.js';
export declare class ProgressTracker implements IProgressTracker {
    private activeSpinner;
    private currentPhase;
    /**
     * Start a new progress phase
     */
    startPhase(message: string, spinnerType?: 'dots' | 'line' | 'moon' | 'arc'): void;
    /**
     * Update the current phase text
     */
    updatePhase(message: string): void;
    /**
     * Mark current phase as succeeded
     */
    succeedPhase(message?: string): void;
    /**
     * Mark current phase as failed
     */
    failPhase(message?: string): void;
    /**
     * Mark current phase as warning
     */
    warnPhase(message?: string): void;
    /**
     * Stop any active spinner without marking success/fail
     */
    stop(): void;
    /**
     * Check if a phase is currently active
     */
    isActive(): boolean;
    /**
     * Show a simple info message without spinner
     */
    info(message: string): void;
}
//# sourceMappingURL=progress-tracker.d.ts.map