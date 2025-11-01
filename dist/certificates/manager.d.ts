/**
 * Certificate Manager - Main orchestration for SSL certificate lifecycle
 * Handles creation, validation, and injection into deployment config
 */
import { DeploymentStage } from '../types.js';
/**
 * Get or create certificate for a domain
 * This is the main entry point for certificate management
 */
export declare function ensureCertificateExists(domain: string, stage: DeploymentStage, projectRoot: string, awsProfile?: string): Promise<string>;
/**
 * Show certificate status for all stages
 */
export declare function showCertificateStatus(projectRoot: string, awsProfile?: string): Promise<void>;
/**
 * List all available certificates in AWS
 */
export declare function listAvailableCertificates(awsProfile?: string): Promise<void>;
/**
 * Setup certificates for a new project
 * Creates certificates for both staging and production
 */
export declare function setupProjectCertificates(stagingDomain: string, productionDomain: string, projectRoot: string, awsProfile?: string): Promise<void>;
//# sourceMappingURL=manager.d.ts.map