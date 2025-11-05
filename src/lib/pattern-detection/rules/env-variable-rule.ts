/**
 * Environment Variable Pattern Rule (DEP-30)
 *
 * Detects reserved Lambda environment variables:
 * 1. SST-VAL-041: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (forbidden)
 * 2. SST-VAL-042: Variables starting with _ (reserved by Lambda)
 * 3. SST-VAL-043: Variables starting with LAMBDA_ (reserved by Lambda)
 *
 * @see https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime
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
 * Environment Variable Pattern Rule
 */
export const envVariableRule: PatternRule = {
  id: 'env-variable',
  name: 'Environment Variable Pattern Detection',
  description: 'Detects reserved Lambda environment variables',
  category: 'environment-variable',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    const visit = (node: ts.Node) => {
      // Look for Function resources with environment config
      if (isSSTResourceConstructor(node)) {
        const resourceType = getResourceType(node);
        const resourceName = getResourceName(node);

        if (resourceType === 'Function') {
          const configArg = node.arguments?.[1];
          if (configArg && ts.isObjectLiteralExpression(configArg)) {
            checkEnvironmentVariables(configArg, resourceName, sourceFile, violations);
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
 * Reserved Lambda environment variable patterns
 */
const RESERVED_ENV_VARS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
];

/**
 * Check environment variables for reserved names
 */
function checkEnvironmentVariables(
  config: ts.ObjectLiteralExpression,
  resourceName: string,
  sourceFile: ts.SourceFile,
  violations: PatternViolation[]
): void {
  const envProp = findProperty(config, 'environment');
  if (!envProp || !ts.isObjectLiteralExpression(envProp.initializer)) {
    return;
  }

  const envObj = envProp.initializer;

  for (const prop of envObj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }

    let varName: string | null = null;

    // Get variable name (can be identifier or string literal)
    if (ts.isIdentifier(prop.name)) {
      varName = prop.name.text;
    } else if (ts.isStringLiteral(prop.name)) {
      varName = prop.name.text;
    }

    if (!varName) {
      continue;
    }

    const { line, column } = getLineAndColumn(sourceFile, prop);

    // Check 1: AWS credentials (SST-VAL-041)
    if (RESERVED_ENV_VARS.includes(varName)) {
      violations.push({
        code: 'SST-VAL-041',
        severity: 'error',
        category: 'environment-variable',
        resource: `Function("${resourceName}")`,
        property: `environment.${varName}`,
        message: `${varName} is a reserved Lambda environment variable and cannot be set manually`,
        line,
        column,
        docsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
        relatedCodes: ['SST-VAL-042', 'SST-VAL-043'],
      });
    }

    // Check 2: Variables starting with underscore (SST-VAL-042)
    else if (varName.startsWith('_')) {
      violations.push({
        code: 'SST-VAL-042',
        severity: 'error',
        category: 'environment-variable',
        resource: `Function("${resourceName}")`,
        property: `environment.${varName}`,
        message: `Variables starting with _ are reserved by Lambda runtime`,
        line,
        column,
        fix: {
          oldCode: varName,
          newCode: varName.substring(1).toUpperCase(),
          confidence: 'medium',
          description: `Remove leading underscore: ${varName} → ${varName.substring(1).toUpperCase()}`,
          start: prop.name.getStart(),
          end: prop.name.getEnd(),
        },
        docsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
        relatedCodes: ['SST-VAL-041'],
      });
    }

    // Check 3: Variables starting with LAMBDA_ (SST-VAL-043)
    else if (varName.startsWith('LAMBDA_')) {
      violations.push({
        code: 'SST-VAL-043',
        severity: 'error',
        category: 'environment-variable',
        resource: `Function("${resourceName}")`,
        property: `environment.${varName}`,
        message: `Variables starting with LAMBDA_ are reserved by Lambda runtime`,
        line,
        column,
        fix: {
          oldCode: varName,
          newCode: varName.replace('LAMBDA_', 'APP_'),
          confidence: 'medium',
          description: `Replace LAMBDA_ prefix: ${varName} → ${varName.replace('LAMBDA_', 'APP_')}`,
          start: prop.name.getStart(),
          end: prop.name.getEnd(),
        },
        docsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
        relatedCodes: ['SST-VAL-041', 'SST-VAL-042'],
      });
    }
  }
}
