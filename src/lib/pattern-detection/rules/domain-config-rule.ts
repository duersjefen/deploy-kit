/**
 * Domain Configuration Pattern Rule (DEP-30)
 *
 * Detects incorrect domain configuration patterns:
 * 1. SST-VAL-011: Using stage !== "dev" instead of explicit checks
 * 2. SST-VAL-012: Missing dns.override for existing CloudFront distributions
 *
 * Common Anti-Pattern:
 * domain: stage !== "dev" ? { ... } : undefined
 * This breaks for staging, preview, test, and other non-production stages
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
 * Domain Configuration Pattern Rule
 */
export const domainConfigRule: PatternRule = {
  id: 'domain-config',
  name: 'Domain Configuration Pattern Detection',
  description: 'Detects incorrect domain configuration patterns',
  category: 'domain-config',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    // Resources that can have domain configuration
    const domainResources = ['Nextjs', 'StaticSite', 'Remix', 'Astro', 'Router', 'ApiGatewayV2'];

    const visit = (node: ts.Node) => {
      // Look for SST resource constructors with domain config
      if (isSSTResourceConstructor(node)) {
        const resourceType = getResourceType(node);
        const resourceName = getResourceName(node);

        if (resourceType && domainResources.includes(resourceType)) {
          const configArg = node.arguments?.[1];
          if (configArg && ts.isObjectLiteralExpression(configArg)) {
            checkDomainConfiguration(configArg, resourceType, resourceName, sourceFile, violations);
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
 * Check domain configuration for issues
 */
function checkDomainConfiguration(
  config: ts.ObjectLiteralExpression,
  resourceType: string,
  resourceName: string,
  sourceFile: ts.SourceFile,
  violations: PatternViolation[]
): void {
  const domainProp = findProperty(config, 'domain');
  if (!domainProp) {
    return;
  }

  const domainValue = domainProp.initializer;
  const { line, column } = getLineAndColumn(sourceFile, domainProp);

  // Check 1: Detect stage !== "dev" pattern (SST-VAL-011)
  if (ts.isConditionalExpression(domainValue)) {
    const conditionText = getNodeText(sourceFile, domainValue.condition);

    // Look for stage !== "dev" or similar patterns
    if (conditionText.includes('!==') && (
      conditionText.includes('"dev"') ||
      conditionText.includes("'dev'") ||
      conditionText.includes('"development"') ||
      conditionText.includes("'development'")
    )) {
      const { line: condLine, column: condCol } = getLineAndColumn(sourceFile, domainValue.condition);

      violations.push({
        code: 'SST-VAL-011',
        severity: 'error',
        category: 'domain-config',
        resource: `${resourceType}("${resourceName}")`,
        property: 'domain',
        message: 'Using stage !== "dev" breaks for other non-production stages (staging, preview, test)',
        line: condLine,
        column: condCol,
        fix: {
          oldCode: conditionText,
          newCode: 'stage === "production"',
          confidence: 'medium',
          description: 'Use explicit stage === "production" check instead of negative comparison',
          start: domainValue.condition.getStart(),
          end: domainValue.condition.getEnd(),
        },
        docsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
        relatedCodes: ['SST-VAL-003', 'SST-VAL-012'],
      });
    }
  }

  // Check 2: Check if domain is an object and validate dns property (SST-VAL-012)
  if (ts.isObjectLiteralExpression(domainValue) ||
      (ts.isConditionalExpression(domainValue) && ts.isObjectLiteralExpression(domainValue.whenTrue))) {

    const domainObj = ts.isObjectLiteralExpression(domainValue)
      ? domainValue
      : ts.isObjectLiteralExpression(domainValue.whenTrue)
        ? domainValue.whenTrue
        : null;

    if (domainObj) {
      const dnsProp = findProperty(domainObj, 'dns');
      const nameProp = findProperty(domainObj, 'name');

      // If domain.name is set but no dns property, warn about potential issues
      if (nameProp && !dnsProp) {
        const { line: nameL, column: nameC } = getLineAndColumn(sourceFile, nameProp);

        // This is a warning, not an error, since it depends on whether updating existing distribution
        violations.push({
          code: 'SST-VAL-012',
          severity: 'warning',
          category: 'domain-config',
          resource: `${resourceType}("${resourceName}")`,
          property: 'domain.dns',
          message: 'domain.name without dns property may cause issues when updating existing CloudFront distributions',
          line: nameL,
          column: nameC,
          fix: {
            oldCode: getNodeText(sourceFile, domainObj),
            newCode: getNodeText(sourceFile, domainObj).replace(
              '}',
              ',\n  dns: sst.cloudflare.dns() // or sst.aws.dns()\n}'
            ),
            confidence: 'low',
            description: 'Add explicit DNS provider if updating existing distribution',
            start: domainObj.getStart(),
            end: domainObj.getEnd(),
          },
          docsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
          relatedCodes: ['SST-VAL-011'],
        });
      }
    }
  }
}
