/**
 * SST Config Validation Check
 * Ensures sst.config.ts exists, has valid syntax, and detects common configuration issues
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import { validateSSTConfig, formatValidationErrors } from '../../lib/sst-link-permissions.js';

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

    // Basic syntax check + advanced validation
    try {
      const content = readFileSync(sstConfigPath, 'utf-8');

      if (!content.includes('export default')) {
        return {
          passed: false,
          issue: 'sst.config.ts missing "export default"',
          manualFix: 'Fix sst.config.ts syntax',
        };
      }

      // Run advanced validations (link+permissions conflicts, GSI permissions, Pulumi Output misuse)
      const violations = validateSSTConfig(content);

      if (violations.length > 0) {
        const errorMessage = formatValidationErrors(violations);
        const hasErrors = violations.some(v => v.severity === 'error');

        if (hasErrors) {
          return {
            passed: false,
            issue: 'SST config has errors that will cause deployment failures',
            manualFix: errorMessage,
            canAutoFix: false,
          };
        } else {
          // Warnings only - show but don't fail
          console.log(chalk.yellow('\n⚠️  SST config warnings detected:\n'));
          console.log(errorMessage);
          console.log(chalk.green('\n✅ sst.config.ts found (with warnings)\n'));
          return { passed: true };
        }
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
