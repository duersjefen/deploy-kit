/**
 * Enhanced Output Handler
 * Unified Terminal UX system (DEP-8, DEP-9, DEP-5)
 *
 * Replaces the old SstOutputHandler with:
 * - Smart message grouping and deduplication
 * - Progress indicators with ora
 * - Summary tables with cli-table3
 * - Configurable output profiles
 */
import type { EnhancedOutputOptions } from './output-types.js';
import type { IMessageGrouper, IProgressTracker, ISummaryBuilder } from './output-interfaces.js';
export declare class EnhancedOutputHandler {
    private profile;
    private hideInfo;
    private noGroup;
    private projectRoot;
    private buffer;
    private grouper;
    private progress;
    private summary;
    private startTime;
    private hasShownReady;
    private errorCount;
    private warningCount;
    private infoSuppressedCount;
    private lambdaCount;
    private stackCount;
    private lambdaDurations;
    private readonly PATTERNS;
    constructor(options: EnhancedOutputOptions, grouper?: IMessageGrouper, progress?: IProgressTracker, summary?: ISummaryBuilder);
    /**
     * Process stdout data from SST
     * @throws {Error} If data is not a valid Buffer
     */
    processStdout(data: Buffer): void;
    /**
     * Process stderr data from SST
     * @throws {Error} If data is not a valid Buffer
     */
    processStderr(data: Buffer): void;
    /**
     * Flush any remaining buffer and show final summary
     */
    flush(): void;
    /**
     * Process a single line of output (orchestrator method)
     */
    private processLine;
    /**
     * Extract metrics from line (Lambda durations, stack counts)
     */
    private extractMetrics;
    /**
     * Check if line should be filtered in silent profile
     * Returns true if filtered (don't process further)
     */
    private shouldFilterBySilentProfile;
    /**
     * Match line against all patterns with priority
     * Returns pattern match with highest priority, or null
     */
    private matchPattern;
    /**
     * Handle high-priority patterns (errors, warnings, ready state)
     * Returns true if handled (don't process further)
     */
    private handleHighPriorityPattern;
    /**
     * Check if info message should be filtered based on profile
     * Returns true if filtered (don't process further)
     */
    private shouldFilterInfoMessage;
    /**
     * Handle phase transitions (building, deploying)
     * Returns true if handled (don't process further)
     */
    private handlePhaseTransition;
    /**
     * Try to group message (if grouping enabled)
     * Returns true if grouped (don't display)
     */
    private tryGroupMessage;
    /**
     * Display ungroupable line based on profile
     */
    private displayLine;
}
//# sourceMappingURL=enhanced-output-handler.d.ts.map