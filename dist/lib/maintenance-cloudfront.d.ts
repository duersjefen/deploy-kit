/**
 * CloudFront Maintenance Mode Switcher
 *
 * Switches CloudFront distribution to/from maintenance page
 */
import { type DistributionConfig } from '@aws-sdk/client-cloudfront';
export interface MaintenanceModeOptions {
    distributionId: string;
    maintenanceS3Url: string;
    region?: string;
}
export interface OriginalOriginConfig {
    distributionId: string;
    etag: string;
    config: DistributionConfig;
}
/**
 * Enable maintenance mode - switch CloudFront to maintenance page
 */
export declare function enableMaintenanceMode(options: MaintenanceModeOptions): Promise<OriginalOriginConfig>;
/**
 * Disable maintenance mode - restore original CloudFront configuration
 */
export declare function disableMaintenanceMode(originalConfig: OriginalOriginConfig, region?: string): Promise<void>;
//# sourceMappingURL=maintenance-cloudfront.d.ts.map