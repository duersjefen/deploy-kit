/**
 * SST Pattern Detector (DEP-30)
 *
 * AST-based pattern detection engine for SST configuration files.
 * Detects 7 critical pattern categories that cause silent deployment failures.
 *
 * Architecture:
 * - Uses TypeScript Compiler API for AST traversal
 * - Pluggable rule system for pattern detection
 * - Integrated with error catalog for rich error messages
 * - Performance target: <1 second for typical configs
 *
 * @see https://linear.app/paiss/issue/DEP-30
 */

import * as ts from 'typescript';
import { readFileSync, existsSync } from 'fs';
import type {
  PatternDetectionContext,
  PatternDetectionResult,
  PatternRule,
  PatternViolation,
} from './types.js';

/**
 * SST Pattern Detector
 *
 * Main engine for detecting SST configuration pattern errors
 */
export class SSTPatternDetector {
  private rules: PatternRule[] = [];
  private sourceFile: ts.SourceFile | null = null;
  private sourceCode: string = '';

  /**
   * Register a pattern rule
   */
  registerRule(rule: PatternRule): void {
    this.rules.push(rule);
  }

  /**
   * Register multiple pattern rules
   */
  registerRules(rules: PatternRule[]): void {
    this.rules.push(...rules);
  }

  /**
   * Get all registered rules
   */
  getRules(): PatternRule[] {
    return this.rules;
  }

  /**
   * Get enabled rules only
   */
  getEnabledRules(): PatternRule[] {
    return this.rules.filter(rule => rule.enabled);
  }

  /**
   * Detect pattern violations in SST config file
   *
   * @param configPath - Path to sst.config.ts
   * @param projectRoot - Project root directory
   * @returns Detection result with violations and metrics
   */
  detect(configPath: string, projectRoot: string): PatternDetectionResult {
    const startTime = Date.now();

    // Validate file exists
    if (!existsSync(configPath)) {
      return {
        violations: [{
          code: 'SST-VAL-000',
          severity: 'error',
          category: 'stage-variable',
          resource: 'sst.config.ts',
          property: 'file',
          message: 'sst.config.ts not found',
        }],
        errorCount: 1,
        warningCount: 0,
        autoFixableCount: 0,
        duration: Date.now() - startTime,
      };
    }

    // Parse source file
    this.sourceCode = readFileSync(configPath, 'utf-8');
    this.sourceFile = ts.createSourceFile(
      configPath,
      this.sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    // Create detection context
    const context: PatternDetectionContext = {
      sourceFile: this.sourceFile,
      sourceCode: this.sourceCode,
      projectRoot,
    };

    // Run all enabled rules
    const violations: PatternViolation[] = [];
    const enabledRules = this.getEnabledRules();

    for (const rule of enabledRules) {
      try {
        const ruleViolations = rule.detect(context);
        violations.push(...ruleViolations);
      } catch (error) {
        console.error(`Error running rule ${rule.id}:`, error);
        // Continue with other rules even if one fails
      }
    }

    // Calculate metrics
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const autoFixableCount = violations.filter(v => v.fix && v.fix.confidence === 'high').length;

    const duration = Date.now() - startTime;

    return {
      violations,
      errorCount,
      warningCount,
      autoFixableCount,
      duration,
    };
  }

  /**
   * Detect and return violations grouped by category
   */
  detectByCategory(configPath: string, projectRoot: string): Map<string, PatternViolation[]> {
    const result = this.detect(configPath, projectRoot);
    const grouped = new Map<string, PatternViolation[]>();

    for (const violation of result.violations) {
      const category = violation.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(violation);
    }

    return grouped;
  }

  /**
   * Check if source file has any violations
   */
  hasViolations(configPath: string, projectRoot: string): boolean {
    const result = this.detect(configPath, projectRoot);
    return result.violations.length > 0;
  }

  /**
   * Get violation count by severity
   */
  getViolationCounts(configPath: string, projectRoot: string): { errors: number; warnings: number } {
    const result = this.detect(configPath, projectRoot);
    return {
      errors: result.errorCount,
      warnings: result.warningCount,
    };
  }
}

/**
 * Helper function to get line and column from source file
 */
export function getLineAndColumn(
  sourceFile: ts.SourceFile,
  node: ts.Node
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return {
    line: line + 1, // Convert to 1-indexed
    column: character + 1, // Convert to 1-indexed
  };
}

/**
 * Helper function to get text of a node
 */
export function getNodeText(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile);
}

/**
 * Helper function to check if node is SST resource constructor
 */
export function isSSTResourceConstructor(node: ts.Node): node is ts.NewExpression {
  if (!ts.isNewExpression(node)) {
    return false;
  }

  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }

  // Check if this looks like sst.aws.* or aws.*
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const parent = expression.expression.name.text;
    return parent === 'aws' || parent === 'cloudflare' || parent === 'vercel';
  }

  return false;
}

/**
 * Helper function to get resource type from new expression
 */
export function getResourceType(node: ts.NewExpression): string | null {
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression)) {
    return null;
  }

  return expression.name.text;
}

/**
 * Helper function to get resource name from new expression
 */
export function getResourceName(node: ts.NewExpression): string {
  const nameArg = node.arguments?.[0];
  if (nameArg && ts.isStringLiteral(nameArg)) {
    return nameArg.text;
  }
  return 'Unknown';
}

/**
 * Helper function to find property in object literal
 */
export function findProperty(
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): ts.PropertyAssignment | undefined {
  return obj.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propertyName
  );
}

/**
 * Helper function to check if node contains specific text
 */
export function containsText(sourceFile: ts.SourceFile, node: ts.Node, text: string): boolean {
  return getNodeText(sourceFile, node).includes(text);
}
