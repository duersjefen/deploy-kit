/**
 * SST Pattern Detection System (DEP-30)
 *
 * Comprehensive pattern detection and auto-fix system for SST configurations.
 *
 * Prevents silent deployment failures like the staging.mawave.app incident
 * where `input?.stage || "dev"` caused domain configuration to break.
 *
 * @see https://linear.app/paiss/issue/DEP-30
 */

// Core types
export type {
  PatternViolation,
  PatternDetectionResult,
  PatternRule,
  PatternCategory,
  PatternSeverity,
  FixConfidence,
  CodeFix,
  AutoFixOptions,
  AutoFixResult,
  PatternDetectionContext,
  ErrorCatalogEntry,
} from './types.js';

// Pattern detector
export { SSTPatternDetector } from './pattern-detector.js';

// Pattern rules
export {
  ALL_RULES,
  getEnabledRules,
  getRuleById,
  getRulesByCategory,
  stageVariableRule,
  domainConfigRule,
  corsConfigRule,
  envVariableRule,
  pulumiOutputRule,
  resourceDependencyRule,
} from './rules/index.js';

// Auto-fixer
export { AutoFixer, formatAutoFixResult } from './auto-fixer.js';

// Formatter
export {
  formatPatternViolations,
  formatPatternDetectionSummary,
  formatPatternViolationsByCategory,
  formatViolationWithCatalog,
  formatQuickSummary,
} from './formatter.js';

// Error catalog
export {
  ERROR_CATALOG,
  getErrorInfo,
  getErrorsByCategory,
  formatErrorCatalogEntry,
} from './error-catalog.js';

// Import for convenience functions
import { SSTPatternDetector } from './pattern-detector.js';
import { getEnabledRules } from './rules/index.js';
import { formatPatternViolations } from './formatter.js';
import type { PatternDetectionResult } from './types.js';

/**
 * Convenience function to create a pattern detector with all rules
 */
export function createPatternDetector(): SSTPatternDetector {
  const detector = new SSTPatternDetector();
  detector.registerRules(getEnabledRules());
  return detector;
}

/**
 * Convenience function to detect and format violations
 */
export function detectAndFormat(configPath: string, projectRoot: string): {
  result: PatternDetectionResult;
  formatted: string;
  hasCriticalErrors: boolean;
} {
  const detector = createPatternDetector();
  const result = detector.detect(configPath, projectRoot);
  const formatted = formatPatternViolations(result.violations);
  const hasCriticalErrors = result.errorCount > 0;

  return {
    result,
    formatted,
    hasCriticalErrors,
  };
}
