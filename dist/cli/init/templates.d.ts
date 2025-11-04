/**
 * Configuration file generation (deploy-config, package.json, Makefile)
 */
import type { ProjectConfig } from '../../types.js';
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
export declare function createDeployConfig(answers: InitAnswers, projectRoot: string, mergedConfig?: ProjectConfig | null): void;
/**
 * Update package.json with deploy scripts
 */
export declare function updatePackageJson(answers: InitAnswers | any, projectRoot: string): void;
//# sourceMappingURL=templates.d.ts.map