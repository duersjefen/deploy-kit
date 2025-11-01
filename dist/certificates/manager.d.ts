/**
 * Certificate Manager - Main orchestration for SSL certificate lifecycle
 * Handles creation, validation, and injection into deployment config
 */
import { DeploymentStage } from '../types.js';
/**
 * Ensure SSL certificate exists for domain, create if needed
 *
 * Main entry point for certificate management. Workflow:
 * 1. Check if certificate exists in sst.config.ts
 * 2. If not, search for existing validated certificate in AWS ACM
 * 3. If not found, create new certificate and handle DNS validation
 * 4. Wait for certificate issuance
 * 5. Inject certificate ARN into sst.config.ts
 */
/**
 * @param domain - Full domain name (e.g., staging.example.com)
 * @param stage - Deployment stage (staging, production)
 * @param projectRoot - Project root directory path
 * @param awsProfile - Optional AWS profile name for authentication
 * @returns Promise resolving to certificate ARN string
 *
 * @throws {Error} If certificate creation or validation fails
 *
 * @example
 * ```typescript
 * const arn = await ensureCertificateExists(
 *   'staging.example.com',
 *   'staging',
 *   '/path/to/project'
 * );
 * console.log(`Certificate ready: ${arn}`);
 * ```
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
 * Setup SSL certificates for both staging and production stages
 *
 * Interactive wizard that:
 * 1. Prompts user to start
 * 2. Sets up staging certificate with DNS validation
 * 3. Waits for user confirmation
 * 4. Sets up production certificate with DNS validation
 * 5. Confirms completion
 */
/**
 * @param stagingDomain - Staging domain (e.g., staging.example.com)
 * @param productionDomain - Production domain (e.g., example.com)
 * @param projectRoot - Project root directory path
 * @param awsProfile - Optional AWS profile for authentication
 * @returns Promise that resolves when setup completes
 *
 * @throws {Error} If certificate creation fails
 *
 * @example
 * ```typescript
 * await setupProjectCertificates(
 *   'staging.myapp.com',
 *   'myapp.com',
 *   '/path/to/project'
 * );
 * ```
 */
export declare function setupProjectCertificates(stagingDomain: string, productionDomain: string, projectRoot: string, awsProfile?: string): Promise<void>;
//# sourceMappingURL=manager.d.ts.map