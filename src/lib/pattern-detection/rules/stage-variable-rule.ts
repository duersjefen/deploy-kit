/**
 * Stage Variable Pattern Rule (DEP-30)
 *
 * Detects incorrect usage of stage variables that cause silent failures:
 * 1. SST-VAL-001: Using input.stage instead of $app.stage
 * 2. SST-VAL-002: run() function with parameters (should have none)
 * 3. SST-VAL-003: Hardcoded stage values
 *
 * Critical Pattern: The staging.mawave.app incident was caused by
 * `input?.stage || "dev"` which silently always evaluated to "dev"
 */

import * as ts from 'typescript';
import type { PatternRule, PatternDetectionContext, PatternViolation, CodeFix } from '../types.js';
import { getLineAndColumn, getNodeText } from '../pattern-detector.js';

/**
 * Walk up AST tree to find the containing function name
 */
function getContainingFunctionName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;

  while (current) {
    // Check for method declarations (e.g., app() or run() inside $config)
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    // Check for function declarations
    if (ts.isFunctionDeclaration(current) && current.name && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    // Check for arrow functions assigned to variables (e.g., const app = () => ...)
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    current = current.parent;
  }

  return null;
}

/**
 * Stage Variable Pattern Rule
 */
export const stageVariableRule: PatternRule = {
  id: 'stage-variable',
  name: 'Stage Variable Pattern Detection',
  description: 'Detects incorrect stage variable usage (input.stage vs $app.stage)',
  category: 'stage-variable',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile, sourceCode } = context;

    // Visitor pattern for AST traversal
    const visit = (node: ts.Node) => {
      // Check 1: Detect run() function with parameters (SST-VAL-002)
      if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
        const functionName = ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)
          ? node.name.text
          : '';

        if (functionName === 'run' && node.parameters.length > 0) {
          const { line, column } = getLineAndColumn(sourceFile, node);
          const parameterText = node.parameters.map(p => getNodeText(sourceFile, p)).join(', ');

          violations.push({
            code: 'SST-VAL-002',
            severity: 'error',
            category: 'function-signature',
            resource: 'sst.config.ts',
            property: 'run()',
            message: 'run() function should not accept parameters in SST v3',
            line,
            column,
            fix: {
              oldCode: `async run(${parameterText})`,
              newCode: 'async run()',
              confidence: 'high',
              description: 'Remove parameters from run() function',
              start: node.getStart(),
              end: node.parameters[node.parameters.length - 1].getEnd() + 1, // Include closing paren
            },
            docsUrl: 'https://sst.dev/docs/reference/config',
            relatedCodes: ['SST-VAL-001'],
          });
        }
      }

      // Check 2: Detect input.stage or input?.stage usage (SST-VAL-001)
      if (ts.isPropertyAccessExpression(node) || ts.isOptionalChain(node)) {
        const text = getNodeText(sourceFile, node);

        if (text.includes('input.stage') || text.includes('input?.stage')) {
          // Find the containing function to determine if this is valid
          const containingFunction = getContainingFunctionName(node);

          // input.stage is VALID in app() function, only flag in run() or other functions
          if (containingFunction === 'app') {
            return; // Skip - this is correct usage
          }

          const { line, column } = getLineAndColumn(sourceFile, node);

          // Try to find the full statement for better context
          let parent = node.parent;
          let fullStatement = text;
          while (parent && !ts.isVariableDeclaration(parent) && !ts.isStatement(parent)) {
            fullStatement = getNodeText(sourceFile, parent);
            parent = parent.parent;
          }

          // Generate fix - replace input.stage with $app.stage
          const fixedCode = fullStatement.replace(/input\?\.stage/g, '$app.stage').replace(/input\.stage/g, '$app.stage');

          violations.push({
            code: 'SST-VAL-001',
            severity: 'error',
            category: 'stage-variable',
            resource: 'sst.config.ts',
            property: 'stage',
            message: containingFunction === 'run'
              ? 'run() function does not receive input parameter. Use $app.stage instead of input.stage.'
              : 'Using input.stage causes silent failures. Use $app.stage instead.',
            line,
            column,
            fix: {
              oldCode: text,
              newCode: '$app.stage',
              confidence: 'high',
              description: 'Replace input.stage with $app.stage',
              start: node.getStart(),
              end: node.getEnd(),
            },
            docsUrl: 'https://sst.dev/docs/reference/config',
            relatedCodes: ['SST-VAL-002', 'SST-VAL-003'],
          });
        }
      }

      // Check 3: Detect hardcoded stage values (SST-VAL-003)
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const varName = node.name.text;

        // Look for: const stage = "dev" or similar
        if (varName === 'stage' && node.initializer && ts.isStringLiteral(node.initializer)) {
          const value = node.initializer.text;

          // Only flag if it's one of the common stage names
          if (['dev', 'development', 'staging', 'production', 'prod', 'test'].includes(value)) {
            const { line, column } = getLineAndColumn(sourceFile, node);

            violations.push({
              code: 'SST-VAL-003',
              severity: 'error',
              category: 'stage-variable',
              resource: 'sst.config.ts',
              property: 'stage',
              message: `Hardcoded stage value "${value}" prevents multi-stage deployments`,
              line,
              column,
              fix: {
                oldCode: `const stage = "${value}"`,
                newCode: 'const stage = $app.stage',
                confidence: 'high',
                description: 'Replace hardcoded stage with $app.stage',
                start: node.initializer.getStart(),
                end: node.initializer.getEnd(),
              },
              docsUrl: 'https://sst.dev/docs/reference/config',
              relatedCodes: ['SST-VAL-001', 'SST-VAL-011'],
            });
          }
        }
      }

      // Continue traversing
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return violations;
  },
};
