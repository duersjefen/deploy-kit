/**
 * Tests for AWS Profile Auto-Detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { resolveAwsProfile, detectProfileFromSstConfig } from '../cli/utils/aws-profile-detector.js';
import type { ProjectConfig } from '../types.js';

describe('AWS Profile Auto-Detection', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(process.cwd(), '.test-sst-config');
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('detectProfileFromSstConfig', () => {
    it('should detect profile from sst.config.ts with single quotes', () => {
      const content = `
import { SSTConfig } from "sst";
export default {
  config() {
    return {
      name: "test-app",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      const provider = new aws.Provider(stack, "provider", {
        region: "us-east-1",
        profile: 'my-profile'
      });
    });
  }
} satisfies SSTConfig;
`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);
      const profile = detectProfileFromSstConfig(testDir);
      expect(profile).toBe('my-profile');
    });

    it('should detect profile from sst.config.ts with double quotes', () => {
      const content = `
import { SSTConfig } from "sst";
export default {
  config() {
    return {
      name: "test-app",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      const provider = new aws.Provider(stack, "provider", {
        region: "us-east-1",
        profile: "production-profile"
      });
    });
  }
} satisfies SSTConfig;
`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);
      const profile = detectProfileFromSstConfig(testDir);
      expect(profile).toBe('production-profile');
    });

    it('should handle profile with hyphens and numbers', () => {
      const content = `profile: 'my-profile-123'`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);
      const profile = detectProfileFromSstConfig(testDir);
      expect(profile).toBe('my-profile-123');
    });

    it('should return undefined if sst.config.ts does not exist', () => {
      const profile = detectProfileFromSstConfig(testDir);
      expect(profile).toBeUndefined();
    });

    it('should return undefined if profile is not found in file', () => {
      const content = `
import { SSTConfig } from "sst";
export default {
  config() {
    return {
      name: "test-app",
      region: "us-east-1"
    };
  }
} satisfies SSTConfig;
`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);
      const profile = detectProfileFromSstConfig(testDir);
      expect(profile).toBeUndefined();
    });
  });

  describe('resolveAwsProfile', () => {
    it('should return explicit awsProfile if specified', () => {
      const config: ProjectConfig = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {},
        awsProfile: 'explicit-profile',
      };

      const profile = resolveAwsProfile(config, testDir);
      expect(profile).toBe('explicit-profile');
    });

    it('should auto-detect profile from sst.config.ts for SST projects', () => {
      const content = `profile: 'auto-detected-profile'`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);

      const config: ProjectConfig = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {},
      };

      const profile = resolveAwsProfile(config, testDir);
      expect(profile).toBe('auto-detected-profile');
    });

    it('should prefer explicit awsProfile over auto-detection', () => {
      const content = `profile: 'auto-detected-profile'`;
      writeFileSync(join(testDir, 'sst.config.ts'), content);

      const config: ProjectConfig = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {},
        awsProfile: 'explicit-profile',
      };

      const profile = resolveAwsProfile(config, testDir);
      expect(profile).toBe('explicit-profile');
    });

    it('should return undefined for non-SST projects without awsProfile', () => {
      const config: ProjectConfig = {
        projectName: 'test-app',
        infrastructure: 'ec2-docker',
        stages: ['staging', 'production'],
        stageConfig: {},
      };

      const profile = resolveAwsProfile(config, testDir);
      expect(profile).toBeUndefined();
    });

    it('should return undefined if SST config not found for SST projects', () => {
      const config: ProjectConfig = {
        projectName: 'test-app',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {},
      };

      const profile = resolveAwsProfile(config, testDir);
      expect(profile).toBeUndefined();
    });
  });
});
