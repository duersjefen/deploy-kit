/**
 * AWS ACM (AWS Certificate Manager) API wrapper
 * Handles certificate creation, lookup, and status checking
 */
import { DeploymentStage } from '../types.js';
export interface CertificateInfo {
    arn: string;
    domain: string;
    status: 'ISSUED' | 'PENDING_VALIDATION' | 'FAILED' | 'INACTIVE';
    validationRecords: ValidationRecord[];
    createdAt: Date;
}
export interface ValidationRecord {
    name: string;
    value: string;
    type: 'CNAME' | 'DNS';
}
/**
 * Find existing certificate by domain name
 */
export declare function findCertificateByDomain(domain: string, awsProfile?: string): Promise<CertificateInfo | null>;
/**
 * Create new ACM certificate
 */
export declare function createCertificate(domain: string, awsProfile?: string): Promise<CertificateInfo>;
/**
 * Get certificate details
 */
export declare function describeCertificate(arn: string, awsProfile?: string): Promise<any>;
/**
 * Wait for certificate to be issued
 */
export declare function waitForCertificateIssuance(arn: string, maxWaitSeconds?: number, awsProfile?: string): Promise<boolean>;
/**
 * List all certificates for a given stage
 */
export declare function listCertificatesForStage(stage: DeploymentStage, awsProfile?: string): Promise<CertificateInfo[]>;
//# sourceMappingURL=aws-acm.d.ts.map