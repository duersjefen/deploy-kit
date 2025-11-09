/**
 * SST Config Error Catalog (DEP-30)
 *
 * Comprehensive catalog of SST configuration errors with:
 * - Unique error codes (SST-VAL-XXX)
 * - Root cause explanations
 * - Before/after examples
 * - Links to documentation
 *
 * This catalog prevents incidents like the staging.mawave.app failure
 * where `input?.stage || "dev"` silently broke domain configuration.
 */

import type { ErrorCatalogEntry } from './types.js';

/**
 * Full error catalog indexed by error code
 */
export const ERROR_CATALOG: Record<string, ErrorCatalogEntry> = {
  // ============================================================================
  // STAGE VARIABLE PATTERNS (SST-VAL-001 to SST-VAL-010)
  // ============================================================================

  'SST-VAL-001': {
    code: 'SST-VAL-001',
    title: 'Wrong Stage Variable - Using input.stage in run() Function',
    description: 'Using input?.stage or input.stage in the run() function causes silent failures because run() does not receive input parameter. Note: input?.stage is VALID in app() function.',
    category: 'stage-variable',
    rootCause: 'SST v3 API: app(input) receives input parameter (input?.stage is valid), but run() does not receive parameters (must use $app.stage instead).',
    badExample: `// ❌ WRONG - input is undefined in run()
async run() {
  const stage = input?.stage || "dev";
  // This silently fails - stage is always "dev"
}`,
    goodExample: `// ✅ CORRECT - input?.stage in app(), $app.stage in run()
app(input) {
  return {
    removal: input?.stage === "production" ? "retain" : "remove"  // ✅ Valid
  };
},
async run() {
  const stage = $app.stage;  // ✅ Valid - use global $app
}`,
    relatedCodes: ['SST-VAL-002', 'SST-VAL-003'],
    sstDocsUrl: 'https://sst.dev/docs/reference/config',
    deployKitDocsUrl: '#stage-variable-patterns',
  },

  'SST-VAL-002': {
    code: 'SST-VAL-002',
    title: 'Incorrect Function Signature - run() Should Not Accept Parameters',
    description: 'The run() function in sst.config.ts should not accept any parameters in SST v3.',
    category: 'function-signature',
    rootCause: 'SST v3 removed input parameter from run() function. Stage and other config come from globals.',
    badExample: `export default $config({
  async run(input: any) {  // ❌ WRONG - no parameters
    // ...
  }
})`,
    goodExample: `export default $config({
  async run() {  // ✅ CORRECT - no parameters
    const stage = $app.stage;
    const region = $app.providers.aws.region;
  }
})`,
    relatedCodes: ['SST-VAL-001'],
    sstDocsUrl: 'https://sst.dev/docs/reference/config',
    deployKitDocsUrl: '#function-signature-patterns',
  },

  'SST-VAL-003': {
    code: 'SST-VAL-003',
    title: 'Hardcoded Stage Value - Should Use $app.stage',
    description: 'Hardcoding stage values like "dev", "staging", "production" prevents proper multi-stage deployments.',
    category: 'stage-variable',
    rootCause: 'Hardcoded stages break when deploying to different environments with --stage flag.',
    badExample: `const stage = "dev";  // ❌ WRONG - hardcoded
const domain = stage === "production" ? "example.com" : undefined;`,
    goodExample: `const stage = $app.stage;  // ✅ CORRECT - dynamic
const domain = stage === "production" ? "example.com" :
               stage === "staging" ? "staging.example.com" : undefined;`,
    relatedCodes: ['SST-VAL-001', 'SST-VAL-011'],
    sstDocsUrl: 'https://sst.dev/docs/reference/config',
    deployKitDocsUrl: '#stage-variable-patterns',
  },

  // ============================================================================
  // DOMAIN CONFIGURATION PATTERNS (SST-VAL-011 to SST-VAL-020)
  // ============================================================================

  'SST-VAL-011': {
    code: 'SST-VAL-011',
    title: 'Incorrect Domain Conditional - Using !== Instead of Explicit Checks',
    description: 'Using stage !== "dev" for domain config breaks for other non-production stages like staging, preview, etc.',
    category: 'domain-config',
    rootCause: 'Negative conditionals fail to account for multiple non-production stages.',
    badExample: `domain: stage !== "dev" ? {  // ❌ WRONG
  name: "example.com",
  redirects: ["www.example.com"]
} : undefined
// This breaks for "staging", "preview", "test", etc.`,
    goodExample: `// ✅ CORRECT - explicit stage checks
domain: stage === "production" ? {
  name: "example.com",
  redirects: ["www.example.com"]
} : stage === "staging" ? {
  name: "staging.example.com"
} : undefined`,
    relatedCodes: ['SST-VAL-003', 'SST-VAL-012'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
    deployKitDocsUrl: '#domain-configuration-patterns',
  },

  'SST-VAL-012': {
    code: 'SST-VAL-012',
    title: 'Missing DNS Configuration - Required for Custom Domains',
    description: 'Custom domains MUST have explicit dns configuration to prevent CloudFront CNAME conflicts and deployment failures. (Severity: error - CHANGED from warning in Issue #220)',
    category: 'domain-config',
    rootCause: 'SST requires explicit DNS provider configuration when using custom domains. Without it, CloudFront CNAME conflicts cause deployment to fail with CNAMEAlreadyExists error.',
    badExample: `domain: {
  name: "example.com",  // ❌ Missing dns property - WILL FAIL
  redirects: ["www.example.com"]
}`,
    goodExample: `domain: {
  name: "example.com",
  redirects: ["www.example.com"],
  dns: sst.aws.dns({           // ✅ CORRECT - explicit DNS with override
    zone: "Z1234567890ABC",
    override: true              // Required for existing distributions
  })
}`,
    relatedCodes: ['SST-VAL-011', 'SST-VAL-012a'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
    deployKitDocsUrl: '#domain-configuration-patterns',
  },

  'SST-VAL-012a': {
    code: 'SST-VAL-012a',
    title: 'Missing dns.override Parameter - Required for Existing CloudFront Distributions',
    description: 'When updating existing CloudFront distributions, dns.override: true is REQUIRED or deployment will fail with CNAMEAlreadyExists error. (Severity: error). Real-world incident (Issue #220): Project had existing CloudFront distributions. Deployment failed with CNAMEAlreadyExists → manual deletion required → hit SST bug → production downtime.',
    category: 'domain-config',
    rootCause: 'SST cannot update DNS for existing CloudFront distributions without explicit override: true. This is a common cause of production deployment failures.',
    badExample: `domain: {
  name: "example.com",
  dns: sst.aws.dns({
    zone: "Z1234567890ABC"  // ❌ Missing override - WILL FAIL if distribution exists
  })
}`,
    goodExample: `domain: {
  name: "example.com",
  dns: sst.aws.dns({
    zone: "Z1234567890ABC",
    override: true           // ✅ CORRECT - can update existing distribution
  })
}`,
    relatedCodes: ['SST-VAL-012'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/nextjs#domain',
    deployKitDocsUrl: '#domain-configuration-patterns',
  },

  // ============================================================================
  // CORS CONFIGURATION PATTERNS (SST-VAL-021 to SST-VAL-030)
  // ============================================================================

  'SST-VAL-021': {
    code: 'SST-VAL-021',
    title: 'CORS Property Name Typo - allowedOrigins vs allowOrigins',
    description: 'Using allowedOrigins instead of allowOrigins causes CORS errors.',
    category: 'cors-config',
    rootCause: 'SST uses allowOrigins (no "ed"), not allowedOrigins. Inconsistent naming with AWS SDK.',
    badExample: `cors: {
  allowHeaders: ["*"],
  allowedOrigins: ["*"],  // ❌ WRONG - should be allowOrigins
  allowMethods: ["GET", "POST"]
}`,
    goodExample: `cors: {
  allowHeaders: ["*"],
  allowOrigins: ["*"],  // ✅ CORRECT
  allowMethods: ["GET", "POST"]
}`,
    relatedCodes: ['SST-VAL-022', 'SST-VAL-023'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
    deployKitDocsUrl: '#cors-configuration-patterns',
  },

  'SST-VAL-022': {
    code: 'SST-VAL-022',
    title: 'CORS Property Name Typo - allowedMethods vs allowMethods',
    description: 'Using allowedMethods instead of allowMethods causes CORS errors.',
    category: 'cors-config',
    rootCause: 'SST uses allowMethods (no "ed"), not allowedMethods.',
    badExample: `cors: {
  allowedMethods: ["GET", "POST"]  // ❌ WRONG
}`,
    goodExample: `cors: {
  allowMethods: ["GET", "POST"]  // ✅ CORRECT
}`,
    relatedCodes: ['SST-VAL-021', 'SST-VAL-023'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
    deployKitDocsUrl: '#cors-configuration-patterns',
  },

  'SST-VAL-023': {
    code: 'SST-VAL-023',
    title: 'CORS Property Name Typo - allowedHeaders vs allowHeaders',
    description: 'Using allowedHeaders instead of allowHeaders causes CORS errors.',
    category: 'cors-config',
    rootCause: 'SST uses allowHeaders (no "ed"), not allowedHeaders.',
    badExample: `cors: {
  allowedHeaders: ["*"]  // ❌ WRONG
}`,
    goodExample: `cors: {
  allowHeaders: ["*"]  // ✅ CORRECT
}`,
    relatedCodes: ['SST-VAL-021', 'SST-VAL-022'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
    deployKitDocsUrl: '#cors-configuration-patterns',
  },

  'SST-VAL-024': {
    code: 'SST-VAL-024',
    title: 'CORS Configured as Array - Should Be Object',
    description: 'CORS should be an object with properties, not an array.',
    category: 'cors-config',
    rootCause: 'SST v3 changed CORS from array to object configuration.',
    badExample: `cors: [{  // ❌ WRONG - array
  allowOrigins: ["*"],
  allowHeaders: ["*"]
}]`,
    goodExample: `cors: {  // ✅ CORRECT - object
  allowOrigins: ["*"],
  allowHeaders: ["*"]
}`,
    relatedCodes: ['SST-VAL-021'],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/bucket#cors',
    deployKitDocsUrl: '#cors-configuration-patterns',
  },

  // ============================================================================
  // PULUMI OUTPUT PATTERNS (SST-VAL-031 to SST-VAL-040)
  // ============================================================================

  'SST-VAL-031': {
    code: 'SST-VAL-031',
    title: 'Unnecessary $interpolate Wrapper - Direct Output Usage',
    description: 'Using $interpolate for simple Pulumi Output values is unnecessary and adds complexity.',
    category: 'pulumi-output',
    rootCause: 'SST v3 automatically handles Pulumi Outputs in most contexts. $interpolate only needed for string templates.',
    badExample: `link: [$interpolate\`\${bucket.arn}\`]  // ❌ WRONG - unnecessary wrapper`,
    goodExample: `link: [bucket.arn]  // ✅ CORRECT - direct usage
// Use $interpolate only for actual templates:
link: [\`\${bucket.arn}/*\`]  // ✅ Also correct for templates`,
    relatedCodes: ['SST-VAL-032'],
    sstDocsUrl: 'https://sst.dev/docs/reference/linkable',
    deployKitDocsUrl: '#pulumi-output-patterns',
  },

  'SST-VAL-032': {
    code: 'SST-VAL-032',
    title: 'Pulumi Output in String Context - Need $interpolate or .apply()',
    description: 'Pulumi Outputs cannot be used directly in string concatenation or comparisons.',
    category: 'pulumi-output',
    rootCause: 'Pulumi Outputs are async values that require special handling in string contexts.',
    badExample: `const url = "https://" + domain.name;  // ❌ WRONG - Output in string concat
if (bucket.arn === "some-value") { }  // ❌ WRONG - Output in comparison`,
    goodExample: `const url = $interpolate\`https://\${domain.name}\`;  // ✅ CORRECT
bucket.arn.apply(arn => {  // ✅ CORRECT - use .apply()
  if (arn === "some-value") { }
});`,
    relatedCodes: ['SST-VAL-031'],
    sstDocsUrl: 'https://www.pulumi.com/docs/concepts/inputs-outputs/',
    deployKitDocsUrl: '#pulumi-output-patterns',
  },

  // ============================================================================
  // ENVIRONMENT VARIABLE PATTERNS (SST-VAL-041 to SST-VAL-050)
  // ============================================================================

  'SST-VAL-041': {
    code: 'SST-VAL-041',
    title: 'Reserved Lambda Environment Variable - AWS_ACCESS_KEY_ID',
    description: 'AWS_ACCESS_KEY_ID is a reserved Lambda environment variable and cannot be set manually.',
    category: 'environment-variable',
    rootCause: 'Lambda runtime sets AWS credentials automatically. Manual override is forbidden and causes deployment errors.',
    badExample: `environment: {
  AWS_ACCESS_KEY_ID: "...",  // ❌ FORBIDDEN
  AWS_SECRET_ACCESS_KEY: "..."  // ❌ FORBIDDEN
}`,
    goodExample: `environment: {
  BUCKET_NAME: bucket.name,  // ✅ CORRECT - custom variable
  // AWS credentials are automatically provided by Lambda
}`,
    relatedCodes: ['SST-VAL-042', 'SST-VAL-043'],
    sstDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
    deployKitDocsUrl: '#environment-variable-patterns',
  },

  'SST-VAL-042': {
    code: 'SST-VAL-042',
    title: 'Reserved Lambda Environment Variable - _HANDLER',
    description: 'Variables starting with _ are reserved by Lambda runtime.',
    category: 'environment-variable',
    rootCause: 'Lambda reserves all variables starting with underscore for internal runtime use.',
    badExample: `environment: {
  _HANDLER: "index.handler",  // ❌ FORBIDDEN
  _X_AMZN_TRACE_ID: "..."  // ❌ FORBIDDEN
}`,
    goodExample: `environment: {
  HANDLER_NAME: "index.handler",  // ✅ CORRECT - no underscore prefix
}`,
    relatedCodes: ['SST-VAL-041'],
    sstDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
    deployKitDocsUrl: '#environment-variable-patterns',
  },

  'SST-VAL-043': {
    code: 'SST-VAL-043',
    title: 'Reserved Lambda Environment Variable - LAMBDA_*',
    description: 'Variables starting with LAMBDA_ are reserved by Lambda runtime.',
    category: 'environment-variable',
    rootCause: 'Lambda reserves LAMBDA_ prefix for runtime configuration.',
    badExample: `environment: {
  LAMBDA_TASK_ROOT: "/var/task",  // ❌ FORBIDDEN
}`,
    goodExample: `environment: {
  APP_TASK_ROOT: "/var/task",  // ✅ CORRECT - different prefix
}`,
    relatedCodes: ['SST-VAL-041', 'SST-VAL-042'],
    sstDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime',
    deployKitDocsUrl: '#environment-variable-patterns',
  },

  // ============================================================================
  // RESOURCE DEPENDENCY PATTERNS (SST-VAL-051 to SST-VAL-060)
  // ============================================================================

  'SST-VAL-051': {
    code: 'SST-VAL-051',
    title: 'Circular Resource Dependency Detected',
    description: 'Two or more resources depend on each other creating a circular dependency.',
    category: 'resource-dependency',
    rootCause: 'Circular dependencies prevent proper resource ordering during deployment.',
    badExample: `const fnA = new sst.aws.Function("A", {
  link: [fnB]  // ❌ WRONG - A depends on B
});
const fnB = new sst.aws.Function("B", {
  link: [fnA]  // ❌ WRONG - B depends on A (circular!)
});`,
    goodExample: `// ✅ CORRECT - proper hierarchy
const fnA = new sst.aws.Function("A", {
  link: [bucket]  // A depends on bucket
});
const fnB = new sst.aws.Function("B", {
  link: [fnA, bucket]  // B depends on A and bucket (no cycle)
});`,
    relatedCodes: ['SST-VAL-052'],
    sstDocsUrl: 'https://sst.dev/docs/reference/linkable',
    deployKitDocsUrl: '#resource-dependency-patterns',
  },

  'SST-VAL-052': {
    code: 'SST-VAL-052',
    title: 'Using Resource Before Declaration',
    description: 'Referencing a resource before it is declared can cause undefined errors.',
    category: 'resource-dependency',
    rootCause: 'JavaScript execution order - resources must be declared before use.',
    badExample: `const api = new sst.aws.ApiGatewayV2("Api", {
  link: [myFunction]  // ❌ WRONG - myFunction not declared yet
});
const myFunction = new sst.aws.Function("MyFn", { ... });`,
    goodExample: `// ✅ CORRECT - declare before use
const myFunction = new sst.aws.Function("MyFn", { ... });
const api = new sst.aws.ApiGatewayV2("Api", {
  link: [myFunction]
});`,
    relatedCodes: ['SST-VAL-051'],
    sstDocsUrl: 'https://sst.dev/docs/reference/linkable',
    deployKitDocsUrl: '#resource-dependency-patterns',
  },
  'SST-VAL-061': {
    code: 'SST-VAL-061',
    title: 'DynamoDB Fields Not Indexed - Unused Attributes',
    description: 'All fields defined in the "fields" property must be used in at least one index (primaryIndex, globalIndexes, or localIndexes). AWS SDK throws "all attributes must be indexed" error when fields are defined but never indexed.',
    category: 'dynamodb-schema',
    rootCause: 'DynamoDB tables require all explicitly declared fields to be indexed somewhere. Fields can still be stored without declaring them in "fields" - only declare fields you will index.',
    badExample: `const table = new sst.aws.Dynamo("MyTable", {
  fields: {
    id: "string",
    createdAt: "number",     // ❌ WRONG - defined but not indexed
    lastReadAt: "number"     // ❌ WRONG - defined but not indexed
  },
  primaryIndex: { hashKey: "id" }
});`,
    goodExample: `// Option 1: Remove unused fields (they can still be stored)
const table = new sst.aws.Dynamo("MyTable", {
  fields: {
    id: "string"
  },
  primaryIndex: { hashKey: "id" }
});

// Option 2: Add indexes for the fields
const table = new sst.aws.Dynamo("MyTable", {
  fields: {
    id: "string",
    createdAt: "number",
    lastReadAt: "number"
  },
  primaryIndex: { hashKey: "id" },
  globalIndexes: {
    createdAtIndex: { hashKey: "createdAt" },
    lastReadIndex: { hashKey: "lastReadAt" }
  }
});`,
    relatedCodes: [],
    sstDocsUrl: 'https://sst.dev/docs/component/aws/dynamo',
    deployKitDocsUrl: '#dynamodb-schema-patterns',
  },
};

/**
 * Get error catalog entry by code
 */
export function getErrorInfo(code: string): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG[code];
}

/**
 * Get all error codes for a category
 */
export function getErrorsByCategory(category: string): ErrorCatalogEntry[] {
  return Object.values(ERROR_CATALOG).filter(entry => entry.category === category);
}

/**
 * Format error catalog entry for display
 */
export function formatErrorCatalogEntry(entry: ErrorCatalogEntry): string {
  let output = `\n${'='.repeat(80)}\n`;
  output += `ERROR CODE: ${entry.code}\n`;
  output += `TITLE: ${entry.title}\n`;
  output += `${'='.repeat(80)}\n\n`;

  output += `DESCRIPTION:\n${entry.description}\n\n`;

  output += `ROOT CAUSE:\n${entry.rootCause}\n\n`;

  output += `❌ INCORRECT CODE:\n${entry.badExample}\n\n`;

  output += `✅ CORRECT CODE:\n${entry.goodExample}\n\n`;

  if (entry.relatedCodes && entry.relatedCodes.length > 0) {
    output += `RELATED ERRORS: ${entry.relatedCodes.join(', ')}\n\n`;
  }

  if (entry.sstDocsUrl) {
    output += `SST DOCS: ${entry.sstDocsUrl}\n`;
  }

  if (entry.deployKitDocsUrl) {
    output += `DEPLOY-KIT DOCS: ${entry.deployKitDocsUrl}\n`;
  }

  return output;
}
