/**
 * Message Grouper
 * Handles message deduplication and grouping for SST output
 *
 * Example: 200 "Deployed Lambda api_X" messages → "Deployed 200 Lambda functions"
 */
import type { GroupedMessage } from './output-types.js';
import type { IMessageGrouper } from './output-interfaces.js';
export declare class MessageGrouper implements IMessageGrouper {
    private messages;
    private totalCount;
    private groupingPatterns;
    /**
     * Add a message for potential grouping
     * Returns true if message should be displayed immediately, false if grouped
     */
    add(line: string): boolean;
    /**
     * Get all grouped messages for summary display
     */
    getGroupedMessages(): GroupedMessage[];
    /**
     * Format a grouped message for display
     */
    private formatGroupedMessage;
    /**
     * Clear all grouped messages
     */
    clear(): void;
    /**
     * Get total count of all grouped messages (O(1) cached)
     */
    getTotalCount(): number;
}
//# sourceMappingURL=message-grouper.d.ts.map