import { describe, it, beforeEach, afterEach } from 'node:test';
import { assert } from '../test-utils.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isSSTProject } from './orchestration-coordinator.js';
describe('Orchestration Coordinator', () => {
    let testDir;
    beforeEach(() => {
        // Create a temporary directory for tests
        testDir = join(tmpdir(), `test-sst-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
    });
    afterEach(() => {
        // Clean up temporary directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });
    describe('isSSTProject', () => {
        it('returns true when sst.config.ts exists', () => {
            // Create sst.config.ts file
            writeFileSync(join(testDir, 'sst.config.ts'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === true);
        });
        it('returns true when sst.config.js exists', () => {
            // Create sst.config.js file
            writeFileSync(join(testDir, 'sst.config.js'), 'module.exports = {}');
            const result = isSSTProject(testDir);
            assert(result === true);
        });
        it('returns true when both sst.config files exist (prefers .ts)', () => {
            writeFileSync(join(testDir, 'sst.config.ts'), 'export default {}');
            writeFileSync(join(testDir, 'sst.config.js'), 'module.exports = {}');
            const result = isSSTProject(testDir);
            assert(result === true);
        });
        it('returns false when no sst.config file exists', () => {
            // Create empty directory
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('returns false when only other files exist', () => {
            writeFileSync(join(testDir, 'package.json'), '{}');
            writeFileSync(join(testDir, 'tsconfig.json'), '{}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('returns false when sst.config.mjs exists (wrong extension)', () => {
            writeFileSync(join(testDir, 'sst.config.mjs'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('handles directory with other files named similar to sst.config', () => {
            writeFileSync(join(testDir, 'sst-config.ts'), 'export default {}');
            writeFileSync(join(testDir, 'sst_config.ts'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('returns false for nested directories (only checks immediate directory)', () => {
            const nestedDir = join(testDir, 'nested');
            mkdirSync(nestedDir);
            writeFileSync(join(nestedDir, 'sst.config.ts'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('returns true for real project structure', () => {
            // Simulate a real SST project structure
            writeFileSync(join(testDir, 'sst.config.ts'), `
        import { SSTConfig } from "sst";
        import { API } from "./stacks/api";

        export default {
          config(_input) {
            return {
              name: "my-app",
              region: "us-east-1",
            };
          },
          stacks(app) {
            app.stack(API);
          },
        } satisfies SSTConfig;
      `);
            writeFileSync(join(testDir, 'package.json'), '{"name": "my-app"}');
            const result = isSSTProject(testDir);
            assert(result === true);
        });
        it('handles empty sst.config.ts', () => {
            writeFileSync(join(testDir, 'sst.config.ts'), '');
            const result = isSSTProject(testDir);
            assert(result === true);
        });
        it('is case-sensitive for file extension', () => {
            writeFileSync(join(testDir, 'sst.config.TS'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('is case-sensitive for file name', () => {
            writeFileSync(join(testDir, 'SST.config.ts'), 'export default {}');
            const result = isSSTProject(testDir);
            assert(result === false);
        });
        it('handles non-existent directory gracefully', () => {
            const nonExistentDir = join(testDir, 'does-not-exist');
            const result = isSSTProject(nonExistentDir);
            assert(result === false);
        });
    });
});
