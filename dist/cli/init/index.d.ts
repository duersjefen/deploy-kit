/**
 * Main init command orchestrator
 */
export interface InitFlags {
    configOnly?: boolean;
    scriptsOnly?: boolean;
    makefileOnly?: boolean;
    nonInteractive?: boolean;
    withQualityTools?: boolean;
    projectName?: string;
    domain?: string;
    awsProfile?: string;
    awsRegion?: string;
}
/**
 * Main init command
 */
export declare function runInit(projectRoot?: string, flags?: InitFlags): Promise<void>;
//# sourceMappingURL=index.d.ts.map