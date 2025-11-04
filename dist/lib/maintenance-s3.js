/**
 * S3 Maintenance Page Manager
 *
 * Handles uploading and managing maintenance pages in S3
 */
import { S3Client, CreateBucketCommand, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, PutBucketPolicyCommand, } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { DEFAULT_MAINTENANCE_PAGE } from './maintenance-page-template.js';
/**
 * Upload maintenance page to S3
 */
export async function uploadMaintenancePage(options) {
    const { region, bucketName, customPagePath } = options;
    const bucket = bucketName || `deploy-kit-maintenance-${region}`;
    const key = 'maintenance.html';
    const s3 = new S3Client({ region });
    try {
        // Check if bucket exists, create if not
        try {
            await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        }
        catch (error) {
            // Bucket doesn't exist, create it
            await s3.send(new CreateBucketCommand({
                Bucket: bucket,
                CreateBucketConfiguration: region !== 'us-east-1' ? { LocationConstraint: region } : undefined,
            }));
            // Make bucket publicly readable (for CloudFront)
            await s3.send(new PutBucketPolicyCommand({
                Bucket: bucket,
                Policy: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'PublicReadGetObject',
                            Effect: 'Allow',
                            Principal: '*',
                            Action: 's3:GetObject',
                            Resource: `arn:aws:s3:::${bucket}/*`,
                        },
                    ],
                }),
            }));
        }
        // Get HTML content (custom or default)
        const htmlContent = customPagePath
            ? readFileSync(customPagePath, 'utf-8')
            : DEFAULT_MAINTENANCE_PAGE;
        // Upload maintenance page
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: htmlContent,
            ContentType: 'text/html',
            CacheControl: 'no-cache, no-store, must-revalidate',
        }));
        // Return S3 website URL
        const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
        return s3Url;
    }
    catch (error) {
        throw new Error(`Failed to upload maintenance page: ${error.message}`);
    }
}
/**
 * Delete maintenance page from S3
 */
export async function deleteMaintenancePage(options) {
    const { region, bucketName } = options;
    const bucket = bucketName || `deploy-kit-maintenance-${region}`;
    const key = 'maintenance.html';
    const s3 = new S3Client({ region });
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
    }
    catch (error) {
        // Ignore errors during cleanup
        console.warn(`Warning: Failed to delete maintenance page: ${error.message}`);
    }
}
