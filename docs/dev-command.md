# Dev Command Documentation

> **Version**: 2.7.0
> **Features**: PR #83 - Interactive wizard, output filtering, smart grouping

## Overview

The `dev` command wraps `sst dev` with comprehensive pre-flight checks, intelligent error recovery, and sophisticated output management. It ensures your development environment is properly configured before starting the SST development server.

## Quick Start

```bash
# Start with all checks (recommended)
npx @duersjefen/deploy-kit dev

# Start with custom port
npx @duersjefen/deploy-kit dev --port=4000

# Use native SST output (bypass filtering)
npx @duersjefen/deploy-kit dev --native

# Silent mode (errors only)
npx @duersjefen/deploy-kit dev --profile=silent

# Interactive mode (wizard-style prompts)
npx @duersjefen/deploy-kit dev --interactive
```

## Command Flags

| Flag | Type | Description |
|------|------|-------------|
| `--skip-checks` | boolean | Skip all pre-flight checks |
| `--port=<number>` | number | Use custom port (default: 3000) |
| `--verbose` | boolean | Show detailed SST output |
| `--quiet` | boolean | Suppress non-essential output |
| `--native` | boolean | Use native SST output (no filtering) |
| `--profile=<type>` | string | Output profile: silent, normal, verbose, debug |
| `--hide-info` | boolean | Hide info-level messages |
| `--no-group` | boolean | Disable message grouping |
| `--interactive` | boolean | Interactive wizard mode |

## Pre-Flight Checks

The dev command runs **9 automated pre-flight checks** before starting SST:

### 1. AWS Credentials Check

**Purpose**: Ensures AWS credentials are configured and valid.

```bash
🔍 Checking AWS credentials...
✅ AWS credentials configured (Profile: default)
```

**Detects**:
- Missing `~/.aws/credentials`
- Missing `~/.aws/config`
- Invalid credentials
- No default profile

**Auto-Fix**: Provides `aws configure` command with detected profile

### 2. SST Lock Detection

**Purpose**: Detects and auto-unlocks stale Pulumi state locks.

```bash
🔍 Checking for SST locks...
⚠️  Pulumi state locked
   Detected: Lock from user@host (2 hours ago)
✅ Auto-unlocked SST (lock was stale)
```

**Detects**:
- Pulumi state locks
- Lock age and owner
- Stale locks (>1 hour)

**Auto-Fix**: Automatically unlocks if stale

### 3. Running SST Processes

**Purpose**: Detects existing SST dev servers to prevent conflicts.

```bash
🔍 Checking for running SST processes...
⚠️  Found running SST process (PID: 12345)
   Kill with: kill 12345
```

**Detects**:
- Running `sst dev` processes
- Port conflicts

**Manual Fix**: Kill existing process

### 4. Port Availability

**Purpose**: Ensures development port is available.

```bash
🔍 Checking port availability...
⚠️  Port 3000 in use by:
   • next-server (v16.0.1) (PID 70295)
✅ Using port 3002
```

**Detects**:
- Port conflicts
- Process using the port
- Next.js/Node process details

**Auto-Fix**: Automatically increments to next available port

### 5. Config Validation

**Purpose**: Validates `sst.config.ts` syntax.

```bash
🔍 Checking sst.config.ts...
✅ sst.config.ts found and valid
```

**Detects**:
- Missing config file
- Syntax errors
- Import errors

**Manual Fix**: Show syntax error with line number

### 6. .sst Directory Health

**Purpose**: Checks `.sst` directory for corruption.

```bash
🔍 Checking .sst directory health...
✅ .sst directory healthy
```

**Detects**:
- Corrupted state files
- Permission issues
- Missing dependencies

**Auto-Fix**: Suggests `.sst` directory cleanup

### 7. Reserved Lambda Environment Variables

**Purpose**: Detects reserved AWS Lambda variables in `sst.config.ts`.

```bash
🔍 Checking for reserved Lambda environment variables...
⚠️  Found reserved variable: AWS_REGION
   Location: sst.config.ts:42
   Fix: Remove AWS_REGION (Lambda sets this automatically)
```

**Detects**:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_LAMBDA_*` variables
- Other Lambda-managed vars

**Manual Fix**: Remove from config, these are auto-set by Lambda

### 8. Recursive SST Dev Script

**Purpose**: Detects infinite recursion in `package.json` dev script.

```bash
🔍 Checking for recursive SST dev script...
❌ Recursive SST dev script detected!
   package.json has: "dev": "sst dev"
✅ Auto-fixed: Separated SST and framework scripts
```

**Problematic Pattern**:
```json
{
  "scripts": {
    "dev": "sst dev"  // ❌ Creates infinite recursion!
  }
}
```

**Auto-Fixed To**:
```json
{
  "scripts": {
    "dev": "next dev",       // What SST calls internally
    "sst:dev": "sst dev"     // What you run manually
  }
}
```

**Auto-Fix**: Yes - Separates SST from framework scripts

### 9. Next.js Canary Features

**Purpose**: Detects canary-only Next.js features in stable versions.

```bash
🔍 Checking for Next.js canary-only features...
❌ Found canary-only features in stable Next.js
   • turbopackFileSystemCacheForBuild
   • optimizePackageImports (partial support in stable)
✅ Auto-fixed: Removed canary-only features
```

**Detects**:
```typescript
// ❌ Canary-only in next.config.ts
const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,  // Canary only!
    optimizePackageImports: ['lodash'],       // Partially canary
  }
};
```

**Auto-Fix**: Yes - Removes incompatible features

### 10. Pulumi Output Misuse

**Purpose**: Detects common "Partition 1 is not valid" errors.

```bash
🔍 Checking for Pulumi Output misuse in sst.config.ts...
⚠️  Potential Pulumi Output misuse detected
   Found: resources: [table.arn]
   Fix: resources: [table.arn.apply(arn => arn)]
```

**Detects**:
```typescript
// ❌ Wrong: Direct use of Output
resources: [table.arn]  // Pulumi Output type

// ✅ Correct: Use .apply()
resources: [table.arn.apply(arn => arn)]
```

**Manual Fix**: Requires manual verification (risky to auto-fix)

## Output Management

### Output Profiles

Control verbosity with `--profile`:

```bash
# Silent (errors only)
deploy-kit dev --profile=silent

# Normal (default - filters noise)
deploy-kit dev --profile=normal

# Verbose (all messages)
deploy-kit dev --profile=verbose

# Debug (includes debug logs)
deploy-kit dev --profile=debug
```

### Smart Message Grouping

Deploy-Kit automatically groups repetitive SST messages:

**Before** (Native SST):
```
✓ Deployed Lambda api_1 (120ms)
✓ Deployed Lambda api_2 (118ms)
✓ Deployed Lambda api_3 (119ms)
... (197 more identical messages)
✓ Deployed Lambda api_200 (121ms)
```

**After** (Deploy-Kit):
```
✓ Deployed 200 Lambda functions (avg 120ms)
  • api_1 through api_200
```

### Message Filtering

Automatically filters common noise:

- **node_modules paths** - Shortened or hidden
- **Turbopack/SWC messages** - Build tool internals
- **pnpm hoisting logs** - Package manager verbosity
- **Verbose TypeScript diagnostics** - Excessive type info

Use `--verbose` to see all messages.

### Development Summary

At server ready, shows concise summary:

```
✅ Dev Server Ready!

📊 Build Summary:
  • 200 Lambda functions deployed (avg 120ms)
  • 45 database tables configured
  • 12 environment variables loaded
  • ℹ️ 847 info messages suppressed (use --verbose)

🌐 http://localhost:3000
🔌 SST Console: http://localhost:13557
```

## Interactive Mode

The `--interactive` flag enables wizard-style prompts:

```bash
npx @duersjefen/deploy-kit dev --interactive
```

**Features**:
1. **Port Selection**: Choose port interactively
2. **Profile Selection**: Pick output verbosity
3. **Check Selection**: Enable/disable specific checks
4. **Error Recovery**: Guided fixing of issues

**Example Flow**:
```
? Select development port: 3000
? Output verbosity: normal (filters noise)
? Run all pre-flight checks? Yes

[Checks run...]

✅ All checks passed!

? Start SST dev server? Yes
[SST starts...]
```

## Hybrid Auto-Fix System

Deploy-Kit uses a **hybrid** approach to error fixing:

### Safe Auto-Fixes (Applied Automatically)

✅ **Recursive SST scripts** - Separates SST from framework
✅ **Next.js canary features** - Removes incompatible features
✅ **Stale SST locks** - Auto-unlocks if >1 hour old
✅ **Port conflicts** - Increments to next available port

### Risky Manual-Only Fixes

⚠️ **Pulumi Output transformations** - Requires code review
⚠️ **AWS credential issues** - Security-sensitive
⚠️ **Config syntax errors** - May have side effects

**Rationale**: Safe fixes are idempotent and reversible. Risky fixes may have unintended consequences.

## Error Translation

Deploy-Kit translates common SST errors into actionable guidance:

### SSL Certificate Error

**SST Error**:
```
Error: Certificate arn:aws:acm:... is in use
```

**Deploy-Kit Translation**:
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

### Pulumi State Lock

**SST Error**:
```
error: another deployment is currently in progress
```

**Deploy-Kit Translation**:
```
⚠️  Pulumi state locked

Detected: Lock from user@host (2 hours ago)

Fix:
1. Check if deployment is actually running: ps aux | grep sst
2. If not, auto-unlock: [Y/n]
```

### Port Conflict

**SST Error**:
```
Error: Port 3000 is already in use
```

**Deploy-Kit Translation**:
```
⚠️  Port 3000 in use by:
   • next-server (v16.0.1) (PID 70295)

Options:
1. Kill process: kill 70295
2. Use different port: --port=3001
3. Auto-increment: [Selected] Using port 3002
```

## Output Filtering Examples

### Example 1: Lambda Deployments

**Native SST** (200 lines):
```
Building Lambda function api_1...
✓ Built Lambda api_1 (120ms)
Deploying Lambda api_1...
✓ Deployed Lambda api_1 (45ms)
Building Lambda function api_2...
✓ Built Lambda api_2 (118ms)
... (196 more times)
```

**Deploy-Kit** (2 lines):
```
🔨 Building 200 Lambda functions...
✓ Deployed 200 Lambda functions (avg 120ms)
```

### Example 2: Error Messages

**Native SST**:
```
Error: Failed to deploy
   at /node_modules/.pnpm/sst@3.2.0/dist/runtime.js:1234:56
   at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:123:12)
   at node:internal/main/run_main_module:28:49
```

**Deploy-Kit**:
```
❌ Deployment failed: Configuration error

Fix: Check sst.config.ts syntax
See: https://docs.sst.dev/config
```

## Performance Impact

### Startup Time

- **Pre-flight checks**: 2-5 seconds
- **SST startup**: 10-30 seconds (unchanged)
- **Total overhead**: <5 seconds

### Memory Usage

- **Output buffering**: ~5MB (for grouping)
- **Check metadata**: ~1MB
- **Total**: ~6MB additional memory

### CPU Impact

- **Filtering**: Negligible (<1% CPU)
- **Grouping**: Minimal (~2-3% during build)

## Configuration

### Per-Project Settings

Create `.deploy-kit-dev.json` in project root:

```json
{
  "dev": {
    "defaultProfile": "normal",
    "autoUnlock": true,
    "autoPortIncrement": true,
    "skipChecks": [],
    "groupThreshold": 10,
    "hideInfoByDefault": false
  }
}
```

### Environment Variables

```bash
# Skip all checks
DEPLOY_KIT_SKIP_CHECKS=true npx deploy-kit dev

# Use specific profile
DEPLOY_KIT_PROFILE=verbose npx deploy-kit dev

# Disable auto-fixes
DEPLOY_KIT_NO_AUTO_FIX=true npx deploy-kit dev
```

## Troubleshooting

### Dev Server Won't Start

**Issue**: Checks pass but SST doesn't start

**Solutions**:
1. Try `--skip-checks` to bypass pre-flight
2. Check SST logs: `.sst/log/sst-dev.log`
3. Verify SST version: `npx sst version`

### Auto-Fix Not Working

**Issue**: Auto-fix applied but problem persists

**Solutions**:
1. Verify fix was saved: Check modified files
2. Restart terminal to reload env
3. Clear SST cache: `rm -rf .sst`

### Output Too Verbose

**Issue**: Too many messages even with filtering

**Solutions**:
1. Use `--profile=silent` for minimal output
2. Use `--hide-info` to suppress info messages
3. Adjust grouping threshold in config

### Check Failures

**Issue**: Pre-flight checks keep failing

**Solutions**:
1. Run checks individually: `--skip-checks` then test
2. Review failed check output carefully
3. Check system requirements (Node.js, AWS CLI, etc.)

## Best Practices

### 1. Always Run Checks (Default)

Pre-flight checks catch 80% of common dev issues. Let them run.

```bash
# ✅ Good
npx deploy-kit dev

# ❌ Bad (unless debugging)
npx deploy-kit dev --skip-checks
```

### 2. Use Interactive Mode for Setup

First time setting up? Use interactive mode:

```bash
npx deploy-kit dev --interactive
```

### 3. Profile Selection

Match profile to your workflow:

```bash
# Initial development - see everything
deploy-kit dev --profile=verbose

# Active development - filtered
deploy-kit dev --profile=normal

# Demo/presentation - quiet
deploy-kit dev --profile=silent
```

### 4. Trust Auto-Fixes

Safe auto-fixes are tested and reversible. Let them apply:

```bash
# ✅ Default (auto-fix enabled)
deploy-kit dev

# ❌ Only if debugging auto-fix
DEPLOY_KIT_NO_AUTO_FIX=true deploy-kit dev
```

### 5. Port Conflicts

Let deploy-kit handle port conflicts automatically:

```bash
# ✅ Auto-increment (default)
deploy-kit dev

# ⚠️ Manual port (use if auto-increment fails)
deploy-kit dev --port=4000
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Development Tests
on: [push]

jobs:
  dev-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      # Run pre-flight checks only
      - run: npx @duersjefen/deploy-kit dev --skip-checks
        env:
          DEPLOY_KIT_SKIP_CHECKS: true
```

### GitLab CI

```yaml
dev-checks:
  script:
    - npm install
    - npx @duersjefen/deploy-kit dev --skip-checks
  only:
    - branches
```

## Advanced Usage

### Custom Check Scripts

Add custom checks via hooks:

```json
{
  "hooks": {
    "preDevServer": "./scripts/custom-check.sh"
  }
}
```

### Disable Specific Checks

```bash
# Skip port check (if managing ports manually)
deploy-kit dev --skip-check=port

# Skip multiple checks
deploy-kit dev --skip-check=port,lock,config
```

### Output Customization

Create custom output filter:

```javascript
// .deploy-kit-dev.js
module.exports = {
  outputFilter: (line) => {
    // Hide all lines containing "node_modules"
    if (line.includes('node_modules')) return null;
    return line;
  }
};
```

## See Also

- [Architecture Documentation](./architecture.md)
- [AWS Integration Guide](./aws-integration.md)
- [Best Practices](./best-practices.md)
- [SST Official Docs](https://docs.sst.dev)
