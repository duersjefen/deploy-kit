/**
 * Domain Configuration Pattern Rule (DEP-30, Issue #220)
 *
 * Detects incorrect domain configuration patterns that cause silent deployment failures:
 * 1. SST-VAL-011: Using stage !== "dev" instead of explicit checks (breaks staging/preview/test)
 * 2. SST-VAL-012: Missing dns property entirely (BLOCKS deployment)
 * 3. SST-VAL-012a: Missing dns.override for existing CloudFront distributions (BLOCKS deployment)
 *
 * **Real-World Incident (Issue #220):**
 * - Project had existing CloudFront distributions for staging/production domains
 * - SST config lacked `override: true` in dns configuration
 * - Result: CNAMEAlreadyExists error → manual distribution deletion → SST bug → production downtime
 *
 * **Why This Matters:**
 * When a CloudFront distribution already exists with your domain:
 * - Without `dns.override: true`, SST cannot update it
 * - Deployment fails with: "CNAMEAlreadyExists: One or more of the CNAMEs you provided..."
 * - Requires manual intervention (deleting distribution, updating config)
 *
 * **Common Anti-Patterns:**
 * ```typescript
 * // ❌ WRONG: stage !== "dev" breaks staging, preview, test stages
 * domain: stage !== "dev" ? { name: "example.com" } : undefined
 *
 * // ❌ WRONG: Missing dns property (will fail if distribution exists)
 * domain: { name: "example.com" }
 *
 * // ❌ WRONG: dns without override (will fail if distribution exists)
 * domain: {
 *   name: "example.com",
 *   dns: sst.aws.dns({ zone: "Z123" })
 * }
 *
 * // ✅ CORRECT: Explicit stage check + dns with override
 * domain: stage === "production" ? {
 *   name: "example.com",
 *   dns: sst.aws.dns({ zone: "Z123", override: true })
 * } : undefined
 * ```
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

  // Check 2: Validate DNS configuration (SST-VAL-012, SST-VAL-012a) - Issue #220
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

      // SST-VAL-012: Missing dns property entirely (BLOCKS deployment)
      if (nameProp && !dnsProp) {
        const { line: nameL, column: nameC } = getLineAndColumn(sourceFile, nameProp);

        // CHANGED: This is now an ERROR, not a warning (Issue #220)
        // Without dns configuration, CloudFront CNAME conflicts WILL cause deployment failure
        violations.push({
          code: 'SST-VAL-012',
          severity: 'error', // ⚠️ CHANGED from 'warning' to 'error'
          category: 'domain-config',
          resource: `${resourceType}("${resourceName}")`,
          property: 'domain.dns',
          message: 'domain.name requires explicit dns configuration to prevent CloudFront CNAME conflicts',
          line: nameL,
          column: nameC,
          fix: {
            oldCode: getNodeText(sourceFile, domainObj),
            newCode: getNodeText(sourceFile, domainObj).replace(
              '}',
              ',\n  dns: sst.aws.dns({ zone: "YOUR_ZONE_ID", override: true })\n}'
            ),
            confidence: 'medium',
            description: 'Add explicit DNS provider with override: true for existing distributions',
            start: domainObj.getStart(),
            end: domainObj.getEnd(),
          },
          docsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
          relatedCodes: ['SST-VAL-011', 'SST-VAL-012a'],
        });
      }

      // SST-VAL-012a: dns exists but missing override parameter (BLOCKS deployment)
      if (nameProp && dnsProp) {
        const hasOverride = checkDnsOverride(dnsProp, sourceFile);

        if (!hasOverride) {
          const { line: dnsL, column: dnsC } = getLineAndColumn(sourceFile, dnsProp);
          const dnsText = getNodeText(sourceFile, dnsProp.initializer);

          violations.push({
            code: 'SST-VAL-012a',
            severity: 'error',
            category: 'domain-config',
            resource: `${resourceType}("${resourceName}")`,
            property: 'domain.dns',
            message: 'dns configuration missing override parameter (required for updating existing CloudFront distributions)',
            line: dnsL,
            column: dnsC,
            fix: {
              oldCode: dnsText,
              newCode: dnsText.replace(
                /(\))\s*$/,
                ', override: true$1'
              ).replace(
                /(\{\s*zone:\s*"[^"]*"\s*)(\})/,
                '$1, override: true $2'
              ),
              confidence: 'high',
              description: 'Add override: true to dns configuration to allow updating existing distributions',
              start: dnsProp.initializer.getStart(),
              end: dnsProp.initializer.getEnd(),
            },
            docsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
            relatedCodes: ['SST-VAL-012'],
          });
        }
      }
    }
  }
}

/**
 * Check if dns configuration includes override parameter
 *
 * **Issue #220: Detect missing dns.override**
 *
 * When updating existing CloudFront distributions, SST requires explicit `override: true`:
 *
 * ```typescript
 * // ❌ WRONG: Will fail if distribution exists
 * dns: sst.aws.dns({ zone: "Z123" })
 *
 * // ✅ CORRECT: Can update existing distribution
 * dns: sst.aws.dns({ zone: "Z123", override: true })
 * ```
 *
 * @param dnsProp - The dns property assignment node
 * @param sourceFile - Source file for text extraction
 * @returns true if override: true is present, false otherwise
 */
function checkDnsOverride(dnsProp: ts.PropertyAssignment, sourceFile: ts.SourceFile): boolean {
  const initializer = dnsProp.initializer;

  // dns should be a function call: sst.aws.dns(...) or sst.cloudflare.dns(...)
  if (!ts.isCallExpression(initializer)) {
    return false;
  }

  // First argument should be config object
  if (initializer.arguments.length === 0) {
    return false;
  }

  const configArg = initializer.arguments[0];

  if (!ts.isObjectLiteralExpression(configArg)) {
    return false;
  }

  // Look for override property
  const overrideProp = findProperty(configArg, 'override');

  if (!overrideProp || !ts.isPropertyAssignment(overrideProp)) {
    return false;
  }

  const value = overrideProp.initializer;

  // Check if override: true (not false, not omitted)
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  // Handle override: $input(true) or similar patterns
  // For now, we assume any non-false value is acceptable
  const valueText = getNodeText(sourceFile, value);
  return !valueText.includes('false');
}
