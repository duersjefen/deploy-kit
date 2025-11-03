/**
 * Summary Builder
 * Creates deployment summary tables using cli-table3
 */
import type { DeploymentSummary, GroupedMessage } from './output-types.js';
import type { ISummaryBuilder } from './output-interfaces.js';
export declare class SummaryBuilder implements ISummaryBuilder {
    /**
     * Build deployment summary table
     */
    buildDeploymentSummary(summary: DeploymentSummary): string;
    /**
     * Build grouped messages table
     */
    buildGroupedMessagesTable(messages: GroupedMessage[]): string;
    /**
     * Build simple compact list (alternative to table)
     */
    buildCompactSummary(summary: DeploymentSummary): string;
}
//# sourceMappingURL=summary-builder.d.ts.map