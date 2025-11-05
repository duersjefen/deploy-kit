/**
 * CORS Configuration Pattern Rule (DEP-30)
 *
 * Detects CORS configuration issues:
 * 1. SST-VAL-021: allowedOrigins vs allowOrigins typo
 * 2. SST-VAL-022: allowedMethods vs allowMethods typo
 * 3. SST-VAL-023: allowedHeaders vs allowHeaders typo
 * 4. SST-VAL-024: CORS as array instead of object
 *
 * Note: This extends the existing DEP-27 validation with auto-fix capabilities
 */

import * as ts from 'typescript';
import type { PatternRule, PatternDetectionContext, PatternViolation } from '../types.js';
import {
  getLineAndColumn,
  getNodeText,
  isSSTResourceConstructor,
  getResourceType,
  getResourceName,
  findProperty,
} from '../pattern-detector.js';

/**
 * CORS Configuration Pattern Rule
 */
export const corsConfigRule: PatternRule = {
  id: 'cors-config',
  name: 'CORS Configuration Pattern Detection',
  description: 'Detects CORS configuration property name typos and format errors',
  category: 'cors-config',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    const visit = (node: ts.Node) => {
      // Look for Bucket resources with CORS config
      if (isSSTResourceConstructor(node)) {
        const resourceType = getResourceType(node);
        const resourceName = getResourceName(node);

        if (resourceType === 'Bucket') {
          const configArg = node.arguments?.[1];
          if (configArg && ts.isObjectLiteralExpression(configArg)) {
            checkCORSConfiguration(configArg, resourceName, sourceFile, violations);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return violations;
  },
};

/**
 * Check CORS configuration for issues
 */
function checkCORSConfiguration(
  config: ts.ObjectLiteralExpression,
  resourceName: string,
  sourceFile: ts.SourceFile,
  violations: PatternViolation[]
): void {
  const corsProp = findProperty(config, 'cors');
  if (!corsProp) {
    return;
  }

  const corsValue = corsProp.initializer;
  const { line, column } = getLineAndColumn(sourceFile, corsProp);

  // Check 1: CORS should be object, not array (SST-VAL-024)
  if (ts.isArrayLiteralExpression(corsValue)) {
    violations.push({
      code: 'SST-VAL-024',
      severity: 'error',
      category: 'cors-config',
      resource: `Bucket("${resourceName}")`,
      property: 'cors',
      message: 'CORS should be an object, not an array',
      line,
      column,
      fix: {
        oldCode: getNodeText(sourceFile, corsValue),
        newCode: getNodeText(sourceFile, corsValue).replace(/^\[/, '').replace(/\]$/, ''),
        confidence: 'high',
        description: 'Convert CORS array to object',
        start: corsValue.getStart(),
        end: corsValue.getEnd(),
      },
      docsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
      relatedCodes: ['SST-VAL-021'],
    });
    return; // Skip property checks if it's an array
  }

  // Check 2: Validate CORS properties if it's an object
  if (ts.isObjectLiteralExpression(corsValue)) {
    const wrongProperties = [
      { wrong: 'allowedOrigins', correct: 'allowOrigins', code: 'SST-VAL-021' },
      { wrong: 'allowedMethods', correct: 'allowMethods', code: 'SST-VAL-022' },
      { wrong: 'allowedHeaders', correct: 'allowHeaders', code: 'SST-VAL-023' },
    ];

    for (const prop of corsValue.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
        continue;
      }

      const propName = prop.name.text;
      const wrongProp = wrongProperties.find(p => p.wrong === propName);

      if (wrongProp) {
        const { line: propLine, column: propCol } = getLineAndColumn(sourceFile, prop);
        const propText = getNodeText(sourceFile, prop);

        violations.push({
          code: wrongProp.code,
          severity: 'error',
          category: 'cors-config',
          resource: `Bucket("${resourceName}")`,
          property: `cors.${propName}`,
          message: `Wrong CORS property name: "${wrongProp.wrong}" should be "${wrongProp.correct}"`,
          line: propLine,
          column: propCol,
          fix: {
            oldCode: propName,
            newCode: wrongProp.correct,
            confidence: 'high',
            description: `Rename ${wrongProp.wrong} to ${wrongProp.correct}`,
            start: prop.name.getStart(),
            end: prop.name.getEnd(),
          },
          docsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
          relatedCodes: ['SST-VAL-024'],
        });
      }
    }
  }
}
