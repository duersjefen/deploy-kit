/**
 * Configuration file generation (deploy-config, package.json, Makefile)
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
/**
 * Generate .deploy-config.json content
 */
export declare function generateDeployConfig(answers: InitAnswers): string;
/**
 * Create .deploy-config.json
 */
export declare function createDeployConfig(answers: InitAnswers, projectRoot: string, mergedConfig?: any): void;
/**
 * Update package.json with deploy scripts
 */
export declare function updatePackageJson(answers: InitAnswers, projectRoot: string): void;
/**
 * Create Makefile with deploy targets
 */
export declare function createMakefile(answers: InitAnswers, projectRoot: string): void;
//# sourceMappingURL=templates.d.ts.map