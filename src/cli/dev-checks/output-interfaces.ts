/**
 * Output Interfaces
 * Interface definitions for Dependency Injection
 * Allows for easier testing and mocking
 */

import type { MessageStats, GroupedMessage, DeploymentSummary } from './output-types.js';

/**
 * Interface for message grouping and deduplication
 */
export interface IMessageGrouper {
  /**
   * Add a message for potential grouping
   * @param line - The message line to process
   * @returns true if message should be displayed immediately, false if grouped
   */
  add(line: string): boolean;

  /**
   * Get all grouped messages for summary display
   */
  getGroupedMessages(): GroupedMessage[];

  /**
   * Clear all grouped messages
   */
  clear(): void;

  /**
   * Get total count of all grouped messages
   */
  getTotalCount(): number;
}

/**
 * Interface for progress tracking with spinners
 */
export interface IProgressTracker {
  /**
   * Start a new progress phase
   * @param message - The message to display
   * @param spinnerType - The type of spinner animation
   */
  startPhase(message: string, spinnerType?: 'dots' | 'line' | 'moon' | 'arc'): void;

  /**
   * Update the current phase text
   * @param message - The new message to display
   */
  updatePhase(message: string): void;

  /**
   * Mark current phase as succeeded
   * @param message - Optional success message
   */
  succeedPhase(message?: string): void;

  /**
   * Mark current phase as failed
   * @param message - Optional failure message
   */
  failPhase(message?: string): void;

  /**
   * Mark current phase as warning
   * @param message - Optional warning message
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
   * @param message - The info message to display
   */
  info(message: string): void;
}

/**
 * Interface for building summary tables and reports
 */
export interface ISummaryBuilder {
  /**
   * Build deployment summary table
   * @param summary - The deployment summary data
   * @returns Formatted table string
   */
  buildDeploymentSummary(summary: DeploymentSummary): string;

  /**
   * Build grouped messages table
   * @param messages - Array of grouped messages
   * @returns Formatted table string
   */
  buildGroupedMessagesTable(messages: GroupedMessage[]): string;

  /**
   * Build simple compact list (alternative to table)
   * @param summary - The deployment summary data
   * @returns Formatted compact summary
   */
  buildCompactSummary(summary: DeploymentSummary): string;
}
