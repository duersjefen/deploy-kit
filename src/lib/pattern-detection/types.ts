/**
 * Type definitions for SST Pattern Detection System (DEP-30)
 *
 * Core types for AST-based pattern detection, auto-fix system, and error catalog.
 */

import type * as ts from 'typescript';

/**
 * Confidence level for auto-fix suggestions
 */
export type FixConfidence = 'high' | 'medium' | 'low';

/**
 * Pattern violation severity
 */
export type PatternSeverity = 'error' | 'warning';

/**
 * Pattern category for organizing rules
 */
export type PatternCategory =
  | 'stage-variable'
  | 'function-signature'
  | 'domain-config'
  | 'cors-config'
  | 'pulumi-output'
  | 'environment-variable'
  | 'resource-dependency';

/**
 * Code fix transformation
 */
export interface CodeFix {
  /** Original code snippet */
  oldCode: string;
  /** Fixed code snippet */
  newCode: string;
  /** Confidence level for this fix */
  confidence: FixConfidence;
  /** Description of what the fix does */
  description: string;
  /** Start position in source file */
  start: number;
  /** End position in source file */
  end: number;
}

/**
 * Pattern violation detected in SST config
 */
export interface PatternViolation {
  /** Unique error code (e.g., SST-VAL-001) */
  code: string;
  /** Violation severity */
  severity: PatternSeverity;
  /** Category of the pattern */
  category: PatternCategory;
  /** Resource where violation was found */
  resource: string;
  /** Property or location of the violation */
  property: string;
  /** Human-readable error message */
  message: string;
  /** Line number in source file */
  line?: number;
  /** Column number in source file */
  column?: number;
  /** Suggested fix (may be auto-applicable) */
  fix?: CodeFix;
  /** Link to documentation */
  docsUrl?: string;
  /** Related error codes or patterns */
  relatedCodes?: string[];
}

/**
 * Context passed to pattern rules during detection
 */
export interface PatternDetectionContext {
  /** TypeScript source file */
  sourceFile: ts.SourceFile;
  /** Source code content */
  sourceCode: string;
  /** Project root directory */
  projectRoot: string;
  /** Type checker (optional, for advanced type analysis) */
  typeChecker?: ts.TypeChecker;
}

/**
 * Result of pattern detection
 */
export interface PatternDetectionResult {
  /** All violations found */
  violations: PatternViolation[];
  /** Number of errors */
  errorCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Number of auto-fixable issues */
  autoFixableCount: number;
  /** Detection time in milliseconds */
  duration: number;
}

/**
 * Pattern rule interface
 *
 * Each rule implements detection logic for a specific pattern category
 */
export interface PatternRule {
  /** Unique rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Pattern category */
  category: PatternCategory;
  /** Whether this rule is enabled by default */
  enabled: boolean;
  /** Detect pattern violations */
  detect(context: PatternDetectionContext): PatternViolation[];
}

/**
 * Auto-fix options
 */
export interface AutoFixOptions {
  /** Whether to apply fixes (false = dry-run) */
  apply: boolean;
  /** Minimum confidence level to apply */
  minConfidence: FixConfidence;
  /** Whether to prompt for medium confidence fixes */
  interactive: boolean;
}

/**
 * Auto-fix result
 */
export interface AutoFixResult {
  /** Whether any fixes were applied */
  applied: boolean;
  /** Number of fixes applied */
  fixCount: number;
  /** Fixed source code (if apply=true) */
  fixedCode?: string;
  /** List of fixes that were applied */
  appliedFixes: Array<{
    code: string;
    fix: CodeFix;
  }>;
  /** List of fixes that were skipped */
  skippedFixes: Array<{
    code: string;
    fix: CodeFix;
    reason: string;
  }>;
}

/**
 * Error catalog entry
 */
export interface ErrorCatalogEntry {
  /** Error code (e.g., SST-VAL-001) */
  code: string;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Pattern category */
  category: PatternCategory;
  /** Root cause explanation */
  rootCause: string;
  /** Example of incorrect code */
  badExample: string;
  /** Example of correct code */
  goodExample: string;
  /** Related error codes */
  relatedCodes?: string[];
  /** Links to SST documentation */
  sstDocsUrl?: string;
  /** Link to Deploy-Kit documentation */
  deployKitDocsUrl?: string;
}
