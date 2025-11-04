/**
 * Interactive prompts for init command
 */
export interface InitAnswers {
    projectName: string;
    mainDomain: string;
    awsProfile?: string;
    stagingDomain: string;
    productionDomain: string;
    awsRegion: string;
    runTests: boolean;
}
export interface OptionalFiles {
    createScripts?: boolean;
    createQualityTools?: boolean;
}
/**
 * Ask user for project configuration
 */
export declare function askQuestions(projectRoot?: string): Promise<InitAnswers>;
/**
 * Print beautiful init banner
 */
export declare function printBanner(): void;
/**
 * Print setup summary
 */
export declare function printSummary(answers: InitAnswers, optionalFiles?: OptionalFiles): void;
//# sourceMappingURL=prompts.d.ts.map