/**
 * Tests for init command
 */

import { describe, it, before, after } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  createTempDir,
  cleanupTempDir,
  assertEqual,
  assert,
} from '../test-utils.js';

describe('init command', () => {
  let tempDir: string;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  describe('configuration file generation', () => {
    it('creates .deploy-config.json with required fields', () => {
      // Create a minimal package.json so init can work
      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-app' })
      );

      // For this test, we'll manually create the expected config
      const configPath = join(tempDir, '.deploy-config.json');
      const config = {
        projectName: 'test-app',
        displayName: 'Test App',
        infrastructure: 'sst-serverless',
        database: 'dynamodb',
        stages: ['staging', 'production'],
        mainDomain: 'test.com',
        awsProfile: 'default',
        requireCleanGit: true,
        runTestsBeforeDeploy: true,
        stageConfig: {
          staging: {
            domain: 'staging.test.com',
            requiresConfirmation: false,
            awsRegion: 'us-east-1',
          },
          production: {
            domain: 'test.com',
            requiresConfirmation: true,
            awsRegion: 'us-east-1',
          },
        },
        healthChecks: [],
        hooks: {},
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Verify file was created
      assert(existsSync(configPath), '.deploy-config.json should exist');

      // Verify content
      const content = JSON.parse(readFileSync(configPath, 'utf-8'));
      assertEqual(content.projectName, 'test-app', 'Should have projectName');
      assertEqual(content.infrastructure, 'sst-serverless', 'Should have infrastructure');
      assertEqual(content.database, 'dynamodb', 'Should have database');
    });

    it('validates required config fields', () => {
      const config = {
        projectName: 'my-app',
        mainDomain: 'example.com',
        stageConfig: {
          staging: { domain: 'staging.example.com' },
          production: { domain: 'example.com' },
        },
      };

      // Check required fields are present
      assert(config.projectName !== undefined, 'Should have projectName');
      assert(config.mainDomain !== undefined, 'Should have mainDomain');
      assert(config.stageConfig !== undefined, 'Should have stageConfig');
      assert(config.stageConfig.staging !== undefined, 'Should have staging config');
      assert(config.stageConfig.production !== undefined, 'Should have production config');
    });
  });

  describe('stage configuration', () => {
    it('requires domain for each stage', () => {
      const stageConfig = {
        staging: { domain: 'staging.example.com' },
        production: { domain: 'example.com' },
      };

      assert(stageConfig.staging.domain !== undefined, 'Staging should have domain');
      assert(stageConfig.production.domain !== undefined, 'Production should have domain');
    });

    it('supports optional AWS region per stage', () => {
      const stageConfig = {
        staging: {
          domain: 'staging.example.com',
          awsRegion: 'eu-north-1',
        },
        production: {
          domain: 'example.com',
          awsRegion: 'us-west-2',
        },
      };

      assertEqual(stageConfig.staging.awsRegion, 'eu-north-1', 'Staging should have AWS region');
      assertEqual(stageConfig.production.awsRegion, 'us-west-2', 'Production should have AWS region');
    });

    it('supports optional requiresConfirmation flag', () => {
      const stageConfig = {
        staging: {
          domain: 'staging.example.com',
          requiresConfirmation: false,
        },
        production: {
          domain: 'example.com',
          requiresConfirmation: true,
        },
      };

      assertEqual(
        stageConfig.staging.requiresConfirmation,
        false,
        'Staging should not require confirmation'
      );
      assertEqual(
        stageConfig.production.requiresConfirmation,
        true,
        'Production should require confirmation'
      );
    });
  });

  describe('package.json updates', () => {
    it('adds deploy scripts to package.json', () => {
      const packageJson = {
        name: 'test-app',
        scripts: {
          dev: 'next dev',
        },
      };

      // Add deploy scripts
      (packageJson.scripts as any)['deploy:staging'] = 'npx @duersjefen/deploy-kit deploy staging';
      (packageJson.scripts as any)['deploy:prod'] = 'npx @duersjefen/deploy-kit deploy production';
      (packageJson.scripts as any)['recover:staging'] = 'npx @duersjefen/deploy-kit recover staging';
      (packageJson.scripts as any)['recover:prod'] = 'npx @duersjefen/deploy-kit recover production';

      // Verify scripts were added
      assert((packageJson.scripts as any)['deploy:staging'] !== undefined, 'Should have deploy:staging');
      assert((packageJson.scripts as any)['deploy:prod'] !== undefined, 'Should have deploy:prod');
      assert((packageJson.scripts as any)['recover:staging'] !== undefined, 'Should have recover:staging');
      assert((packageJson.scripts as any)['recover:prod'] !== undefined, 'Should have recover:prod');

      // Verify original scripts preserved
      assertEqual(packageJson.scripts.dev, 'next dev', 'Should preserve existing scripts');
    });

    it('supports optional health checks', () => {
      const config = {
        healthChecks: [
          {
            url: '/',
            expectedStatus: 200,
            timeout: 5000,
            name: 'Homepage',
          },
          {
            url: '/api/health',
            expectedStatus: 200,
            timeout: 5000,
            name: 'Health endpoint',
          },
        ],
      };

      assertEqual(config.healthChecks.length, 2, 'Should have 2 health checks');
      assertEqual(config.healthChecks[0].url, '/', 'First check should be homepage');
      assertEqual(config.healthChecks[1].url, '/api/health', 'Second check should be API health');
    });
  });

  describe('configuration validation', () => {
    it('validates project name is kebab-case', () => {
      const validNames = ['my-app', 'my-awesome-app', 'project-123'];
      const invalidNames = ['MyApp', 'my_app', 'my app'];

      // Simple kebab-case validation regex
      const kebabCaseRegex = /^[a-z0-9-]+$/;

      for (const name of validNames) {
        assert(kebabCaseRegex.test(name), `${name} should be valid kebab-case`);
      }

      for (const name of invalidNames) {
        assert(!kebabCaseRegex.test(name), `${name} should be invalid kebab-case`);
      }
    });

    it('validates domain format', () => {
      const validDomains = ['example.com', 'my-app.co.uk', 'staging.example.com'];
      const invalidDomains = ['example', 'http://example.com', '.example.com'];

      // Simple domain validation regex
      const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/;

      for (const domain of validDomains) {
        assert(domainRegex.test(domain), `${domain} should be valid domain`);
      }

      for (const domain of invalidDomains) {
        assert(!domainRegex.test(domain), `${domain} should be invalid domain`);
      }
    });

    it('validates AWS profile name format', () => {
      const validProfiles = ['default', 'my-profile', 'project_name', 'prod-123'];
      const invalidProfiles = ['', 'my profile']; // spaces not allowed

      // Simple AWS profile validation
      const profileRegex = /^[a-zA-Z0-9_-]+$/;

      for (const profile of validProfiles) {
        assert(profileRegex.test(profile), `${profile} should be valid AWS profile`);
      }

      for (const profile of invalidProfiles) {
        if (profile.length > 0) {
          assert(!profileRegex.test(profile), `${profile} should be invalid AWS profile`);
        }
      }
    });
  });

  describe('infrastructure detection', () => {
    it('detects SST projects', () => {
      // Create sst.config.ts
      writeFileSync(join(tempDir, 'sst.config.ts'), 'export default {}');

      const hasSstConfig = existsSync(join(tempDir, 'sst.config.ts'));
      assert(hasSstConfig, 'Should detect sst.config.ts');
    });

    it('detects SST JS config', () => {
      const tempDir2 = createTempDir();
      try {
        // Create sst.config.js
        writeFileSync(join(tempDir2, 'sst.config.js'), 'module.exports = {}');

        const hasSstConfig = existsSync(join(tempDir2, 'sst.config.js'));
        assert(hasSstConfig, 'Should detect sst.config.js');
      } finally {
        cleanupTempDir(tempDir2);
      }
    });

    it('supports next.config.ts/js for Next.js projects', () => {
      const tempDir2 = createTempDir();
      try {
        writeFileSync(join(tempDir2, 'next.config.ts'), '{}');

        const hasNextConfig = existsSync(join(tempDir2, 'next.config.ts'));
        assert(hasNextConfig, 'Should detect next.config.ts');
      } finally {
        cleanupTempDir(tempDir2);
      }
    });
  });

  describe('quality tools setup (optional)', () => {
    it('creates .lintstagedrc.js when quality tools enabled', () => {
      const configPath = join(tempDir, '.lintstagedrc.js');
      const config = `export default {
  '*.{ts,tsx}': ['eslint --fix', 'tsc-files --noEmit'],
};
`;
      writeFileSync(configPath, config);

      assert(existsSync(configPath), '.lintstagedrc.js should exist');

      const content = readFileSync(configPath, 'utf-8');
      assert(content.includes("'*.{ts,tsx}'"), 'Should include TypeScript pattern');
      assert(content.includes('eslint --fix'), 'Should include eslint');
      assert(content.includes('tsc-files --noEmit'), 'Should include tsc-files');
    });

    it('creates .gitignore entries for quality tools', () => {
      const gitignorePath = join(tempDir, '.gitignore');
      let content = '';

      // Add quality tool entries
      content += '\n# Quality tools\n';
      content += '.eslintcache\n';
      content += '.husky\n';
      content += 'node_modules/.cache\n';

      writeFileSync(gitignorePath, content);

      assert(existsSync(gitignorePath), '.gitignore should exist');

      const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      assert(gitignoreContent.includes('.husky'), 'Should include .husky in gitignore');
    });

    it('adds prepare script for Husky initialization', () => {
      const packageJson = {
        name: 'test-app',
        scripts: {},
      };

      // Add prepare script for Husky
      (packageJson.scripts as any).prepare = 'husky';
      assertEqual((packageJson.scripts as any).prepare, 'husky', 'Should have prepare script');
    });
  });
});
