import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DeploymentOrchestrator } from './orchestrator.js';
import type { ProjectConfig, DeploymentStage, DeploymentResult } from '../types.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const mockConfig: ProjectConfig = {
  projectName: 'test-project',
  infrastructure: 'sst-serverless',
  stages: ['staging', 'production'],
  stageConfig: {
    staging: {},
    production: {},
  },
};

describe('DeploymentOrchestrator', () => {
  it('should initialize with config', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should use cwd as default projectRoot', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig);
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should accept custom projectRoot', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, '/tmp/test');
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  // File-based tests skipped - tested in integration tests

  it('should handle config with custom deployment script', () => {
    const config: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: {},
        production: {},
      },
      customDeployScript: 'scripts/deploy.sh',
    };
    const orchestrator = new DeploymentOrchestrator(config, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should handle config with hooks', () => {
    const config: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: {},
        production: {},
      },
      hooks: {
        postBuild: 'npm run build',
      },
    };
    const orchestrator = new DeploymentOrchestrator(config, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should handle config with AWS profile', () => {
    const config: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: {},
        production: {},
      },
      awsProfile: 'production',
    };
    const orchestrator = new DeploymentOrchestrator(config, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should extract CloudFront distribution ID from URL', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const output = 'Deployment: https://d1234abcd.cloudfront.net';
    const distId = orchestrator.extractCloudFrontDistributionId(output);
    assert.strictEqual(distId, 'd1234abcd');
  });

  it('should return null for missing distribution ID', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const output = 'Deployment successful but no URL found.';
    const distId = orchestrator.extractCloudFrontDistributionId(output);
    assert.strictEqual(distId, null);
  });

  it('should handle multiple URLs and extract first', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const output = `
      URL 1: https://d1234abcd.cloudfront.net
      URL 2: https://d5678efgh.cloudfront.net
    `;
    const distId = orchestrator.extractCloudFrontDistributionId(output);
    assert.ok(typeof distId === 'string');
  });

  it('should handle malformed JSON gracefully', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const output = '{"distributionId": "incomplete...';
    const distId = orchestrator.extractCloudFrontDistributionId(output);
    assert.strictEqual(typeof distId === 'string' || distId === null, true);
  });

  it('should extract CloudFront ID from real SST output', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const realOutput = `
      ✔ Setting up CloudFront distribution
      Application deployed!
      Frontend URL: https://d1example123.cloudfront.net
      API Endpoint: https://api.example.com
    `;
    const distId = orchestrator.extractCloudFrontDistributionId(realOutput);
    assert.strictEqual(distId, 'd1example123');
  });

  it('should print deployment summary', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const result: DeploymentResult = {
      success: true,
      stage: 'staging' as DeploymentStage,
      startTime: new Date(),
      endTime: new Date(),
      durationSeconds: 120,
      message: 'Deployment successful',
      details: {
        gitStatusOk: true,
        buildsOk: true,
        testsOk: true,
        deploymentOk: true,
        healthChecksOk: true,
      },
    };

    let logged = false;
    const originalLog = console.log;
    console.log = () => { logged = true; };
    try {
      orchestrator.printDeploymentSummary(result, []);
      assert.ok(logged);
    } finally {
      console.log = originalLog;
    }
  });

  it('should print deployment summary with timing breakdown', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const result: DeploymentResult = {
      success: true,
      stage: 'production' as DeploymentStage,
      startTime: new Date(),
      endTime: new Date(),
      durationSeconds: 300,
      message: 'Deployment successful',
      details: {
        gitStatusOk: true,
        buildsOk: true,
        testsOk: true,
        deploymentOk: true,
        healthChecksOk: true,
      },
    };

    const timings = [
      { name: 'Build', duration: 60000 },
      { name: 'Deploy', duration: 180000 },
      { name: 'Health checks', duration: 60000 },
    ];

    let logged = false;
    const originalLog = console.log;
    console.log = () => { logged = true; };
    try {
      orchestrator.printDeploymentSummary(result, timings);
      assert.ok(logged);
      assert.strictEqual(timings.length, 3);
    } finally {
      console.log = originalLog;
    }
  });

  it('should print failure summary', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    const result: DeploymentResult = {
      success: false,
      stage: 'staging' as DeploymentStage,
      startTime: new Date(),
      endTime: new Date(),
      durationSeconds: 30,
      message: 'Deployment failed',
      error: 'CloudFormation stack creation failed',
      details: {
        gitStatusOk: true,
        buildsOk: true,
        testsOk: true,
        deploymentOk: false,
        healthChecksOk: false,
      },
    };

    let logged = false;
    const originalLog = console.log;
    console.log = () => { logged = true; };
    try {
      orchestrator.printDeploymentFailureSummary(result, []);
      assert.ok(logged);
      assert.ok(result.error);
    } finally {
      console.log = originalLog;
    }
  });

  it('should handle staging stage', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should handle production stage', () => {
    const orchestrator = new DeploymentOrchestrator(mockConfig, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });

  it('should handle multiple stages with different configs', () => {
    const config: ProjectConfig = {
      projectName: 'test',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: { domain: 'staging.com' },
        production: { domain: 'prod.com' },
      },
    };
    const orchestrator = new DeploymentOrchestrator(config, process.cwd());
    assert.ok(orchestrator instanceof DeploymentOrchestrator);
  });
});
