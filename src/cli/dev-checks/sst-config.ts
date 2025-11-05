/**
 * SST Config Validation Check
 * Ensures sst.config.ts exists, has valid syntax, and detects common configuration issues
 *
 * Includes:
 * - DEP-22: Basic syntax and structure validation
 * - DEP-25: Link+permissions conflicts detection
 * - DEP-26: Pulumi Output misuse patterns
 * - DEP-27: Value validation (CORS, Lambda, DynamoDB)
 * - DEP-30: Pattern detection (stage variables, domain config, etc.)
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import { validateSSTConfig, formatValidationErrors } from '../../lib/sst-link-permissions.js';
import { SSTConfigValidator, formatValidationErrors as formatConfigErrors } from '../../lib/sst-config-validator.js';
import { createPatternDetector, formatPatternViolations } from '../../lib/pattern-detection/index.js';

export type SstConfigCheckMode = 'dev' | 'deploy';

export function createSstConfigCheck(
  projectRoot: string,
  mode: SstConfigCheckMode = 'dev'
): () => Promise<CheckResult> {
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

      // Run DEP-27 validations (CORS, Lambda timeout/memory, DynamoDB TTL, etc.)
      const validator = new SSTConfigValidator();
      const configIssues = validator.validate(sstConfigPath);

      // Run DEP-30 pattern detection (stage variables, domain config, etc.)
      const patternDetector = createPatternDetector();
      const patternResult = patternDetector.detect(sstConfigPath, projectRoot);

      const allIssues = [...violations, ...configIssues];
      const hasPatternIssues = patternResult.violations.length > 0;

      if (allIssues.length > 0 || hasPatternIssues) {
        const linkPermErrors = formatValidationErrors(violations);
        const configErrors = formatConfigErrors(configIssues);
        const patternErrors = formatPatternViolations(patternResult.violations);
        const errorMessage = [linkPermErrors, configErrors, patternErrors].filter(Boolean).join('\n\n');

        // In dev mode, treat deployment-specific pattern errors as warnings
        // Deployment-specific patterns: SST-VAL-001 (input.stage), SST-VAL-011 (stage !== "dev")
        const deploymentOnlyPatternCodes = ['SST-VAL-001', 'SST-VAL-011'];

        let patternErrorCount = patternResult.errorCount;
        if (mode === 'dev') {
          // Count only non-deployment-specific pattern errors
          const blockingPatternErrors = patternResult.violations.filter(
            v => v.severity === 'error' && !deploymentOnlyPatternCodes.includes(v.code)
          ).length;
          patternErrorCount = blockingPatternErrors;
        }

        const hasErrors = violations.some(v => v.severity === 'error') ||
                         configIssues.some(i => i.severity === 'error') ||
                         patternErrorCount > 0;

        const hasAutoFixable = patternResult.autoFixableCount > 0;

        if (hasErrors) {
          return {
            passed: false,
            issue: mode === 'deploy'
              ? 'SST config has errors that will cause deployment failures'
              : 'SST config has errors that will prevent development',
            manualFix: errorMessage + (hasAutoFixable ? '\n\n💡 Tip: Run with --fix flag to auto-fix some issues' : ''),
            canAutoFix: hasAutoFixable,
          };
        } else {
          // Warnings only - show but don't fail
          console.log(chalk.yellow('\n⚠️  SST config warnings detected:\n'));
          console.log(errorMessage);
          if (mode === 'dev') {
            console.log(chalk.yellow('💡 These issues won\'t block local development but should be fixed before deploying\n'));
          }
          console.log(chalk.green('✅ sst.config.ts found (with warnings)\n'));
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
