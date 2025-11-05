# SST Config Validation Guide

Deploy-Kit includes comprehensive validation for SST configurations to prevent deployment failures before they happen.

## Validation Layers

Deploy-Kit uses a multi-layered validation approach:

### Layer 1: Basic Validation (DEP-22)
- File existence and basic syntax
- Export structure validation

### Layer 2: Link & Permissions (DEP-25)
- Resource link conflicts
- IAM permissions issues
- GSI permissions validation

### Layer 3: Pulumi Output Usage (DEP-26)
- Detect misuse of Pulumi Outputs
- String interpolation issues

### Layer 4: Value Validation (DEP-27)
- CORS format validation
- Lambda timeout/memory format
- DynamoDB TTL format
- Environment variable validation

### Layer 5: Pattern Detection (DEP-30)
**NEW** - Advanced AST-based pattern detection with auto-fix

## Pattern Detection (DEP-30)

The pattern detection system catches structural code issues that cause silent failures.

### 7 Critical Pattern Categories

#### 1. Stage Variable Patterns

**SST-VAL-001: Wrong Stage Variable**
```typescript
// ❌ WRONG - causes silent failures
async run(input: any) {
  const stage = input?.stage || "dev";  // Always "dev"!
}

// ✅ CORRECT
async run() {
  const stage = $app.stage;  // Reflects CLI --stage flag
}
```

**SST-VAL-002: Incorrect Function Signature**
```typescript
// ❌ WRONG - run() takes no parameters in SST v3
async run(input: any) { ... }

// ✅ CORRECT
async run() {
  const stage = $app.stage;
}
```

**SST-VAL-003: Hardcoded Stage**
```typescript
// ❌ WRONG - breaks multi-stage deployments
const stage = "dev";

// ✅ CORRECT
const stage = $app.stage;
```

#### 2. Domain Configuration Patterns

**SST-VAL-011: Incorrect Domain Conditional**
```typescript
// ❌ WRONG - breaks for staging, preview, test
domain: stage !== "dev" ? {
  name: "example.com"
} : undefined

// ✅ CORRECT - explicit stage checks
domain: stage === "production" ? {
  name: "example.com"
} : stage === "staging" ? {
  name: "staging.example.com"
} : undefined
```

**SST-VAL-012: Missing DNS Override**
```typescript
// ⚠️  WARNING - may need dns.override for existing distributions
domain: {
  name: "example.com"
}

// ✅ RECOMMENDED
domain: {
  name: "example.com",
  dns: sst.cloudflare.dns()
}
```

#### 3. CORS Configuration Patterns

**SST-VAL-021, 022, 023: CORS Property Typos**
```typescript
// ❌ WRONG - typos cause CORS errors
cors: {
  allowedOrigins: ["*"],    // Wrong: allowed*
  allowedMethods: ["GET"],  // Wrong: allowed*
  allowedHeaders: ["*"]     // Wrong: allowed*
}

// ✅ CORRECT
cors: {
  allowOrigins: ["*"],      // Correct: no "ed"
  allowMethods: ["GET"],
  allowHeaders: ["*"]
}
```

**SST-VAL-024: CORS as Array**
```typescript
// ❌ WRONG - SST v3 uses object
cors: [{ allowOrigins: ["*"] }]

// ✅ CORRECT
cors: { allowOrigins: ["*"] }
```

#### 4. Environment Variable Patterns

**SST-VAL-041: Reserved AWS Variables**
```typescript
// ❌ FORBIDDEN - Lambda sets these automatically
environment: {
  AWS_ACCESS_KEY_ID: "...",
  AWS_SECRET_ACCESS_KEY: "..."
}

// ✅ CORRECT - use custom names
environment: {
  BUCKET_NAME: bucket.name
}
```

**SST-VAL-042: Underscore Prefix**
```typescript
// ❌ FORBIDDEN - reserved by Lambda runtime
environment: {
  _HANDLER: "index.handler"
}

// ✅ CORRECT - no underscore prefix
environment: {
  HANDLER_NAME: "index.handler"
}
```

**SST-VAL-043: LAMBDA_ Prefix**
```typescript
// ❌ FORBIDDEN - reserved by Lambda
environment: {
  LAMBDA_TASK_ROOT: "/var/task"
}

// ✅ CORRECT - different prefix
environment: {
  APP_TASK_ROOT: "/var/task"
}
```

#### 5. Pulumi Output Patterns

**SST-VAL-031: Unnecessary $interpolate**
```typescript
// ❌ UNNECESSARY - adds complexity
link: [$interpolate`${bucket.arn}`]

// ✅ CORRECT - direct usage
link: [bucket.arn]

// Use $interpolate only for actual templates:
link: [`${bucket.arn}/*`]  // ✅ Valid use case
```

**SST-VAL-032: Output in String Context**
```typescript
// ❌ WRONG - Output can't be used directly in strings
const url = "https://" + domain.name;

// ✅ CORRECT - use $interpolate
const url = $interpolate`https://${domain.name}`;

// ✅ ALSO CORRECT - use .apply()
domain.name.apply(name => {
  const url = "https://" + name;
});
```

#### 6. Resource Dependency Patterns

**SST-VAL-051: Circular Dependencies**
```typescript
// ❌ WRONG - circular dependency
const fnA = new sst.aws.Function("A", { link: [fnB] });
const fnB = new sst.aws.Function("B", { link: [fnA] });

// ✅ CORRECT - proper hierarchy
const bucket = new sst.aws.Bucket("Bucket");
const fnA = new sst.aws.Function("A", { link: [bucket] });
const fnB = new sst.aws.Function("B", { link: [fnA, bucket] });
```

**SST-VAL-052: Usage Before Declaration**
```typescript
// ❌ WRONG - myFunction not declared yet
const api = new sst.aws.Function("Api", { link: [myFunction] });
const myFunction = new sst.aws.Function("MyFn", { ... });

// ✅ CORRECT - declare before use
const myFunction = new sst.aws.Function("MyFn", { ... });
const api = new sst.aws.Function("Api", { link: [myFunction] });
```

## Auto-Fix System

Deploy-Kit can automatically fix many pattern violations.

### Confidence Levels

- **High Confidence** 🟢 - Safe to auto-fix
  - `input.stage` → `$app.stage`
  - CORS property typos
  - Hardcoded stage values

- **Medium Confidence** 🟡 - Review recommended
  - Domain conditionals
  - Pulumi Output usage
  - Environment variable renames

- **Low Confidence** 🔴 - Manual review required
  - Complex architectural issues
  - Business logic patterns

### Usage

```bash
# Detect issues only (default)
dk deploy

# Preview auto-fixes (dry-run)
dk deploy --dry-run

# Apply auto-fixes
dk deploy --fix

# Apply medium+ confidence fixes
dk deploy --fix --confidence=medium
```

## Performance

- **Target**: < 1 second validation time
- **Achieved**: < 500ms for typical configs
- **Optimization**: Incremental parsing, parallel rule execution

## Error Catalog

Each error has a unique code (SST-VAL-XXX) with:
- Detailed description
- Root cause explanation
- Before/after examples
- Documentation links
- Related error codes

View error details:
```bash
dk validate --explain SST-VAL-001
```

## Best Practices

### 1. Always use $app.stage
```typescript
const stage = $app.stage;  // ✅ Always correct
```

### 2. Use explicit stage conditionals
```typescript
// ✅ Clear and explicit
const domain = stage === "production" ? "example.com" :
               stage === "staging" ? "staging.example.com" :
               undefined;
```

### 3. Avoid reserved environment variables
```typescript
// ✅ Use custom prefixes
environment: {
  APP_NAME: "my-app",
  CUSTOM_BUCKET: bucket.name
}
```

### 4. Direct Pulumi Output usage
```typescript
// ✅ Simple and clean
link: [bucket.arn, table.name]

// Only use $interpolate for actual templates
environment: {
  API_URL: $interpolate`https://${domain.name}/api`
}
```

## Integration

Pattern detection runs automatically during:
- `dk deploy` - Pre-deployment validation
- `dk dev` - Development-time checks
- `dk validate` - Standalone validation

## Disable Specific Rules

```typescript
// .deploy-kit.config.js
export default {
  validation: {
    disabledRules: ['SST-VAL-012']  // Disable specific warnings
  }
};
```

## Contributing

Found a new pattern? [Open an issue](https://github.com/deploy-kit/deploy-kit/issues) with:
- Description of the pattern
- Example of incorrect code
- Example of correct code
- Root cause explanation

## References

- [SST v3 Documentation](https://sst.dev/docs)
- [Pulumi Outputs Guide](https://www.pulumi.com/docs/concepts/inputs-outputs/)
- [Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
- [Deploy-Kit Linear Issue DEP-30](https://linear.app/paiss/issue/DEP-30)
