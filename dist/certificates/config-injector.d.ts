/**
 * Config Injector - Updates sst.config.ts with certificate ARN
 */
export interface CertificateConfig {
    domain: string;
    arn: string;
}
/**
 * Update sst.config.ts to use fixed SSL certificate
 * Injects the certificate ARN into the domain configuration
 */
export declare function injectCertificateArnIntoConfig(projectRoot: string, stage: string, certificateArn: string, domain: string): void;
/**
 * Extract certificate ARN from sst.config.ts for a given stage
 * Handles both literal ARN strings and references to pre-created certificates
 */
export declare function extractCertificateArnFromConfig(projectRoot: string, stage: string): string | null;
/**
 * Verify certificate ARN is valid format
 */
export declare function validateCertificateArn(arn: string): boolean;
//# sourceMappingURL=config-injector.d.ts.map