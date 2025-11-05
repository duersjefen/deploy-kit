/**
 * Resource Dependency Pattern Rule (DEP-30)
 *
 * Detects resource dependency issues:
 * 1. SST-VAL-051: Circular dependencies between resources
 * 2. SST-VAL-052: Using resources before declaration
 *
 * These patterns can cause deployment failures or undefined errors
 */

import * as ts from 'typescript';
import type { PatternRule, PatternDetectionContext, PatternViolation } from '../types.js';
import {
  getLineAndColumn,
  getNodeText,
  isSSTResourceConstructor,
  getResourceName,
  findProperty,
} from '../pattern-detector.js';

/**
 * Resource Dependency Pattern Rule
 */
export const resourceDependencyRule: PatternRule = {
  id: 'resource-dependency',
  name: 'Resource Dependency Pattern Detection',
  description: 'Detects circular dependencies and usage-before-declaration',
  category: 'resource-dependency',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    // Track resource declarations and their dependencies
    const resourceDeclarations = new Map<string, {
      line: number;
      dependencies: string[];
      node: ts.VariableDeclaration;
    }>();

    const resourceReferences = new Map<string, {
      referencedBy: string;
      line: number;
      node: ts.Node;
    }[]>();

    // First pass: collect all resource declarations
    const collectDeclarations = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && isSSTResourceConstructor(node.initializer)) {
        if (ts.isIdentifier(node.name)) {
          const resourceName = node.name.text;
          const { line } = getLineAndColumn(sourceFile, node);
          const dependencies = extractDependencies(node.initializer, sourceFile);

          resourceDeclarations.set(resourceName, {
            line,
            dependencies,
            node,
          });
        }
      }

      ts.forEachChild(node, collectDeclarations);
    };

    collectDeclarations(sourceFile);

    // Second pass: check for issues
    for (const [resourceName, info] of resourceDeclarations.entries()) {
      // Check 1: Circular dependencies (SST-VAL-051)
      for (const dep of info.dependencies) {
        const depInfo = resourceDeclarations.get(dep);
        if (depInfo && depInfo.dependencies.includes(resourceName)) {
          // Found circular dependency
          violations.push({
            code: 'SST-VAL-051',
            severity: 'error',
            category: 'resource-dependency',
            resource: resourceName,
            property: 'link',
            message: `Circular dependency detected: ${resourceName} ↔ ${dep}`,
            line: info.line,
            docsUrl: 'https://sst.dev/docs/reference/linkable',
            relatedCodes: ['SST-VAL-052'],
          });
        }
      }

      // Check 2: Using resource before declaration (SST-VAL-052)
      for (const dep of info.dependencies) {
        const depInfo = resourceDeclarations.get(dep);
        if (depInfo && depInfo.line > info.line) {
          // Dependency is declared AFTER usage
          violations.push({
            code: 'SST-VAL-052',
            severity: 'error',
            category: 'resource-dependency',
            resource: resourceName,
            property: 'link',
            message: `Using resource "${dep}" before it is declared (line ${depInfo.line})`,
            line: info.line,
            docsUrl: 'https://sst.dev/docs/reference/linkable',
            relatedCodes: ['SST-VAL-051'],
          });
        }
      }
    }

    return violations;
  },
};

/**
 * Extract resource dependencies from a constructor call
 */
function extractDependencies(node: ts.NewExpression, sourceFile: ts.SourceFile): string[] {
  const dependencies: string[] = [];

  const configArg = node.arguments?.[1];
  if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
    return dependencies;
  }

  // Look for link property
  const linkProp = findProperty(configArg, 'link');
  if (!linkProp) {
    return dependencies;
  }

  const linkValue = linkProp.initializer;

  // link can be an array or a single resource
  if (ts.isArrayLiteralExpression(linkValue)) {
    for (const element of linkValue.elements) {
      if (ts.isIdentifier(element)) {
        dependencies.push(element.text);
      } else if (ts.isPropertyAccessExpression(element) && ts.isIdentifier(element.expression)) {
        dependencies.push(element.expression.text);
      }
    }
  } else if (ts.isIdentifier(linkValue)) {
    dependencies.push(linkValue.text);
  }

  return dependencies;
}
