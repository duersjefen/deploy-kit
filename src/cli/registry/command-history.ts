/**
 * Command History & Persistence
 *
 * Tracks command usage, favorites, and provides smart suggestions.
 * Uses conf for persistent storage.
 */

import Conf from 'conf';
import type { CommandResult } from './command-executor.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CommandHistoryEntry {
  commandName: string;
  args: Record<string, any>;
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface CommandStats {
  commandName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  lastExecuted: number;
  isFavorite: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: {
    commandName: string;
    args: Record<string, any>;
    continueOnFail?: boolean;
  }[];
  icon: string;
}

// ============================================================================
// CONFIGURATION SCHEMA
// ============================================================================

interface ConfigSchema {
  history: CommandHistoryEntry[];
  favorites: string[];
  workflows: WorkflowTemplate[];
  stats: Record<string, Omit<CommandStats, 'commandName'>>;
  preferences: {
    maxHistorySize: number;
    defaultStage: 'staging' | 'production';
    dashboardPort: number;
  };
}

// ============================================================================
// COMMAND HISTORY SERVICE
// ============================================================================

export class CommandHistory {
  private store: Conf<ConfigSchema>;

  constructor() {
    this.store = new Conf<ConfigSchema>({
      projectName: 'deploy-kit',
      schema: {
        history: {
          type: 'array',
          default: [],
        },
        favorites: {
          type: 'array',
          default: [],
        },
        workflows: {
          type: 'array',
          default: this.getDefaultWorkflows(),
        },
        stats: {
          type: 'object',
          default: {},
        },
        preferences: {
          type: 'object',
          default: {
            maxHistorySize: 1000,
            defaultStage: 'staging',
            dashboardPort: 5173,
          },
        },
      },
    });
  }

  /**
   * Add command to history
   */
  addToHistory(result: CommandResult): void {
    const entry: CommandHistoryEntry = {
      commandName: result.commandName,
      args: {},  // We'll populate this from result if needed
      timestamp: result.timestamp,
      duration: result.duration,
      success: result.success,
      error: result.error?.message,
    };

    const history = this.store.get('history');
    history.unshift(entry);  // Add to beginning

    // Limit history size
    const maxSize = this.store.get('preferences').maxHistorySize;
    if (history.length > maxSize) {
      history.splice(maxSize);
    }

    this.store.set('history', history);

    // Update stats
    this.updateStats(result);
  }

  /**
   * Get command history
   */
  getHistory(limit?: number): CommandHistoryEntry[] {
    const history = this.store.get('history');
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get recent commands (last 10)
   */
  getRecentCommands(): CommandHistoryEntry[] {
    return this.getHistory(10);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.store.set('history', []);
  }

  /**
   * Update command statistics
   */
  private updateStats(result: CommandResult): void {
    const stats = this.store.get('stats');
    const commandName = result.commandName;

    if (!stats[commandName]) {
      stats[commandName] = {
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        lastExecuted: 0,
        isFavorite: false,
      };
    }

    const cmdStats = stats[commandName];
    cmdStats.totalExecutions++;
    if (result.success) {
      cmdStats.successCount++;
    } else {
      cmdStats.failureCount++;
    }

    // Update average duration (running average)
    cmdStats.averageDuration =
      (cmdStats.averageDuration * (cmdStats.totalExecutions - 1) + result.duration) /
      cmdStats.totalExecutions;

    cmdStats.lastExecuted = result.timestamp;

    this.store.set('stats', stats);
  }

  /**
   * Get statistics for all commands
   */
  getAllStats(): CommandStats[] {
    const stats = this.store.get('stats');
    return Object.entries(stats).map(([commandName, data]) => ({
      commandName,
      ...data,
    }));
  }

  /**
   * Get statistics for a specific command
   */
  getCommandStats(commandName: string): CommandStats | undefined {
    const stats = this.store.get('stats');
    const data = stats[commandName];

    if (!data) return undefined;

    return {
      commandName,
      ...data,
    };
  }

  /**
   * Get most frequently used commands
   */
  getMostUsedCommands(limit: number = 5): CommandStats[] {
    return this.getAllStats()
      .sort((a, b) => b.totalExecutions - a.totalExecutions)
      .slice(0, limit);
  }

  /**
   * Add command to favorites
   */
  addFavorite(commandName: string): void {
    const favorites = this.store.get('favorites');
    if (!favorites.includes(commandName)) {
      favorites.push(commandName);
      this.store.set('favorites', favorites);

      // Update stats
      const stats = this.store.get('stats');
      if (stats[commandName]) {
        stats[commandName].isFavorite = true;
        this.store.set('stats', stats);
      }
    }
  }

  /**
   * Remove command from favorites
   */
  removeFavorite(commandName: string): void {
    const favorites = this.store.get('favorites');
    const index = favorites.indexOf(commandName);
    if (index > -1) {
      favorites.splice(index, 1);
      this.store.set('favorites', favorites);

      // Update stats
      const stats = this.store.get('stats');
      if (stats[commandName]) {
        stats[commandName].isFavorite = false;
        this.store.set('stats', stats);
      }
    }
  }

  /**
   * Get favorite commands
   */
  getFavorites(): string[] {
    return this.store.get('favorites');
  }

  /**
   * Check if command is favorite
   */
  isFavorite(commandName: string): boolean {
    return this.store.get('favorites').includes(commandName);
  }

  /**
   * Get workflow templates
   */
  getWorkflows(): WorkflowTemplate[] {
    return this.store.get('workflows');
  }

  /**
   * Add workflow template
   */
  addWorkflow(workflow: WorkflowTemplate): void {
    const workflows = this.store.get('workflows');
    workflows.push(workflow);
    this.store.set('workflows', workflows);
  }

  /**
   * Remove workflow template
   */
  removeWorkflow(workflowId: string): void {
    const workflows = this.store.get('workflows');
    const filtered = workflows.filter(w => w.id !== workflowId);
    this.store.set('workflows', filtered);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowTemplate | undefined {
    return this.store.get('workflows').find(w => w.id === workflowId);
  }

  /**
   * Get smart suggestions based on context
   */
  getSmartSuggestions(context?: {
    recentCommands?: string[];
    currentDirectory?: string;
    gitBranch?: string;
  }): string[] {
    const suggestions: string[] = [];
    const recentHistory = this.getRecentCommands();

    // Suggest based on common patterns
    const lastCommand = recentHistory[0]?.commandName;

    if (lastCommand === 'dev') {
      // After dev, suggest deploy or status
      suggestions.push('deploy', 'status');
    } else if (lastCommand === 'deploy') {
      // After deploy, suggest health or status
      suggestions.push('health', 'status');
    } else if (lastCommand === 'init') {
      // After init, suggest validate or dev
      suggestions.push('validate', 'dev');
    } else if (lastCommand === 'doctor') {
      // After doctor (if it failed), suggest recover
      if (!recentHistory[0]?.success) {
        suggestions.push('recover');
      } else {
        suggestions.push('dev', 'deploy');
      }
    }

    // Add most used commands
    const mostUsed = this.getMostUsedCommands(3).map(s => s.commandName);
    suggestions.push(...mostUsed);

    // Add favorites
    const favorites = this.getFavorites();
    suggestions.push(...favorites);

    // Remove duplicates and return
    return Array.from(new Set(suggestions)).slice(0, 5);
  }

  /**
   * Get preferences
   */
  getPreferences(): ConfigSchema['preferences'] {
    return this.store.get('preferences');
  }

  /**
   * Update preferences
   */
  updatePreferences(preferences: Partial<ConfigSchema['preferences']>): void {
    const current = this.store.get('preferences');
    this.store.set('preferences', { ...current, ...preferences });
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * Default workflow templates
   */
  private getDefaultWorkflows(): WorkflowTemplate[] {
    return [
      {
        id: 'safe-prod-deploy',
        name: 'Safe Production Deployment',
        description: 'Full production deployment with all safety checks',
        icon: '🚀',
        steps: [
          {
            commandName: 'doctor',
            args: {},
            continueOnFail: false,
          },
          {
            commandName: 'deploy',
            args: { stage: 'staging' },
            continueOnFail: false,
          },
          {
            commandName: 'health',
            args: { stage: 'staging' },
            continueOnFail: false,
          },
          {
            commandName: 'deploy',
            args: { stage: 'production' },
            continueOnFail: false,
          },
          {
            commandName: 'health',
            args: { stage: 'production' },
            continueOnFail: false,
          },
        ],
      },
      {
        id: 'quick-staging',
        name: 'Quick Staging Deploy',
        description: 'Fast staging deployment (skips checks)',
        icon: '⚡',
        steps: [
          {
            commandName: 'deploy',
            args: { stage: 'staging', skipChecks: true },
            continueOnFail: false,
          },
          {
            commandName: 'status',
            args: { stage: 'staging' },
            continueOnFail: true,
          },
        ],
      },
      {
        id: 'full-health-check',
        name: 'Full Health Check',
        description: 'Check health of all environments',
        icon: '🏥',
        steps: [
          {
            commandName: 'doctor',
            args: {},
            continueOnFail: true,
          },
          {
            commandName: 'health',
            args: { stage: 'staging' },
            continueOnFail: true,
          },
          {
            commandName: 'health',
            args: { stage: 'production' },
            continueOnFail: true,
          },
          {
            commandName: 'status',
            args: {},
            continueOnFail: true,
          },
        ],
      },
      {
        id: 'emergency-recovery',
        name: 'Emergency Recovery',
        description: 'Recover from deployment failures',
        icon: '🔧',
        steps: [
          {
            commandName: 'recover',
            args: { target: 'dev' },
            continueOnFail: true,
          },
          {
            commandName: 'recover',
            args: { target: 'state' },
            continueOnFail: true,
          },
          {
            commandName: 'doctor',
            args: {},
            continueOnFail: true,
          },
        ],
      },
      {
        id: 'new-project-setup',
        name: 'New Project Setup',
        description: 'Complete setup for new project',
        icon: '🎬',
        steps: [
          {
            commandName: 'init',
            args: { withQualityTools: true },
            continueOnFail: false,
          },
          {
            commandName: 'validate',
            args: {},
            continueOnFail: false,
          },
          {
            commandName: 'doctor',
            args: {},
            continueOnFail: false,
          },
        ],
      },
    ];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const commandHistory = new CommandHistory();
