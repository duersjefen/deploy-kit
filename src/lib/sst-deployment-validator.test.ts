import { test } from 'node:test';
import assert from 'node:assert';
import { parseSSTDomainConfig } from './sst-deployment-validator.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * DEP-25: Test sst.aws.dns() detection with and without arguments
 */

test('parseSSTDomainConfig - detects sst.aws.dns() without arguments', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: "example.com",
              dns: sst.aws.dns()
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, true);
    assert.strictEqual(result?.usesSstDns, true);
    assert.strictEqual(result?.hasExplicitZone, false);
    assert.strictEqual(result?.domainName, 'example.com');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - detects sst.aws.dns() with zone ID (inline)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: "staging.example.com",
              dns: sst.aws.dns({ zone: "Z009045037PQISRABUZ1C" })
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, true);
    assert.strictEqual(result?.usesSstDns, true);
    assert.strictEqual(result?.hasExplicitZone, true);
    assert.strictEqual(result?.domainName, 'staging.example.com');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - detects sst.aws.dns() with zone ID (multiline)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: \`\${stage}.mawave.app\`,
              dns: sst.aws.dns({
                zone: "Z009045037PQISRABUZ1C"
              }),
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, true);
    assert.strictEqual(result?.usesSstDns, true);
    assert.strictEqual(result?.hasExplicitZone, true);
    assert.strictEqual(result?.domainName, 'staging.mawave.app');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - detects sst.aws.dns() without space after colon', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: "example.com",
              dns:sst.aws.dns()
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, true);
    assert.strictEqual(result?.usesSstDns, true);
    assert.strictEqual(result?.hasExplicitZone, false);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - ignores commented out sst.aws.dns()', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: "example.com"
              // dns: sst.aws.dns()
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, true);
    assert.strictEqual(result?.usesSstDns, false);
    assert.strictEqual(result?.hasExplicitZone, false);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - no domain configured', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {});
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.hasDomain, false);
    assert.strictEqual(result?.usesSstDns, false);
    assert.strictEqual(result?.hasExplicitZone, false);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - returns null when no sst.config.ts exists', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const result = parseSSTDomainConfig(tempDir, 'staging');
    assert.strictEqual(result, null);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - extracts domain name from template literal', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: \`\${stage}.example.com\`,
              dns: sst.aws.dns()
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.domainName, 'staging.example.com');
    assert.strictEqual(result?.baseDomain, 'example.com');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('parseSSTDomainConfig - hasExplicitZone false when zone in comments', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const sstConfig = `
      export default $config({
        app() {
          return { name: "test" };
        },
        async run() {
          new sst.aws.Nextjs("Web", {
            domain: stage !== "dev" ? {
              name: "example.com",
              dns: sst.aws.dns()
              /* dns: sst.aws.dns({ zone: "Z123" }) */
            } : undefined
          });
        }
      });
    `;
    writeFileSync(join(tempDir, 'sst.config.ts'), sstConfig);

    const result = parseSSTDomainConfig(tempDir, 'staging');

    assert.strictEqual(result?.usesSstDns, true);
    assert.strictEqual(result?.hasExplicitZone, false);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});
