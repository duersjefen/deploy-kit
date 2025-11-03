# Deploy-Kit Best Practices

> **Version**: 2.7.0
> **Purpose**: Production-ready deployment guidelines

## Table of Contents

- [Development Workflow](#development-workflow)
- [Deployment Strategy](#deployment-strategy)
- [Configuration Management](#configuration-management)
- [Error Handling](#error-handling)
- [Security](#security)
- [Performance](#performance)
- [CI/CD Integration](#cicd-integration)
- [Monitoring & Observability](#monitoring--observability)

---

## Development Workflow

### 1. Use `deploy-kit dev` Instead of `sst dev`

**✅ Do:**
```bash
npx @duersjefen/deploy-kit dev
```

**❌ Don't:**
```bash
npx sst dev  # Bypasses safety checks
```

**Why**: Deploy-kit's dev command includes 9 pre-flight checks that catch common issues before they cause problems.

### 2. Trust Auto-Fixes

Deploy-kit's hybrid auto-fix system is battle-tested:

**Safe Auto-Fixes** (Let them run):
- Recursive SST scripts
- Next.js canary features
- Stale SST locks
- Port conflicts

**Risky Fixes** (Manual review required):
- Pulumi Output transformations
- AWS credential changes
- Config syntax errors

### 3. Commit Configuration Changes

Auto-fixes modify your configuration. Commit them:

```bash
# After auto-fix
git add package.json next.config.ts
git commit -m "fix: Apply deploy-kit auto-fixes"
```

### 4. Use Interactive Mode for Setup

First time on a project? Use interactive mode:

```bash
npx @duersjefen/deploy-kit dev --interactive
```

This walks you through configuration step-by-step.

---

## Deployment Strategy

### 1. Always Deploy to Staging First

**✅ Do:**
```bash
# Step 1: Staging
npx @duersjefen/deploy-kit deploy staging
# Verify works
curl https://staging.example.com/api/health

# Step 2: Production (after verification)
npx @duersjefen/deploy-kit deploy production
```

**❌ Don't:**
```bash
# Skipping staging
npx @duersjefen/deploy-kit deploy production
```

**Why**: Staging catches deployment issues without affecting users.

### 2. Use Confirmation for Production

In `.deploy-config.json`:

```json
{
  "stageConfig": {
    "production": {
      "requiresConfirmation": true
    }
  }
}
```

This adds a confirmation prompt before production deploys.

### 3. Monitor Deployment Timing

Review the deployment timeline:

```
⏱️  Stage Timing Breakdown:
  Pre-Deployment Checks  ████████░░░░░░░░░░░░  12.5s
  Build & Deploy         ████████████████░░░░  187.3s
  Health Checks          █████░░░░░░░░░░░░░░░   25.8s
  Cache Invalidation     ██░░░░░░░░░░░░░░░░░░    2.1s
```

If Build & Deploy takes >5 minutes, investigate:
- Large dependencies
- Slow tests
- Network issues
- Complex infrastructure

### 4. Test Health Checks Locally

Before deploying, test health check endpoints:

```bash
# Start dev server
npx @duersjefen/deploy-kit dev

# Test endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/
```

Update `.deploy-config.json` with working endpoints.

### 5. Use Git Tags for Releases

After successful production deploy:

```bash
git tag -a v1.2.3 -m "Release 1.2.3"
git push origin v1.2.3
```

This enables easy rollbacks:

```bash
git checkout v1.2.2
npx @duersjefen/deploy-kit deploy production
```

---

## Configuration Management

### 1. Validate Configuration Before Committing

```bash
npx @duersjefen/deploy-kit validate
```

Run this before committing `.deploy-config.json` changes.

### 2. Keep Staging and Production Similar

**✅ Do:**
```json
{
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com",
      "requiresConfirmation": false
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true
    }
  }
}
```

**❌ Don't:**
```json
{
  "stageConfig": {
    "staging": {
      "skipHealthChecks": true,  // ❌ Different behavior
      "skipCacheInvalidation": true
    },
    "production": {
      "skipHealthChecks": false,
      "skipCacheInvalidation": false
    }
  }
}
```

**Why**: Configuration drift causes production surprises.

### 3. Use Environment-Specific Health Checks

Different endpoints for different stages:

```json
{
  "healthChecks": [
    {
      "url": "/api/health",
      "expectedStatus": 200,
      "name": "Health endpoint"
    },
    {
      "url": "/",
      "searchText": "Example App",
      "name": "Homepage"
    }
  ],
  "stageConfig": {
    "staging": {
      "healthChecks": [
        {
          "url": "/api/health",
          "expectedStatus": 200
        }
      ]
    }
  }
}
```

### 4. Document AWS Profile Requirements

In project README:

```markdown
## AWS Setup

This project requires AWS profile: `myapp`

Setup:
```bash
aws configure --profile myapp
```

`.deploy-config.json`:
```json
{
  "awsProfile": "myapp"
}
```
```

### 5. Use Lifecycle Hooks Wisely

```json
{
  "hooks": {
    "preDeploy": "npm test",           // ✅ Always run tests
    "postBuild": "npm run lint",       // ✅ Verify build quality
    "postDeploy": "npm run verify",    // ✅ Post-deploy checks
    "onError": "npm run rollback"      // ⚠️ Risky - test thoroughly
  }
}
```

**Warning**: `onError` hooks can make debugging harder. Use with caution.

---

## Error Handling

### 1. Read Error Messages Completely

Deploy-kit provides actionable guidance:

```
❌ SSL certificate error detected

Problem: ACM certificate already exists but not configured

Fix:
1. Get certificate ARN: aws acm list-certificates --region us-east-1
2. Add to sst.config.ts:
   domain: {
     name: "example.com",
     cert: "arn:aws:acm:..."
   }
```

Don't skip to "solutions" - understand the problem first.

### 2. Use `doctor` for Diagnostics

Before deploying, run:

```bash
npx @duersjefen/deploy-kit doctor
```

This checks all systems:
- Git status
- AWS credentials
- SST configuration
- Node.js version
- Test suite

### 3. Check Deployment Status

If deployment fails or hangs:

```bash
# Check what's blocking
npx @duersjefen/deploy-kit status

# Check specific stage
npx @duersjefen/deploy-kit status staging
```

### 4. Use Recovery for Failed Deploys

If deployment fails and locks remain:

```bash
# Step 1: Check status
npx @duersjefen/deploy-kit status staging

# Step 2: Recover (clears locks)
npx @duersjefen/deploy-kit recover staging

# Step 3: Retry deployment
npx @duersjefen/deploy-kit deploy staging
```

### 5. Enable Verbose Mode for Debugging

```bash
# See all SST output
npx @duersjefen/deploy-kit deploy staging --verbose

# Or for dev server
npx @duersjefen/deploy-kit dev --profile=verbose
```

---

## Security

### 1. Never Commit Secrets

**❌ Don't:**
```json
{
  "awsAccessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "awsSecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}
```

**✅ Do:**
```json
{
  "awsProfile": "myapp"
}
```

Use AWS profiles, not hardcoded credentials.

### 2. Use Origin Access Control (OAC)

Deploy-kit automatically validates CloudFront OAC:

```bash
🔍 Validating CloudFront OAC...
✅ Origin Access Control configured correctly
```

If this fails, your S3 bucket is publicly accessible (security risk).

### 3. Rotate AWS Credentials Regularly

```bash
# Every 90 days
aws iam list-access-keys
aws iam create-access-key
aws iam delete-access-key --access-key-id OLD_KEY
```

### 4. Use IAM Roles in CI/CD

Don't use IAM user credentials in GitHub Actions:

**❌ Don't:**
```yaml
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**✅ Do:**
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789:role/GitHubActions
```

### 5. Review Health Check Responses

Ensure health checks don't leak sensitive info:

**❌ Don't:**
```json
{
  "status": "ok",
  "database": "postgresql://user:pass@host/db",
  "apiKeys": ["secret-key-123"]
}
```

**✅ Do:**
```json
{
  "status": "ok",
  "checks": {
    "database": "connected",
    "cache": "ready"
  }
}
```

---

## Performance

### 1. Optimize Build Times

**Split Dependencies**:
```json
{
  "dependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^19.0.0"
  }
}
```

**Why**: `devDependencies` aren't installed in Lambda.

### 2. Use CloudFront Cache Effectively

Deploy-kit invalidates CloudFront automatically, but:

**✅ Cache static assets aggressively**:
```typescript
// next.config.ts
export default {
  headers: async () => [
    {
      source: '/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
      ]
    }
  ]
};
```

**⚠️ Don't cache API responses** (unless intentional):
```typescript
// app/api/route.ts
export async function GET() {
  return Response.json(data, {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
```

### 3. Monitor Health Check Timeout

Health checks timeout after 5 seconds (default). If failing:

```json
{
  "healthChecks": [
    {
      "url": "/api/health",
      "timeout": 10000  // Increase to 10s
    }
  ]
}
```

But investigate slow endpoints - 5s is already slow.

### 4. Parallelize Independent Operations

Deploy-kit runs stages sequentially, but within each stage:

**✅ Parallel health checks** (default):
```json
{
  "healthChecks": [
    { "url": "/api/health" },
    { "url": "/" },
    { "url": "/api/status" }
  ]
}
```

All check in parallel (~5s total), not sequentially (~15s).

### 5. Use Staging for Performance Testing

Before production deploy:

```bash
# Deploy to staging
npx @duersjefen/deploy-kit deploy staging

# Load test
ab -n 1000 -c 10 https://staging.example.com/

# Review timing
npx @duersjefen/deploy-kit status staging
```

---

## CI/CD Integration

### 1. Use Separate Stages for CI/CD

**GitHub Actions**:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx @duersjefen/deploy-kit deploy staging
        env:
          AWS_REGION: us-east-1

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx @duersjefen/deploy-kit deploy production
        env:
          AWS_REGION: us-east-1
```

### 2. Skip Tests in CI (Already Run)

If you run tests separately:

```json
{
  "runTestsBeforeDeploy": false  // CI already ran tests
}
```

Or use environment variable:

```bash
SKIP_TESTS=true npx @duersjefen/deploy-kit deploy staging
```

### 3. Use Non-Interactive Mode

CI doesn't support prompts:

```json
{
  "stageConfig": {
    "staging": {
      "requiresConfirmation": false  // Required for CI
    }
  }
}
```

### 4. Capture Deployment Logs

```yaml
- run: npx @duersjefen/deploy-kit deploy staging 2>&1 | tee deploy.log
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: deploy-logs
    path: deploy.log
```

### 5. Use Matrix for Multi-Region Deploys

```yaml
strategy:
  matrix:
    region: [us-east-1, eu-west-1]
steps:
  - run: npx @duersjefen/deploy-kit deploy staging
    env:
      AWS_REGION: ${{ matrix.region }}
```

---

## Monitoring & Observability

### 1. Enable CloudWatch Logging

In `sst.config.ts`:

```typescript
new Function(stack, "api", {
  handler: "app/api/handler.ts",
  logging: {
    retention: "1 week",
    level: "INFO"
  }
});
```

### 2. Track Deployment Metrics

Store deployment timing:

```bash
# After deploy
npx @duersjefen/deploy-kit status staging --json > metrics.json
```

Analyze over time:
```bash
# Average deployment time
jq '.deployments[].duration' metrics.json | awk '{sum+=$1} END {print sum/NR}'
```

### 3. Set Up Alerts for Failed Health Checks

**CloudWatch Alarm**:
```typescript
new cloudwatch.Alarm(stack, "HealthCheckAlarm", {
  metric: healthCheckMetric,
  threshold: 1,
  evaluationPeriods: 2,
  alarmActions: [snsTopic]
});
```

### 4. Monitor CloudFront Cache Hit Rate

```bash
# Check cache effectiveness
aws cloudfront get-distribution-config --id DISTID
```

Target: >80% cache hit rate for static assets.

### 5. Review Deployment History

```bash
# List recent deployments
git log --oneline --grep="deploy"

# Check production deploy commits
git log --oneline --grep="production"
```

Tag important deploys:

```bash
git tag -a prod-v1.2.3 -m "Production release 1.2.3"
```

---

## Common Pitfalls

### 1. ❌ Skipping Pre-Flight Checks

```bash
# Don't do this without good reason
npx @duersjefen/deploy-kit dev --skip-checks
```

**Why**: You'll encounter issues the checks would have caught.

### 2. ❌ Ignoring Lock Warnings

```
⚠️  Deployment lock detected (2 hours old)
? Clear lock and proceed? [y/N]
```

**Don't**: Just hit 'y' - Check if deployment is actually running!

### 3. ❌ Deploying Dirty Git State

```
❌ Git status check failed
   Uncommitted changes detected
```

**Don't**: Force deploy - Commit or stash first.

### 4. ❌ Not Testing Health Checks

Deploy with untested health checks = guaranteed failure.

**Always**:
```bash
# Test locally first
curl http://localhost:3000/api/health
```

### 5. ❌ Hardcoding Stage Names

```typescript
// ❌ Bad
const domain = "staging.example.com";

// ✅ Good
const domain = $app.stage === "production"
  ? "example.com"
  : `${$app.stage}.example.com`;
```

---

## Quick Reference

### Pre-Deployment Checklist

- [ ] Run `deploy-kit doctor`
- [ ] Run `deploy-kit validate`
- [ ] Test health check endpoints locally
- [ ] Commit all changes
- [ ] Deploy to staging first
- [ ] Verify staging works
- [ ] Deploy to production
- [ ] Monitor health checks
- [ ] Verify production works
- [ ] Tag release in Git

### Deployment Commands

```bash
# Development
npx @duersjefen/deploy-kit dev
npx @duersjefen/deploy-kit dev --interactive

# Validation
npx @duersjefen/deploy-kit validate
npx @duersjefen/deploy-kit doctor

# Deployment
npx @duersjefen/deploy-kit deploy staging
npx @duersjefen/deploy-kit deploy production

# Health & Status
npx @duersjefen/deploy-kit health staging
npx @duersjefen/deploy-kit status

# Recovery
npx @duersjefen/deploy-kit recover staging
```

### Troubleshooting Commands

```bash
# Check locks
npx @duersjefen/deploy-kit status

# Clear stale locks
npx @duersjefen/deploy-kit recover staging

# Verbose deploy
npx @duersjefen/deploy-kit deploy staging --verbose

# Check AWS credentials
aws sts get-caller-identity

# Check SST version
npx sst version

# View CloudWatch logs
aws logs tail /aws/lambda/my-function --follow
```

---

## Additional Resources

- [Architecture Documentation](./architecture.md)
- [Dev Command Guide](./dev-command.md)
- [AWS Integration](./aws-integration.md)
- [SST Documentation](https://docs.sst.dev)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Questions or Issues?**

Open an issue: https://github.com/duersjefen/deploy-kit/issues
