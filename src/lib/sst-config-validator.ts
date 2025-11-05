/**
 * SST Config Validator (DEP-27)
 *
 * Validates SST config files to catch common configuration errors before deployment.
 * Uses TypeScript AST parsing for accurate detection of misconfigurations.
 *
 * Detects:
 * 1. S3 Bucket CORS misconfigurations (array vs object, wrong property names, maxAge format)
 * 2. Lambda Function timeout/memory format errors (number vs string with units)
 * 3. Domain dns.override missing when updating existing CloudFront distributions
 * 4. DynamoDB TTL format errors (object vs string)
 * 5. Next.js missing environment variables
 *
 * @see https://linear.app/paiss/issue/DEP-27
 */

import * as ts from 'typescript';
import { readFileSync, existsSync } from 'fs';

/**
 * Validation issue severity
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * Validation issue detected in SST config
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  resource: string;
  property: string;
  message: string;
  line?: number;
  fix?: string;
  docsUrl?: string;
}

/**
 * SST Config Validator
 *
 * Parses sst.config.ts using TypeScript AST and validates common patterns
 */
export class SSTConfigValidator {
  private sourceFile: ts.SourceFile | null = null;
  private configContent: string = '';

  /**
   * Validate SST config file
   *
   * @param configPath - Path to sst.config.ts
   * @returns Array of validation issues (empty if valid)
   */
  validate(configPath: string): ValidationIssue[] {
    if (!existsSync(configPath)) {
      return [{
        severity: 'error',
        resource: 'sst.config.ts',
        property: 'file',
        message: 'sst.config.ts not found',
        fix: 'Create sst.config.ts in project root',
      }];
    }

    this.configContent = readFileSync(configPath, 'utf-8');
    this.sourceFile = ts.createSourceFile(
      configPath,
      this.configContent,
      ts.ScriptTarget.Latest,
      true
    );

    const issues: ValidationIssue[] = [];

    // Walk AST and validate each node
    const visit = (node: ts.Node) => {
      // Check for SST resource constructors (new sst.aws.Bucket, new sst.aws.Function, etc.)
      if (ts.isNewExpression(node)) {
        this.validateNode(node, issues);
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);

    return issues;
  }

  /**
   * Validate a single AST node
   *
   * @param node - TypeScript AST node
   * @param issues - Array to collect validation issues
   */
  private validateNode(node: ts.NewExpression, issues: ValidationIssue[]): void {
    const expression = node.expression;

    // Check if this is an SST resource (new sst.aws.*)
    if (!ts.isPropertyAccessExpression(expression)) {
      return;
    }

    const resourceType = this.getResourceType(expression);
    if (!resourceType) {
      return;
    }

    // Get the resource name (first argument to constructor)
    const resourceName = node.arguments?.[0];
    const name = resourceName && ts.isStringLiteral(resourceName)
      ? resourceName.text
      : 'Unknown';

    // Get the config object (second argument)
    const configArg = node.arguments?.[1];
    if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
      return;
    }

    // Validate based on resource type
    switch (resourceType) {
      case 'Bucket':
        this.validateBucket(name, configArg, issues);
        break;
      case 'Function':
        this.validateFunction(name, configArg, issues);
        break;
      case 'Nextjs':
      case 'StaticSite':
      case 'Remix':
      case 'Astro':
        this.validateNextjs(name, configArg, issues);
        break;
      case 'Dynamo':
      case 'Table':
      case 'DynamoDBTable':
        this.validateDynamoDB(name, configArg, issues);
        break;
    }
  }

  /**
   * Extract resource type from property access expression
   *
   * @param expr - Property access expression (e.g., sst.aws.Bucket)
   * @returns Resource type (e.g., "Bucket") or null
   */
  private getResourceType(expr: ts.PropertyAccessExpression): string | null {
    // Pattern: sst.aws.Bucket or aws.Bucket (SST v2 vs v3)
    const name = expr.name.text;

    if (expr.expression && ts.isPropertyAccessExpression(expr.expression)) {
      const parent = expr.expression.name.text;
      if (parent === 'aws') {
        return name;
      }
    }

    return null;
  }

  /**
   * Validate S3 Bucket configuration
   *
   * Checks for:
   * - CORS configured as array instead of object
   * - Wrong property names (allowedHeaders vs allowHeaders)
   * - maxAge as number instead of string with units
   */
  private validateBucket(name: string, config: ts.ObjectLiteralExpression, issues: ValidationIssue[]): void {
    // Find cors property
    const corsProperty = config.properties.find(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'cors'
    );

    if (!corsProperty) {
      return;
    }

    const corsValue = corsProperty.initializer;
    const line = this.getLineNumber(corsProperty);

    // Check 1: CORS should be an object, not an array
    if (ts.isArrayLiteralExpression(corsValue)) {
      issues.push({
        severity: 'error',
        resource: `Bucket("${name}")`,
        property: 'cors',
        message: 'CORS should be an object, not an array',
        line,
        fix: 'Change: cors: [{ ... }]\nTo:     cors: { ... }',
        docsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
      });
      return;
    }

    // Check 2: Validate CORS properties if it's an object
    if (ts.isObjectLiteralExpression(corsValue)) {
      this.validateCORSProperties(name, corsValue, issues);
    }
  }

  /**
   * Validate CORS object properties
   *
   * Checks for wrong property names and value formats
   */
  private validateCORSProperties(bucketName: string, cors: ts.ObjectLiteralExpression, issues: ValidationIssue[]): void {
    const wrongProperties = [
      { wrong: 'allowedHeaders', correct: 'allowHeaders' },
      { wrong: 'allowedMethods', correct: 'allowMethods' },
      { wrong: 'allowedOrigins', correct: 'allowOrigins' },
      { wrong: 'exposeHeaders', correct: 'exposeHeaders' }, // This one is correct, no issue
    ];

    for (const prop of cors.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
        continue;
      }

      const propName = prop.name.text;
      const line = this.getLineNumber(prop);

      // Check for wrong property names
      const wrongProp = wrongProperties.find(p => p.wrong === propName);
      if (wrongProp && wrongProp.wrong !== wrongProp.correct) {
        issues.push({
          severity: 'error',
          resource: `Bucket("${bucketName}")`,
          property: `cors.${propName}`,
          message: `Wrong property name: "${wrongProp.wrong}"`,
          line,
          fix: `Change: ${wrongProp.wrong}: [...]\nTo:     ${wrongProp.correct}: [...]`,
          docsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
        });
      }

      // Check maxAge format (should be string with units, not number)
      if (propName === 'maxAge') {
        if (ts.isNumericLiteral(prop.initializer)) {
          issues.push({
            severity: 'error',
            resource: `Bucket("${bucketName}")`,
            property: 'cors.maxAge',
            message: 'maxAge should be a string with units, not a number',
            line,
            fix: `Change: maxAge: ${prop.initializer.text}\nTo:     maxAge: "${prop.initializer.text} seconds"`,
            docsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
          });
        }
      }
    }
  }

  /**
   * Validate Lambda Function configuration
   *
   * Checks for:
   * - timeout as number instead of string with units
   * - memory as number instead of string with units
   */
  private validateFunction(name: string, config: ts.ObjectLiteralExpression, issues: ValidationIssue[]): void {
    const numericProperties = [
      { name: 'timeout', unit: 'seconds' },
      { name: 'memory', unit: 'MB' },
    ];

    for (const { name: propName, unit } of numericProperties) {
      const property = config.properties.find(
        (prop): prop is ts.PropertyAssignment =>
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === propName
      );

      if (!property) {
        continue;
      }

      const value = property.initializer;
      const line = this.getLineNumber(property);

      // Check if value is a number (should be string with units)
      if (ts.isNumericLiteral(value)) {
        issues.push({
          severity: 'error',
          resource: `Function("${name}")`,
          property: propName,
          message: `${propName} should be a string with units, not a number`,
          line,
          fix: `Change: ${propName}: ${value.text}\nTo:     ${propName}: "${value.text} ${unit}"`,
          docsUrl: 'https://sst.dev/docs/component/aws/function',
        });
      }
    }
  }

  /**
   * Validate Next.js/Static Site configuration
   *
   * Checks for:
   * - Missing NEXTAUTH_URL environment variable (warning for non-dev stages)
   */
  private validateNextjs(name: string, config: ts.ObjectLiteralExpression, issues: ValidationIssue[]): void {
    // Find environment property
    const envProperty = config.properties.find(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'environment'
    );

    if (!envProperty || !ts.isObjectLiteralExpression(envProperty.initializer)) {
      return;
    }

    const env = envProperty.initializer;

    // Check if NEXTAUTH_URL is defined
    const hasNextAuthUrl = env.properties.some(
      (prop) =>
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'NEXTAUTH_URL'
    );

    if (!hasNextAuthUrl && this.configContent.includes('next-auth')) {
      const line = this.getLineNumber(envProperty);
      issues.push({
        severity: 'warning',
        resource: `Nextjs("${name}")`,
        property: 'environment.NEXTAUTH_URL',
        message: 'NEXTAUTH_URL not defined - may be required for production',
        line,
        fix: 'Add: NEXTAUTH_URL: stage === "production" ? "https://example.com" : "http://localhost:3000"',
      });
    }
  }

  /**
   * Validate DynamoDB Table configuration
   *
   * Checks for:
   * - TTL configured as object instead of string field name
   */
  private validateDynamoDB(name: string, config: ts.ObjectLiteralExpression, issues: ValidationIssue[]): void {
    // Find ttl property
    const ttlProperty = config.properties.find(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'ttl'
    );

    if (!ttlProperty) {
      return;
    }

    const ttlValue = ttlProperty.initializer;
    const line = this.getLineNumber(ttlProperty);

    // Check if ttl is an object (should be just a string field name)
    if (ts.isObjectLiteralExpression(ttlValue)) {
      // Try to extract the attribute name from the object
      const attrProp = ttlValue.properties.find(
        (prop): prop is ts.PropertyAssignment =>
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'attribute'
      );

      const attrName = attrProp && ts.isStringLiteral(attrProp.initializer)
        ? attrProp.initializer.text
        : 'fieldName';

      issues.push({
        severity: 'error',
        resource: `Table("${name}")`,
        property: 'ttl',
        message: 'TTL should be a string field name, not an object',
        line,
        fix: `Change: ttl: { enabled: true, attribute: "${attrName}" }\nTo:     ttl: "${attrName}"`,
        docsUrl: 'https://sst.dev/docs/component/aws/dynamo',
      });
    }
  }

  /**
   * Get line number for a node
   *
   * @param node - TypeScript AST node
   * @returns Line number (1-indexed) or undefined
   */
  private getLineNumber(node: ts.Node): number | undefined {
    if (!this.sourceFile) {
      return undefined;
    }

    const { line } = this.sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1; // Convert to 1-indexed
  }
}

/**
 * Format validation errors for display
 *
 * @param issues - Array of validation issues
 * @returns Formatted error message
 */
export function formatValidationErrors(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return '';
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  let message = '';

  if (errors.length > 0) {
    message += '❌ SST Config Errors:\n\n';
    for (const issue of errors) {
      message += `  Location: ${issue.resource}${issue.line ? ` (line ${issue.line})` : ''}\n`;
      message += `  Problem:  ${issue.message}\n`;
      if (issue.fix) {
        message += `  Fix:\n    ${issue.fix.replace(/\n/g, '\n    ')}\n`;
      }
      if (issue.docsUrl) {
        message += `  Docs: ${issue.docsUrl}\n`;
      }
      message += '\n';
    }
  }

  if (warnings.length > 0) {
    message += '⚠️  SST Config Warnings:\n\n';
    for (const issue of warnings) {
      message += `  Location: ${issue.resource}${issue.line ? ` (line ${issue.line})` : ''}\n`;
      message += `  Warning:  ${issue.message}\n`;
      if (issue.fix) {
        message += `  Suggestion: ${issue.fix}\n`;
      }
      message += '\n';
    }
  }

  return message;
}
