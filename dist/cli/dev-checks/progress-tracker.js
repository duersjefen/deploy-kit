/**
 * Progress Tracker
 * Uses ora spinners for real-time progress feedback
 */
import ora from 'ora';
import chalk from 'chalk';
export class ProgressTracker {
    constructor() {
        this.activeSpinner = null;
        this.currentPhase = null;
    }
    /**
     * Start a new progress phase
     */
    startPhase(message, spinnerType = 'dots') {
        // Stop any existing spinner
        if (this.activeSpinner) {
            this.activeSpinner.stop();
        }
        this.currentPhase = message;
        this.activeSpinner = ora({
            text: message,
            spinner: spinnerType,
            color: 'cyan',
        }).start();
    }
    /**
     * Update the current phase text
     */
    updatePhase(message) {
        if (this.activeSpinner) {
            this.activeSpinner.text = message;
        }
    }
    /**
     * Mark current phase as succeeded
     */
    succeedPhase(message) {
        if (this.activeSpinner) {
            this.activeSpinner.succeed(message || this.currentPhase || 'Complete');
            this.activeSpinner = null;
            this.currentPhase = null;
        }
    }
    /**
     * Mark current phase as failed
     */
    failPhase(message) {
        if (this.activeSpinner) {
            this.activeSpinner.fail(message || this.currentPhase || 'Failed');
            this.activeSpinner = null;
            this.currentPhase = null;
        }
    }
    /**
     * Mark current phase as warning
     */
    warnPhase(message) {
        if (this.activeSpinner) {
            this.activeSpinner.warn(message || this.currentPhase || 'Warning');
            this.activeSpinner = null;
            this.currentPhase = null;
        }
    }
    /**
     * Stop any active spinner without marking success/fail
     */
    stop() {
        if (this.activeSpinner) {
            this.activeSpinner.stop();
            this.activeSpinner = null;
            this.currentPhase = null;
        }
    }
    /**
     * Check if a phase is currently active
     */
    isActive() {
        return this.activeSpinner !== null;
    }
    /**
     * Show a simple info message without spinner
     */
    info(message) {
        if (this.activeSpinner) {
            this.activeSpinner.info(message);
        }
        else {
            console.log(chalk.blue('ℹ'), message);
        }
    }
}
