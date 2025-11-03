/**
 * Type definitions for enhanced output handling system
 * Unified Terminal UX (DEP-8, DEP-9, DEP-5)
 */
export type OutputProfile = 'silent' | 'normal' | 'verbose' | 'debug';
export interface MessageStats {
    pattern: string;
    count: number;
    avgDuration?: number;
    firstSeen: number;
    lastSeen: number;
}
export interface DeploymentSummary {
    lambdaCount: number;
    stackCount: number;
    avgLambdaDuration: number;
    totalDuration: number;
    errors: number;
    warnings: number;
    infoMessagesSuppressed: number;
}
export interface EnhancedOutputOptions {
    projectRoot: string;
    profile?: OutputProfile;
    hideInfo?: boolean;
    noGroup?: boolean;
    verbose?: boolean;
}
export interface GroupedMessage {
    pattern: string;
    count: number;
    representative: string;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=output-types.d.ts.map