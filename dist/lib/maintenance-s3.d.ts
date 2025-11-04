/**
 * S3 Maintenance Page Manager
 *
 * Handles uploading and managing maintenance pages in S3
 */
export interface MaintenanceS3Options {
    region: string;
    bucketName?: string;
    customPagePath?: string;
}
/**
 * Upload maintenance page to S3
 */
export declare function uploadMaintenancePage(options: MaintenanceS3Options): Promise<string>;
/**
 * Delete maintenance page from S3
 */
export declare function deleteMaintenancePage(options: MaintenanceS3Options): Promise<void>;
//# sourceMappingURL=maintenance-s3.d.ts.map