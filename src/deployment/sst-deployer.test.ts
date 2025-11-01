import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ProjectConfig, DeploymentStage } from '../types.js';

interface SSTDeploymentOptions {
  stage: DeploymentStage;
  projectRoot: string;
  config: ProjectConfig;
  awsProfile?: string;
  timeoutMinutes?: number;
  logFile?: string;
}

const mockConfig: ProjectConfig = {
  projectName: 'test-project',
  infrastructure: 'sst-serverless',
  stages: ['staging', 'production'],
  stageConfig: {
    staging: {},
    production: {},
  },
};

describe('SSTDeploymentOptions', () => {
  it('should accept valid options', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      timeoutMinutes: 15,
    };

    assert.ok(options.stage === 'staging');
    assert.ok(options.projectRoot === '/tmp/test');
    assert.ok(options.config === mockConfig);
  });

  it('should use custom timeout', () => {
    const options: SSTDeploymentOptions = {
      stage: 'production' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      timeoutMinutes: 5,
    };

    assert.strictEqual(options.timeoutMinutes, 5);
  });

  it('should accept custom logFile path', () => {
    const logPath = '/var/log/deploy.log';
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      logFile: logPath,
    };

    assert.strictEqual(options.logFile, logPath);
  });

  it('should accept AWS profile', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      awsProfile: 'test-profile',
    };

    assert.strictEqual(options.awsProfile, 'test-profile');
  });

  it('should handle different stages', () => {
    const stagingOptions: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    const productionOptions: SSTDeploymentOptions = {
      stage: 'production' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    assert.notStrictEqual(stagingOptions.stage, productionOptions.stage);
  });

  it('should default to 15 minute timeout', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    assert.strictEqual(options.timeoutMinutes || 15, 15);
  });

  it('should override default timeout when provided', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      timeoutMinutes: 30,
    };

    assert.strictEqual(options.timeoutMinutes, 30);
  });

  it('should allow minimum 1 minute timeout', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
      timeoutMinutes: 1,
    };

    assert.strictEqual(options.timeoutMinutes, 1);
  });

  it('should preserve project configuration', () => {
    const config: ProjectConfig = {
      projectName: 'my-app',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: { domain: 'staging.example.com' },
        production: { domain: 'example.com' },
      },
    };

    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config,
    };

    assert.strictEqual(options.config.projectName, 'my-app');
    assert.strictEqual(options.config.stageConfig.staging?.domain, 'staging.example.com');
  });

  it('should handle configuration without stage config', () => {
    const config: ProjectConfig = {
      projectName: 'test-project',
      infrastructure: 'sst-serverless',
      stages: ['staging'],
      stageConfig: {
        staging: {},
        production: {},
      },
    };

    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config,
    };

    assert.ok(options.config.stageConfig);
  });

  it('should support staging stage', () => {
    const options: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    assert.strictEqual(options.stage, 'staging');
  });

  it('should support production stage', () => {
    const options: SSTDeploymentOptions = {
      stage: 'production' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    assert.strictEqual(options.stage, 'production');
  });

  it('should have different config for different stages', () => {
    const config: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: { domain: 'staging.app.com' },
        production: { domain: 'app.com' },
      },
    };

    const stagingOpts: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config,
    };

    const productionOpts: SSTDeploymentOptions = {
      stage: 'production' as DeploymentStage,
      projectRoot: '/tmp/test',
      config,
    };

    assert.notStrictEqual(
      stagingOpts.config.stageConfig.staging?.domain,
      productionOpts.config.stageConfig.production?.domain
    );
  });

  it('should accept complete option set', () => {
    const completeOptions: SSTDeploymentOptions = {
      stage: 'production' as DeploymentStage,
      projectRoot: '/app',
      config: mockConfig,
      awsProfile: 'production-profile',
      timeoutMinutes: 20,
      logFile: '/var/log/deployment.log',
    };

    assert.ok(completeOptions.stage);
    assert.ok(completeOptions.projectRoot);
    assert.ok(completeOptions.config);
    assert.ok(completeOptions.awsProfile);
    assert.ok(completeOptions.timeoutMinutes);
    assert.ok(completeOptions.logFile);
  });

  it('should accept minimal option set', () => {
    const minimalOptions: SSTDeploymentOptions = {
      stage: 'staging' as DeploymentStage,
      projectRoot: '/tmp/test',
      config: mockConfig,
    };

    assert.ok(minimalOptions.stage);
    assert.ok(minimalOptions.projectRoot);
    assert.ok(minimalOptions.config);
    assert.strictEqual(minimalOptions.awsProfile, undefined);
    assert.strictEqual(minimalOptions.timeoutMinutes, undefined);
  });
});
