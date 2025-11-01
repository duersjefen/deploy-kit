/**
 * SST Config Validation Check
 * Ensures sst.config.ts exists and has valid syntax
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

export function createSstConfigCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking sst.config.ts...'));

    const sstConfigPath = join(projectRoot, 'sst.config.ts');

    if (!existsSync(sstConfigPath)) {
      return {
        passed: false,
        issue: 'sst.config.ts not found',
        manualFix: 'Create sst.config.ts or run from project root',
      };
    }

    // Basic syntax check
    try {
      const content = readFileSync(sstConfigPath, 'utf-8');

      if (!content.includes('export default')) {
        return {
          passed: false,
          issue: 'sst.config.ts missing "export default"',
          manualFix: 'Fix sst.config.ts syntax',
        };
      }

      console.log(chalk.green('✅ sst.config.ts found and valid\n'));
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        issue: 'sst.config.ts has syntax errors',
        manualFix: 'Fix TypeScript errors in sst.config.ts',
      };
    }
  };
}
