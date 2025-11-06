/**
 * DynamoDB Field Indexing Pattern Rule (DEP-30)
 *
 * Detects DynamoDB configuration issues:
 * 1. SST-VAL-061: Fields defined but not used in any index
 *
 * AWS SDK requires all fields declared in "fields" property to be
 * indexed in at least one of: primaryIndex, globalIndexes, or localIndexes.
 * Fields can still be stored without declaring them - only declare fields
 * you will index.
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
 * DynamoDB Field Indexing Pattern Rule
 */
export const dynamoIndexingRule: PatternRule = {
  id: 'dynamo-indexing',
  name: 'DynamoDB Field Indexing Pattern Detection',
  description: 'Detects fields defined but not indexed in DynamoDB tables',
  category: 'dynamodb-schema',
  enabled: true,

  detect(context: PatternDetectionContext): PatternViolation[] {
    const violations: PatternViolation[] = [];
    const { sourceFile } = context;

    const visit = (node: ts.Node) => {
      // Look for Dynamo table resources
      if (isSSTResourceConstructor(node)) {
        const resourceType = getResourceType(node);
        const resourceName = getResourceName(node);

        if (resourceType === 'Dynamo') {
          const configArg = node.arguments?.[1];
          if (configArg && ts.isObjectLiteralExpression(configArg)) {
            checkDynamoIndexing(configArg, resourceName, sourceFile, violations);
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
 * Check DynamoDB configuration for unused fields
 */
function checkDynamoIndexing(
  config: ts.ObjectLiteralExpression,
  resourceName: string,
  sourceFile: ts.SourceFile,
  violations: PatternViolation[]
): void {
  // Get fields property
  const fieldsProp = findProperty(config, 'fields');
  if (!fieldsProp || !ts.isObjectLiteralExpression(fieldsProp.initializer)) {
    return; // No fields defined
  }

  const fieldsObj = fieldsProp.initializer;
  const definedFields = new Set<string>();

  // Collect all field names
  for (const prop of fieldsObj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      definedFields.add(prop.name.text);
    }
  }

  if (definedFields.size === 0) {
    return; // No fields defined
  }

  // Collect all indexed fields
  const indexedFields = new Set<string>();

  // Check primaryIndex
  const primaryIndexProp = findProperty(config, 'primaryIndex');
  if (primaryIndexProp && ts.isObjectLiteralExpression(primaryIndexProp.initializer)) {
    collectIndexedFields(primaryIndexProp.initializer, indexedFields);
  }

  // Check globalIndexes
  const globalIndexesProp = findProperty(config, 'globalIndexes');
  if (globalIndexesProp && ts.isObjectLiteralExpression(globalIndexesProp.initializer)) {
    for (const indexProp of globalIndexesProp.initializer.properties) {
      if (ts.isPropertyAssignment(indexProp) && ts.isObjectLiteralExpression(indexProp.initializer)) {
        collectIndexedFields(indexProp.initializer, indexedFields);
      }
    }
  }

  // Check localIndexes
  const localIndexesProp = findProperty(config, 'localIndexes');
  if (localIndexesProp && ts.isObjectLiteralExpression(localIndexesProp.initializer)) {
    for (const indexProp of localIndexesProp.initializer.properties) {
      if (ts.isPropertyAssignment(indexProp) && ts.isObjectLiteralExpression(indexProp.initializer)) {
        collectIndexedFields(indexProp.initializer, indexedFields);
      }
    }
  }

  // Check ttl field (counts as indexed)
  const ttlProp = findProperty(config, 'ttl');
  if (ttlProp && ts.isStringLiteral(ttlProp.initializer)) {
    indexedFields.add(ttlProp.initializer.text);
  }

  // Find unused fields
  const unusedFields: string[] = [];
  for (const field of definedFields) {
    if (!indexedFields.has(field)) {
      unusedFields.push(field);
    }
  }

  // Report violations for unused fields
  if (unusedFields.length > 0) {
    const { line, column } = getLineAndColumn(sourceFile, fieldsProp);
    const unusedFieldsList = unusedFields.map(f => `"${f}"`).join(', ');

    violations.push({
      code: 'SST-VAL-061',
      severity: 'error',
      category: 'dynamodb-schema',
      resource: `Dynamo("${resourceName}")`,
      property: 'fields',
      message: `Fields defined but not indexed: [${unusedFieldsList}]. All fields in "fields" property must be used in an index. Remove unused fields or add indexes for them.`,
      line,
      column,
      fix: {
        oldCode: getNodeText(sourceFile, fieldsProp),
        newCode: generateFixedFields(fieldsProp, indexedFields, sourceFile),
        confidence: 'high',
        description: `Remove unused fields: ${unusedFieldsList}`,
        start: fieldsProp.getStart(),
        end: fieldsProp.getEnd(),
      },
      docsUrl: 'https://sst.dev/docs/component/aws/dynamo',
      relatedCodes: [],
    });
  }
}

/**
 * Collect field names from index definition
 */
function collectIndexedFields(indexObj: ts.ObjectLiteralExpression, indexedFields: Set<string>): void {
  for (const prop of indexObj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      continue;
    }

    const propName = prop.name.text;

    // hashKey and rangeKey are indexed
    if ((propName === 'hashKey' || propName === 'rangeKey') && ts.isStringLiteral(prop.initializer)) {
      indexedFields.add(prop.initializer.text);
    }
  }
}

/**
 * Generate fixed fields object with only indexed fields
 */
function generateFixedFields(
  fieldsProp: ts.PropertyAssignment,
  indexedFields: Set<string>,
  sourceFile: ts.SourceFile
): string {
  if (!ts.isObjectLiteralExpression(fieldsProp.initializer)) {
    return getNodeText(sourceFile, fieldsProp);
  }

  const fieldsObj = fieldsProp.initializer;
  const keptProperties: string[] = [];

  for (const prop of fieldsObj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const fieldName = prop.name.text;
      if (indexedFields.has(fieldName)) {
        keptProperties.push(getNodeText(sourceFile, prop));
      }
    }
  }

  const indent = ' '.repeat(4); // 4 spaces for typical indentation
  const propsText = keptProperties.join(`,\n${indent}  `);

  return `fields: {\n${indent}  ${propsText}\n${indent}}`;
}
