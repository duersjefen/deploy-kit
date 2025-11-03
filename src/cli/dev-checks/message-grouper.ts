/**
 * Message Grouper
 * Handles message deduplication and grouping for SST output
 *
 * Example: 200 "Deployed Lambda api_X" messages → "Deployed 200 Lambda functions"
 */

import type { MessageStats, GroupedMessage } from './output-types.js';
import type { IMessageGrouper } from './output-interfaces.js';

export class MessageGrouper implements IMessageGrouper {
  private messages: Map<string, MessageStats> = new Map();
  private totalCount: number = 0; // Cached total count for O(1) access
  private groupingPatterns = [
    // Lambda deployment messages
    { pattern: /✓\s*Deployed Lambda ([\w-]+).*\((\d+)ms\)/i, category: 'lambda-deploy' },
    { pattern: /Building.*Lambda ([\w-]+)/i, category: 'lambda-build' },

    // Stack operations
    { pattern: /Deploying.*stack ([\w-]+)/i, category: 'stack-deploy' },
    { pattern: /✓.*stack ([\w-]+).*deployed/i, category: 'stack-deployed' },

    // General success/build patterns
    { pattern: /✓\s*([\w\s]+)\s*\((\d+)ms\)/i, category: 'success' },
    { pattern: /🔨\s*Building ([\w\s]+)/i, category: 'building' },
  ];

  /**
   * Add a message for potential grouping
   * Returns true if message should be displayed immediately, false if grouped
   */
  add(line: string): boolean {
    for (const { pattern, category } of this.groupingPatterns) {
      const match = line.match(pattern);
      if (match) {
        const existing = this.messages.get(category);
        const now = Date.now();

        if (existing) {
          // Update existing group
          existing.count++;
          existing.lastSeen = now;
          this.totalCount++; // Update cached total

          // Extract duration if present
          if (match[2]) {
            const duration = parseInt(match[2], 10);
            if (!existing.avgDuration) {
              existing.avgDuration = duration;
            } else {
              existing.avgDuration = (existing.avgDuration * (existing.count - 1) + duration) / existing.count;
            }
          }
        } else {
          // Create new group
          this.messages.set(category, {
            pattern: category,
            count: 1,
            avgDuration: match[2] ? parseInt(match[2], 10) : undefined,
            firstSeen: now,
            lastSeen: now,
          });
          this.totalCount++; // Update cached total
        }

        // Don't display immediately if we're grouping
        return false;
      }
    }

    // Not a groupable message, display immediately
    return true;
  }

  /**
   * Get all grouped messages for summary display
   */
  getGroupedMessages(): GroupedMessage[] {
    const grouped: GroupedMessage[] = [];

    for (const [category, stats] of this.messages.entries()) {
      if (stats.count > 1) {
        // Only show grouped messages with more than 1 occurrence
        grouped.push({
          pattern: category,
          count: stats.count,
          representative: this.formatGroupedMessage(category, stats),
          metadata: {
            avgDuration: stats.avgDuration,
            duration: stats.lastSeen - stats.firstSeen,
          },
        });
      }
    }

    return grouped;
  }

  /**
   * Format a grouped message for display
   */
  private formatGroupedMessage(category: string, stats: MessageStats): string {
    const duration = stats.avgDuration ? ` (avg ${Math.round(stats.avgDuration)}ms)` : '';

    switch (category) {
      case 'lambda-deploy':
        return `✓ Deployed ${stats.count} Lambda function${stats.count > 1 ? 's' : ''}${duration}`;
      case 'lambda-build':
        return `🔨 Built ${stats.count} Lambda function${stats.count > 1 ? 's' : ''}`;
      case 'stack-deploy':
        return `🚀 Deploying ${stats.count} stack${stats.count > 1 ? 's' : ''}`;
      case 'stack-deployed':
        return `✓ Deployed ${stats.count} stack${stats.count > 1 ? 's' : ''}${duration}`;
      case 'building':
        return `🔨 Built ${stats.count} component${stats.count > 1 ? 's' : ''}`;
      case 'success':
        return `✓ Completed ${stats.count} operation${stats.count > 1 ? 's' : ''}${duration}`;
      default:
        return `Grouped ${stats.count} messages`;
    }
  }

  /**
   * Clear all grouped messages
   */
  clear(): void {
    this.messages.clear();
    this.totalCount = 0; // Reset cached total
  }

  /**
   * Get total count of all grouped messages (O(1) cached)
   */
  getTotalCount(): number {
    return this.totalCount;
  }
}
