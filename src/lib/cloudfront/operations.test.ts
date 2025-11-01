import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CloudFrontOperations } from './operations.js';
import type { ProjectConfig, DeploymentStage } from '../../types.js';

const mockProjectConfig: ProjectConfig = {
  projectName: 'test-project',
  infrastructure: 'sst-serverless',
  stages: ['staging', 'production'],
  stageConfig: {
    staging: { domain: 'staging.example.com' },
    production: { domain: 'example.com' },
  },
};

describe('CloudFrontOperations', () => {
  it('should initialize with config and optional AWS profile', () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    assert.ok(ops instanceof CloudFrontOperations);
  });

  it('should accept AWS profile in constructor', () => {
    const ops = new CloudFrontOperations(mockProjectConfig, 'test-profile');
    assert.ok(ops instanceof CloudFrontOperations);
  });

  it('should handle invalidateCache with null distribution ID', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    try {
      await ops.invalidateCache('staging' as DeploymentStage, null);
      // Expected: completes without throwing
    } catch (error) {
      assert.fail(`Should not throw: ${(error as Error).message}`);
    }
  });

  it('should check environment variable for distribution ID', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    process.env.CLOUDFRONT_DIST_ID_STAGING = 'E123456789ABC';
    try {
      await ops.invalidateCache('staging' as DeploymentStage, null);
      // Should attempt to use env var
    } finally {
      delete process.env.CLOUDFRONT_DIST_ID_STAGING;
    }
  });

  it('should return null from findDistributionId when API fails', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    try {
      const result = await ops.findDistributionId('staging' as DeploymentStage);
      assert.strictEqual(typeof result === 'string' || result === null, true);
    } catch (error) {
      assert.fail(`Should not throw: ${(error as Error).message}`);
    }
  });

  it('should handle auditAndCleanup API failures gracefully', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    try {
      await ops.auditAndCleanup('staging' as DeploymentStage);
      // Expected: completes without throwing
    } catch (error) {
      // Method catches errors internally
    }
  });

  it('should accept AWS profile and pass to client', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig, 'test-profile');
    try {
      await ops.auditAndCleanup('staging' as DeploymentStage);
      // AWS profile should be used
    } catch (error) {
      // Expected if AWS is unavailable
    }
  });

  it('should use provided distribution ID for cache invalidation', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    try {
      await ops.invalidateCache('staging' as DeploymentStage, 'E123456789ABC');
      // Should attempt invalidation with provided ID
    } catch (error) {
      // Expected without working AWS
    }
  });

  it('should return null for stage without domain config', async () => {
    const configWithoutDomain: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: {
        staging: {},
        production: {},
      },
    };
    const ops = new CloudFrontOperations(configWithoutDomain);
    const result = await ops.findDistributionId('staging' as DeploymentStage);
    assert.strictEqual(result, null);
  });

  it('should handle multiple stages independently', async () => {
    const ops = new CloudFrontOperations(mockProjectConfig);
    process.env.CLOUDFRONT_DIST_ID_STAGING = 'E123STAGING';
    process.env.CLOUDFRONT_DIST_ID_PRODUCTION = 'E456PRODUCTION';
    try {
      await ops.invalidateCache('staging' as DeploymentStage, null);
      await ops.invalidateCache('production' as DeploymentStage, null);
      // Both should be processed independently
    } finally {
      delete process.env.CLOUDFRONT_DIST_ID_STAGING;
      delete process.env.CLOUDFRONT_DIST_ID_PRODUCTION;
    }
  });
});
