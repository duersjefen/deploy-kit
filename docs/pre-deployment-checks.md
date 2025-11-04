# Pre-Deployment Checks

Automatically validate your application before deploying - catch issues early with zero configuration.

## Overview

Pre-deployment checks run tests, type checking, builds, and custom validations before SST deployment starts. This catches errors in seconds instead of after 5 minutes of deployment, providing:

- 🛡️ **Fail Fast** - Stop deployment before wasting time
- 🎯 **Stage-Specific** - Run expensive E2E tests only on production
- 📊 **Real-Time Output** - See test results as they happen
- ⚙️ **Zero Config** - Works out of the box with standard npm scripts
- 🚀 **No CI Dependency** - Same checks locally and in CI

## Quick Start (Zero Config)

Checks run automatically when you deploy:

```bash
npx @duersjefen/deploy-kit deploy staging
```

Deploy-Kit auto-detects checks from your `package.json` scripts:

| Script | Check | Default Timeout | Stages |
|--------|-------|----------------|--------|
| `typecheck` | Type checking | 30s | All |
| `test` | Unit tests | 1m | All |
| `build` | Build verification | 2m | All |
| `test:e2e` | E2E tests | 3m | staging, production |
| `lint` | Linting | 30s | All |

**Example `package.json`:**

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "next build",
    "test:e2e": "playwright test",
    "lint": "eslint ."
  }
}
```

With this setup, deploying runs all checks automatically - no configuration needed.

## Custom Configuration

Add `preDeploymentChecks` to `.deploy-config.json` for custom behavior:

```json
{
  "projectName": "my-app",
  "preDeploymentChecks": {
    "typecheck": true,
    "test": true,
    "build": true,
    "e2e": {
      "enabled": true,
      "command": "npm run test:e2e -- --headless",
      "stages": ["production"],
      "timeout": 300000
    },
    "lint": {
      "enabled": true,
      "timeout": 45000
    },
    "custom": [
      {
        "name": "Security Audit",
        "command": "npm audit --audit-level=high",
        "timeout": 30000
      },
      {
        "name": "Bundle Size Check",
        "command": "node scripts/check-bundle-size.js",
        "timeout": 10000,
        "stages": ["production"]
      }
    ]
  }
}
```

## Configuration Options

Each check accepts:

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `enabled` | boolean | Enable/disable check | `true` |
| `command` | string | Command to run | Auto-detected from package.json |
| `timeout` | number | Timeout in milliseconds | Varies by check type |
| `stages` | string[] | Which stages to run on | All stages |

### Boolean vs Object Syntax

Simple boolean:
```json
{
  "typecheck": true  // Uses defaults
}
```

Object for customization:
```json
{
  "typecheck": {
    "enabled": true,
    "command": "tsc --noEmit --strict",
    "timeout": 45000
  }
}
```

## Built-in Checks

### Type Check

**Default:** `npm run typecheck` (30s timeout)

```json
{
  "typecheck": {
    "enabled": true,
    "command": "tsc --noEmit",
    "timeout": 30000
  }
}
```

### Unit Tests

**Default:** `npm test` (60s timeout)

```json
{
  "test": {
    "enabled": true,
    "command": "npm test -- --coverage",
    "timeout": 90000
  }
}
```

### Build

**Default:** `npm run build` (120s timeout)

```json
{
  "build": {
    "enabled": true,
    "command": "npm run build",
    "timeout": 120000
  }
}
```

### Lint

**Default:** `npm run lint` (30s timeout)

```json
{
  "lint": {
    "enabled": true,
    "command": "npm run lint -- --max-warnings=0",
    "timeout": 30000
  }
}
```

### E2E Tests

**Default:** `npm run test:e2e` (180s timeout, staging/production only)

```json
{
  "e2e": {
    "enabled": true,
    "command": "npm run test:e2e -- --headless",
    "timeout": 300000,
    "stages": ["production"]
  }
}
```

## Stage-Specific Checks

Run expensive checks only on certain stages:

```json
{
  "preDeploymentChecks": {
    "test": true,  // All stages
    "build": true,  // All stages
    "e2e": {
      "enabled": true,
      "stages": ["staging", "production"]  // Skip for dev
    },
    "custom": [
      {
        "name": "Performance Audit",
        "command": "npm run lighthouse",
        "stages": ["production"],
        "timeout": 120000
      }
    ]
  }
}
```

## Custom Checks

Add any command as a check:

```json
{
  "preDeploymentChecks": {
    "custom": [
      {
        "name": "Security Audit",
        "command": "npm audit --audit-level=high",
        "timeout": 30000
      },
      {
        "name": "Dependency Check",
        "command": "npm outdated --depth=0",
        "timeout": 15000
      },
      {
        "name": "License Check",
        "command": "npm run check-licenses",
        "timeout": 20000
      }
    ]
  }
}
```

## Example Output

When checks run, you see real-time progress:

```
╔════════════════════════════════════════════════════════════╗
║       🚀 Deploying to STAGING                              ║
║       Deploy-Kit v2.8.4                                    ║
╚════════════════════════════════════════════════════════════╝

🔍 Running Pre-Deployment Checks
   Stage: staging
   Checks: 3

▶ Running: Type Check
  Command: npm run typecheck

$ tsc --noEmit
✅ Type Check passed (2.3s)

▶ Running: Unit Tests
  Command: npm test

$ vitest run
✓ src/utils/api.test.ts (12 tests)
✓ src/components/Button.test.tsx (8 tests)
✅ Unit Tests passed (4.1s)

▶ Running: Build
  Command: npm run build

$ next build
✓ Compiled successfully
✅ Build passed (8.7s)

═══════════════════════════════════════════════════════════
✅ All Pre-Deployment Checks Passed
═══════════════════════════════════════════════════════════

Passed: 3/3
Total Duration: 15.1s

🚀 Deploying with SST...
```

## Skip Checks (Emergency Only)

For emergency hotfixes, you can bypass checks:

```bash
npx @duersjefen/deploy-kit deploy production --skip-checks
```

**Warning displayed:**

```
⚠️  WARNING: Skipping pre-deployment checks!
   This should only be used for emergency hotfixes.
   Deploy at your own risk.
```

## Handling Failures

When a check fails, deployment is blocked:

```
▶ Running: Unit Tests
  Command: npm test

$ vitest run
✗ src/utils/api.test.ts > should handle errors
  Expected: 200
  Received: 500

❌ Unit Tests failed (3.2s)
   Error: Process exited with code 1

═══════════════════════════════════════════════════════════
❌ Pre-Deployment Checks Failed
═══════════════════════════════════════════════════════════

Passed: 2/3

❌ Deployment blocked by failed pre-deployment checks
   Fix the issues above and try again
   Or use --skip-checks to bypass (not recommended)
```

**Recovery steps:**
1. Fix the failing test
2. Run tests locally: `npm test`
3. Retry deployment: `npx @duersjefen/deploy-kit deploy staging`

## Timeout Handling

If a check hangs, it's automatically killed after the timeout:

```
▶ Running: E2E Tests
  Command: npm run test:e2e

❌ E2E Tests failed (180.0s)
   Error: Timeout after 180000ms
```

**Common causes:**
- Server not starting properly
- Tests waiting for user input
- Infinite loops

**Solutions:**
- Increase timeout in config
- Fix hanging tests
- Run tests locally to debug

## Disable Specific Checks

Disable checks you don't need:

```json
{
  "preDeploymentChecks": {
    "typecheck": false,  // Disabled
    "test": true,
    "build": true
  }
}
```

Or disable for specific stages:

```json
{
  "preDeploymentChecks": {
    "typecheck": {
      "enabled": true,
      "stages": ["production"]  // Only on production
    }
  }
}
```

## CI/CD Integration

Pre-deployment checks replace traditional CI validation:

**Before (GitHub Actions):**
```yaml
# .github/workflows/deploy.yml
- run: npm test
- run: npm run build
- run: npm run test:e2e
- run: npx deploy-kit deploy production
```

**After (Deploy-Kit):**
```bash
# .deploy-config.json auto-detects these from package.json
npx @duersjefen/deploy-kit deploy production
```

**Benefits:**
- ✅ Same checks locally and in CI
- ✅ No CI configuration needed
- ✅ Faster feedback (no CI queue)
- ✅ Works in Conductor, local, CI, anywhere

## Best Practices

### 1. Keep Checks Fast

Target total time under 2 minutes:

```json
{
  "preDeploymentChecks": {
    "typecheck": true,     // ~5s
    "test": true,          // ~10s
    "build": true,         // ~30s
    "e2e": {
      "enabled": true,
      "stages": ["production"],  // Only when needed
      "timeout": 180000
    }
  }
}
```

### 2. Use Stage-Specific Checks

Run expensive checks only where needed:

```json
{
  "e2e": {
    "enabled": true,
    "stages": ["staging", "production"]  // Skip on dev
  },
  "custom": [
    {
      "name": "Lighthouse Audit",
      "command": "npm run lighthouse",
      "stages": ["production"]  // Production only
    }
  ]
}
```

### 3. Set Appropriate Timeouts

Balance between catching hangs and allowing slow tests:

```json
{
  "typecheck": { "timeout": 30000 },   // 30s
  "test": { "timeout": 60000 },        // 1m
  "build": { "timeout": 120000 },      // 2m
  "e2e": { "timeout": 300000 }         // 5m
}
```

### 4. Fail Fast

Order checks from fastest to slowest:

1. Type check (5-10s)
2. Lint (10-15s)
3. Unit tests (10-30s)
4. Build (30-60s)
5. E2E tests (60-180s)

First failure stops execution, saving time.

## Troubleshooting

### Checks Not Running

**Symptom:** No checks run when deploying

**Causes:**
1. No scripts in `package.json`
2. All checks disabled in config
3. Using `--skip-checks` flag

**Solution:**
```bash
# Check package.json has scripts
cat package.json | grep -A 5 scripts

# Verify config
cat .deploy-config.json | grep -A 10 preDeploymentChecks

# Don't use --skip-checks unless emergency
```

### Wrong Commands Detected

**Symptom:** Auto-detection uses wrong commands

**Solution:** Override in `.deploy-config.json`:

```json
{
  "preDeploymentChecks": {
    "test": {
      "command": "npm run test:unit",  // Override
      "timeout": 60000
    }
  }
}
```

### Checks Too Slow

**Symptom:** Checks take >5 minutes

**Solution:** Optimize or use stage-specific checks:

```json
{
  "test": {
    "command": "npm test -- --maxWorkers=4",  // Parallelize
    "timeout": 90000
  },
  "e2e": {
    "enabled": true,
    "stages": ["production"]  // Only on production
  }
}
```

### Timeout Too Short

**Symptom:** Checks killed before finishing

**Solution:** Increase timeout:

```json
{
  "e2e": {
    "timeout": 360000  // 6 minutes
  }
}
```

## Migration from GitHub Actions

If you're using GitHub Actions for CI checks, you can simplify:

**Before:**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run test:e2e
```

**After:**
```json
// .deploy-config.json
{
  "preDeploymentChecks": {
    "typecheck": true,
    "test": true,
    "build": true,
    "e2e": {
      "enabled": true,
      "stages": ["staging", "production"]
    }
  }
}
```

```bash
# Runs all checks automatically
npx @duersjefen/deploy-kit deploy staging
```

**GitHub Actions still useful for:**
- Scheduled tasks (nightly tests)
- Multi-platform testing (Windows, macOS, Linux)
- Security scanning (Dependabot, CodeQL)
- Branch protection rules

## See Also

- [Dev Command Guide](./dev-command.md) - Pre-flight checks for dev server
- [Configuration Guide](./configuration.md) - All config options
- [Best Practices](./best-practices.md) - Deployment workflow recommendations
