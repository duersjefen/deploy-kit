/**
 * Progress Tracker
 * Uses ora spinners for real-time progress feedback
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import type { IProgressTracker } from './output-interfaces.js';

export class ProgressTracker implements IProgressTracker {
  private activeSpinner: Ora | null = null;
  private currentPhase: string | null = null;

  /**
   * Start a new progress phase
   */
  startPhase(message: string, spinnerType: 'dots' | 'line' | 'moon' | 'arc' = 'dots'): void {
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
  updatePhase(message: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.text = message;
    }
  }

  /**
   * Mark current phase as succeeded
   */
  succeedPhase(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.succeed(message || this.currentPhase || 'Complete');
      this.activeSpinner = null;
      this.currentPhase = null;
    }
  }

  /**
   * Mark current phase as failed
   */
  failPhase(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.fail(message || this.currentPhase || 'Failed');
      this.activeSpinner = null;
      this.currentPhase = null;
    }
  }

  /**
   * Mark current phase as warning
   */
  warnPhase(message?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.warn(message || this.currentPhase || 'Warning');
      this.activeSpinner = null;
      this.currentPhase = null;
    }
  }

  /**
   * Stop any active spinner without marking success/fail
   */
  stop(): void {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
      this.activeSpinner = null;
      this.currentPhase = null;
    }
  }

  /**
   * Check if a phase is currently active
   */
  isActive(): boolean {
    return this.activeSpinner !== null;
  }

  /**
   * Show a simple info message without spinner
   */
  info(message: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.info(message);
    } else {
      console.log(chalk.blue('ℹ'), message);
    }
  }
}
