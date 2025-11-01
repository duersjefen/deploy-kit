import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTurbopackMigrationCheck } from './turbopack-migration.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Turbopack Migration Check', () => {
  it('passes when no next.config found', async () => {
    const check = createTurbopackMigrationCheck(tmpdir());
    const result = await check();
    assert.equal(result.passed, true);
  });

  it('passes when no custom webpack config', async () => {
    const projectRoot = join(tmpdir(), 'test-nextjs-no-webpack');
    mkdirSync(projectRoot, { recursive: true });

    const nextConfig = `
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
`;
    writeFileSync(join(projectRoot, 'next.config.js'), nextConfig);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        next: '16.0.0',
      },
    }));

    const check = createTurbopackMigrationCheck(projectRoot);
    const result = await check();
    assert.equal(result.passed, true);
  });

  it('warns when webpack config without turbopack', async () => {
    const projectRoot = join(tmpdir(), 'test-nextjs-webpack-only');
    mkdirSync(projectRoot, { recursive: true });

    const nextConfig = `
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      '@': './src',
    };
    return config;
  },
};

module.exports = nextConfig;
`;
    writeFileSync(join(projectRoot, 'next.config.js'), nextConfig);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        next: '16.0.0',
      },
    }));

    const check = createTurbopackMigrationCheck(projectRoot);
    const result = await check();
    assert.equal(result.passed, false);
    assert.equal(result.errorType, 'turbopack_migration_needed');
    assert.match(result.manualFix || '', /turbopack/);
  });

  it('passes when turbopack config present', async () => {
    const projectRoot = join(tmpdir(), 'test-nextjs-turbopack');
    mkdirSync(projectRoot, { recursive: true });

    const nextConfig = `
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      '@': './src',
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@': './src',
    },
  },
};

module.exports = nextConfig;
`;
    writeFileSync(join(projectRoot, 'next.config.js'), nextConfig);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        next: '16.0.0',
      },
    }));

    const check = createTurbopackMigrationCheck(projectRoot);
    const result = await check();
    assert.equal(result.passed, true);
  });

  it('skips check for Next.js <16', async () => {
    const projectRoot = join(tmpdir(), 'test-nextjs-15');
    mkdirSync(projectRoot, { recursive: true });

    const nextConfig = `
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      '@': './src',
    };
    return config;
  },
};

module.exports = nextConfig;
`;
    writeFileSync(join(projectRoot, 'next.config.js'), nextConfig);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        next: '15.0.0',
      },
    }));

    const check = createTurbopackMigrationCheck(projectRoot);
    const result = await check();
    assert.equal(result.passed, true);
  });

  it('suggests alias migration', async () => {
    const projectRoot = join(tmpdir(), 'test-nextjs-alias');
    mkdirSync(projectRoot, { recursive: true });

    const nextConfig = `
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      '@components': './src/components',
      '@utils': './src/utils',
    };
    return config;
  },
};

module.exports = nextConfig;
`;
    writeFileSync(join(projectRoot, 'next.config.js'), nextConfig);
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        next: '16.0.0',
      },
    }));

    const check = createTurbopackMigrationCheck(projectRoot);
    const result = await check();
    assert.equal(result.passed, false);
    const manualFix = result.manualFix || '';
    assert.match(manualFix, /resolveAlias/);
    assert.match(manualFix, /Copy alias definitions/);
  });
});
