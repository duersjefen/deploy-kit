/**
 * CloudFront Maintenance Mode Switcher
 *
 * Switches CloudFront distribution to/from maintenance page
 */

import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
  type DistributionConfig,
} from '@aws-sdk/client-cloudfront';

export interface MaintenanceModeOptions {
  distributionId: string;
  maintenanceS3Url: string; // e.g., deploy-kit-maintenance-us-east-1.s3.us-east-1.amazonaws.com/maintenance.html
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
export async function enableMaintenanceMode(options: MaintenanceModeOptions): Promise<OriginalOriginConfig> {
  const { distributionId, maintenanceS3Url, region = 'us-east-1' } = options;
  const cloudfront = new CloudFrontClient({ region });

  try {
    // Get current distribution config
    const { DistributionConfig, ETag } = await cloudfront.send(
      new GetDistributionConfigCommand({ Id: distributionId })
    );

    if (!DistributionConfig || !ETag) {
      throw new Error('Failed to get distribution config');
    }

    // Save original config for rollback
    const originalConfig: OriginalOriginConfig = {
      distributionId,
      etag: ETag,
      config: JSON.parse(JSON.stringify(DistributionConfig)), // Deep clone
    };

    // Parse maintenance S3 URL to get bucket and key
    const match = maintenanceS3Url.match(/https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/);
    if (!match) {
      throw new Error(`Invalid S3 URL format: ${maintenanceS3Url}`);
    }

    const [, bucket, , key] = match;

    // Update origin to point to maintenance S3 bucket
    // We'll use the first origin and temporarily replace it
    if (!DistributionConfig.Origins || !DistributionConfig.Origins.Items || DistributionConfig.Origins.Items.length === 0) {
      throw new Error('Distribution has no origins configured');
    }

    // Backup and replace first origin with maintenance S3
    const maintenanceOrigin = {
      ...DistributionConfig.Origins.Items[0],
      DomainName: `${bucket}.s3.${region}.amazonaws.com`,
      OriginPath: '',
      S3OriginConfig: {
        OriginAccessIdentity: '',
      },
      CustomOriginConfig: undefined,
    };

    DistributionConfig.Origins.Items[0] = maintenanceOrigin;

    // Update default cache behavior to use /* path pattern (maintenance page)
    if (DistributionConfig.DefaultCacheBehavior) {
      DistributionConfig.DefaultCacheBehavior.TargetOriginId = maintenanceOrigin.Id!;
    }

    // Update distribution
    await cloudfront.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        DistributionConfig,
        IfMatch: ETag,
      })
    );

    // Create cache invalidation to immediately show maintenance page
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `maintenance-enable-${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
        },
      })
    );

    return originalConfig;
  } catch (error) {
    throw new Error(`Failed to enable maintenance mode: ${(error as Error).message}`);
  }
}

/**
 * Disable maintenance mode - restore original CloudFront configuration
 */
export async function disableMaintenanceMode(originalConfig: OriginalOriginConfig, region: string = 'us-east-1'): Promise<void> {
  const { distributionId, config } = originalConfig;
  const cloudfront = new CloudFrontClient({ region });

  try {
    // Get current ETag (may have changed)
    const { ETag } = await cloudfront.send(
      new GetDistributionConfigCommand({ Id: distributionId })
    );

    if (!ETag) {
      throw new Error('Failed to get current distribution ETag');
    }

    // Restore original configuration
    await cloudfront.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        DistributionConfig: config,
        IfMatch: ETag,
      })
    );

    // Create cache invalidation to immediately show live site
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `maintenance-disable-${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
        },
      })
    );
  } catch (error) {
    throw new Error(`Failed to disable maintenance mode: ${(error as Error).message}`);
  }
}
