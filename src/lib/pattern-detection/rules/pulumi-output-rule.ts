/**
 * Pulumi Output Pattern Rule (DEP-30)
 *
 * Detects Pulumi Output misuse:
 * 1. SST-VAL-031: Unnecessary $interpolate wrapper for simple values
 * 2. SST-VAL-032: Using Output directly in string concatenation (needs $interpolate or .apply())
 *
 * Note: This extends the existing DEP-26 validation
 */

import * as ts from 'typescript';
import type { PatternRule, PatternDetectionContext, PatternViolation } from '../types.js';
import { getLineAndColumn, getNodeText } from '../pattern-detector.js';

/**
 * Pulumi Output Pattern Rule
 */
export const pulumiOutputRule: PatternRule = {
  id: 'pulumi-output',
  name: 'Pulumi Output Pattern Detection',
  description: 'Detects incorrect Pulumi Output usage patterns',
  category: 'pulumi-output',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    const visit = (node: ts.Node) => {
      // Check 1: Detect unnecessary $interpolate (SST-VAL-031)
      if (ts.isTaggedTemplateExpression(node)) {
        const tag = node.tag;
        const template = node.template;

        // Look for $interpolate`${value}` where value is just a simple reference
        if (ts.isIdentifier(tag) && tag.text === '$interpolate') {
          if (ts.isTemplateExpression(template)) {
            // Check if it's a simple ${expression} with no surrounding text
            if (template.head.text === '' &&
                template.templateSpans.length === 1 &&
                template.templateSpans[0].literal.text === '') {

              const { line, column } = getLineAndColumn(sourceFile, node);
              const innerExpr = template.templateSpans[0].expression;
              const innerText = getNodeText(sourceFile, innerExpr);

              violations.push({
                code: 'SST-VAL-031',
                severity: 'warning',
                category: 'pulumi-output',
                resource: 'sst.config.ts',
                property: '$interpolate',
                message: 'Unnecessary $interpolate wrapper - Pulumi Output can be used directly',
                line,
                column,
                fix: {
                  oldCode: getNodeText(sourceFile, node),
                  newCode: innerText,
                  confidence: 'high',
                  description: 'Remove $interpolate wrapper',
                  start: node.getStart(),
                  end: node.getEnd(),
                },
                docsUrl: 'https://sst.dev/docs/reference/linkable',
                relatedCodes: ['SST-VAL-032'],
              });
            }
          }
        }
      }

      // Check 2: Detect Output in string concatenation (SST-VAL-032)
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const leftText = getNodeText(sourceFile, node.left);
        const rightText = getNodeText(sourceFile, node.right);

        // Check if either side looks like a Pulumi Output property (e.g., bucket.arn, domain.name)
        const outputPattern = /\w+\.(arn|name|id|url|domain|endpoint)/;

        if (outputPattern.test(leftText) || outputPattern.test(rightText)) {
          // Check if this is not already wrapped in $interpolate or .apply()
          const parentText = node.parent ? getNodeText(sourceFile, node.parent) : '';

          if (!parentText.includes('$interpolate') && !parentText.includes('.apply(')) {
            const { line, column } = getLineAndColumn(sourceFile, node);

            // Build suggested fix
            const fullExpr = getNodeText(sourceFile, node);
            let suggestedFix = fullExpr;

            // Convert "string" + output.prop to $interpolate`string${output.prop}`
            if (ts.isStringLiteral(node.left)) {
              suggestedFix = `$interpolate\`${node.left.text}\${${rightText}}\``;
            } else if (ts.isStringLiteral(node.right)) {
              suggestedFix = `$interpolate\`\${${leftText}}${node.right.text}\``;
            } else {
              suggestedFix = `$interpolate\`\${${leftText}}\${${rightText}}\``;
            }

            violations.push({
              code: 'SST-VAL-032',
              severity: 'error',
              category: 'pulumi-output',
              resource: 'sst.config.ts',
              property: 'string-concatenation',
              message: 'Pulumi Output cannot be used in string concatenation - use $interpolate or .apply()',
              line,
              column,
              fix: {
                oldCode: fullExpr,
                newCode: suggestedFix,
                confidence: 'medium',
                description: 'Wrap string concatenation in $interpolate',
                start: node.getStart(),
                end: node.getEnd(),
              },
              docsUrl: 'https://www.pulumi.com/docs/concepts/inputs-outputs/',
              relatedCodes: ['SST-VAL-031'],
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return violations;
  },
};
