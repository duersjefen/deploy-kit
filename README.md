# @duersjefen/deploy-kit

Reusable deployment system for SST + Next.js + DynamoDB applications with comprehensive safety checks and CloudFront validation.

## Features

- ✅ **Safe-by-default:** 5-stage deployment process with automatic rollback
- ✅ **Dual-lock system:** Prevents concurrent deployments (human + infrastructure)
- ✅ **Health checks:** Automatic validation after deployment
- ✅ **CloudFront validation:** Ensures Origin Access Control is configured correctly
- ✅ **Configurable:** Works with SST, custom deploys, EC2/Docker
- ✅ **Zero setup:** Just add `.deploy-config.json` to your project
- ✨ **Sophisticated Terminal UI:** Professional formatting with progress indicators and visual timelines
- 🤖 **Intelligent Error Recovery:** Pattern-based error matching with specific recovery steps
- 📊 **Deployment Timeline:** Visual stage breakdown with timing analysis
- 🔒 **SSL Certificate Management:** Automated ACM certificate creation and DNS validation
- 🎯 **Pre-Deployment Checks:** Comprehensive git, AWS, test, and SSL validation

## Sophisticated User Experience

Deploy-kit isn't just a tool—it's a **deployment platform** designed to make deployments robust, easy, and fun:

```
🚀 DEPLOYMENT PIPELINE: staging

▸ Stage 1: Pre-Deployment Checks
  Validating: git status, AWS credentials, tests, SSL

✅ Git Status          Clean working directory
✅ AWS Credentials     Account: 123456789
✅ Tests               All tests passing
✅ SSL Certificate     Ready: arn:aws:acm:...

═══════════════════════════════════════════════════════════════
📋 Pre-Deployment Check Summary
═══════════════════════════════════════════════════════════════

✅ Git Status                   Clean working directory
✅ AWS Credentials              Account: 123456789
✅ Tests                        All tests passing
✅ SSL Certificate              Ready: arn:aws:acm:...

─────────────────────────────────────────────────────────────
  ✅ Passed: 4 | ⚠️  Warnings: 0 | ❌ Failed: 0
─────────────────────────────────────────────────────────────

▸ Stage 2: Build & Deploy
▸ Stage 3: Post-Deployment Validation
▸ Stage 4: Cache Invalidation

═══════════════════════════════════════════════════════════════
✨ DEPLOYMENT SUCCESSFUL
═══════════════════════════════════════════════════════════════

📊 Deployment Summary:
  Stage: staging
  Total Duration: 245s
  Status: ✅ All checks passed

⏱️  Stage Timing Breakdown:
  Pre-Deployment Checks  ████████░░░░░░░░░░░░  12.5s
  Build & Deploy         ████████████████░░░░  187.3s
  Health Checks          █████░░░░░░░░░░░░░░░   25.8s
  Cache Invalidation     ██░░░░░░░░░░░░░░░░░░    2.1s

✅ Application is now live on staging
   Deployment completed at 3:45 PM
```

**Key Features:**
- 🎨 **Professional visual formatting** - Borders, separators, and color coding
- ⏱️ **Stage timing breakdown** - See where time is spent during deployment
- 🎯 **Progress indicators** - Know exactly what's happening at each step
- 🤖 **Intelligent error recovery** - When things go wrong, get specific guidance
- 📊 **Detailed summaries** - Know what passed, what warned, what failed

## Installation

```bash
npm install --save-dev @duersjefen/deploy-kit
```

## Quick Start

### Option A: Automated Setup (Recommended)

Use the interactive setup wizard:

```bash
npx @duersjefen/deploy-kit init
```

This creates:
- ✅ `.deploy-config.json` - Deployment configuration
- ✅ `Makefile` - User-friendly deploy targets  
- ✅ Updated `package.json` - Convenient npm scripts

Then deploy:

```bash
make deploy-staging
make deploy-prod
```

### Option B: Manual Setup

### 1. Create `.deploy-config.json`

Copy and customize a template:

```bash
# For SST + Next.js projects
cp node_modules/@duersjefen/deploy-kit/templates/config.sst-example.json .deploy-config.json

# For EC2 + Docker projects
cp node_modules/@duersjefen/deploy-kit/templates/config.ec2-example.json .deploy-config.json
```

### 2. Update Makefile

```makefile
deploy-staging:
	npx @duersjefen/deploy-kit deploy staging

deploy-production:
	npx @duersjefen/deploy-kit deploy production

deployment-status:
	npx @duersjefen/deploy-kit status
```

### 3. Deploy!

```bash
# Check status
make deployment-status

# Deploy to staging
make deploy-staging

# Deploy to production
make deploy-production
```

### Partial Initialization Flags

If you already have a `.deploy-config.json` or want to set up components separately, use these flags:

```bash
# Only create configuration file (skip Makefile and npm scripts)
npx @duersjefen/deploy-kit init --config-only

# Only add npm scripts to package.json (requires existing config)
npx @duersjefen/deploy-kit init --scripts-only

# Only create Makefile (requires existing config)
npx @duersjefen/deploy-kit init --makefile-only
```

**Use cases:**
- **`--config-only`** - Create config first, then decide about scripts/Makefile later
- **`--scripts-only`** - Add npm scripts to existing project without recreating config
- **`--makefile-only`** - Create Makefile without touching configuration or scripts

## Configuration

### Minimal SST Project

```json
{
  "projectName": "my-app",
  "infrastructure": "sst-serverless",
  "stages": ["staging", "production"],
  "mainDomain": "example.com",
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com"
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true
    }
  }
}
```

### Full Configuration with Health Checks

```json
{
  "projectName": "my-app",
  "displayName": "My App",
  "infrastructure": "sst-serverless",
  "database": "dynamodb",
  "stages": ["dev", "staging", "production"],
  "mainDomain": "example.com",
  "awsProfile": "my-app",
  "requireCleanGit": true,
  "runTestsBeforeDeploy": true,
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com",
      "requiresConfirmation": false
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true,
      "sstStageName": "prod"
    }
  },
  "healthChecks": [
    {
      "url": "/api/health",
      "expectedStatus": 200,
      "timeout": 5000,
      "name": "Health endpoint"
    },
    {
      "url": "/",
      "searchText": "My App",
      "name": "Homepage"
    }
  ],
  "hooks": {
    "preDeploy": "npm test",
    "postBuild": "npm run build"
  }
}
```

## Configuration Options

### Root Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectName` | string | **required** | Project identifier |
| `infrastructure` | string | **required** | `sst-serverless`, `ec2-docker`, or `custom` |
| `stages` | array | `["staging", "production"]` | Available deployment stages |
| `mainDomain` | string | optional | Default domain (used in health checks) |
| `awsProfile` | string | optional | AWS profile to use |
| `requireCleanGit` | boolean | `true` | Require clean git status |
| `runTestsBeforeDeploy` | boolean | `true` | Run `npm test` before deploy |
| `customDeployScript` | string | optional | Path to custom deploy script |

### Stage Config

| Option | Type | Description |
|--------|------|-------------|
| `domain` | string | Full domain for this stage |
| `requiresConfirmation` | boolean | Require manual approval before deploy |
| `skipHealthChecks` | boolean | Skip health checks for this stage |
| `skipCacheInvalidation` | boolean | Skip CloudFront cache clear |
| `sstStageName` | string | SST stage name (if different from stage name) |
| `dynamoTableName` | string | DynamoDB table name |
| `awsRegion` | string | AWS region for this stage |

### Health Checks

```json
{
  "url": "/api/health",           // URL to check (relative or absolute)
  "expectedStatus": 200,          // Expected HTTP status (default: 200)
  "timeout": 5000,                // Timeout in ms (default: 5000)
  "searchText": "OK",             // Optional text to find in response
  "name": "Health endpoint"        // Display name
}
```

## CLI Commands

```bash
# Initialize a new project (one-command setup)
npx @duersjefen/deploy-kit init

# Deploy to a stage
npx @duersjefen/deploy-kit deploy staging
npx @duersjefen/deploy-kit deploy production

# Check deployment status
npx @duersjefen/deploy-kit status          # All stages
npx @duersjefen/deploy-kit status staging  # Specific stage

# Recover from failed deployment
npx @duersjefen/deploy-kit recover staging
npx @duersjefen/deploy-kit recover production

# Validate health checks
npx @duersjefen/deploy-kit health staging

# Validate configuration
npx @duersjefen/deploy-kit validate

# Run pre-deployment health check
npx @duersjefen/deploy-kit doctor

# Start SST development server with pre-flight checks
npx @duersjefen/deploy-kit dev
npx @duersjefen/deploy-kit dev --verbose
npx @duersjefen/deploy-kit dev --port=4000

# Manage CloudFront distributions
npx @duersjefen/deploy-kit cloudfront audit
npx @duersjefen/deploy-kit cloudfront cleanup
```

## Command Reference

### `init` - Project Setup

Interactive setup wizard for new projects. Creates `.deploy-config.json`, `Makefile`, and updates npm scripts.

```bash
# Full setup (interactive)
npx @duersjefen/deploy-kit init

# Only create config file
npx @duersjefen/deploy-kit init --config-only

# Only update npm scripts (requires existing config)
npx @duersjefen/deploy-kit init --scripts-only

# Only create Makefile (requires existing config)
npx @duersjefen/deploy-kit init --makefile-only
```

**Features:**
- Auto-detects AWS profile from `sst.config.ts` for SST projects
- Validates project names, domains, and AWS profiles
- Smart defaults for common configurations

### `validate` - Configuration Validation

Validates `.deploy-config.json` for syntax errors, required fields, and configuration issues.

```bash
npx @duersjefen/deploy-kit validate
```

**Checks:**
- Required fields (projectName, infrastructure, stages, stageConfig)
- Domain format validation
- Health check configuration
- AWS profile existence
- Stage configuration completeness

### `doctor` - Pre-Deployment Health Check

Comprehensive diagnostic check before deployment. Verifies all systems are ready.

```bash
npx @duersjefen/deploy-kit doctor
```

**Checks:**
- Configuration validity
- Git repository status and remote
- AWS credentials and profile
- SST installation (for SST projects)
- Node.js version compatibility
- Test suite (if configured)

### `dev` - SST Development Server

Wraps `sst dev` with automatic pre-flight checks and error recovery.

```bash
# Start with all pre-flight checks
npx @duersjefen/deploy-kit dev

# Skip pre-flight checks
npx @duersjefen/deploy-kit dev --skip-checks

# Use custom port
npx @duersjefen/deploy-kit dev --port=4000

# Show detailed SST output
npx @duersjefen/deploy-kit dev --verbose
```

**Pre-Flight Checks:**
1. **AWS Credentials** - Validates AWS credentials are configured
2. **SST Lock Detection** - Checks for Pulumi state locks and auto-unlocks if needed
3. **Port Availability** - Verifies development port is available
4. **Config Validity** - Validates `sst.config.ts` syntax
5. **.sst Directory** - Checks `.sst` directory health
6. **Recursive SST Dev Script** - Detects infinite recursion in package.json dev script
7. **Next.js Canary Features** - Detects canary-only features in stable Next.js
8. **Pulumi Output Misuse** - Detects common "Partition 1 is not valid" errors

**Hybrid Auto-Fix Approach:**
- **Safe Fixes (Auto-Apply):** Recursive scripts, canary features, SST locks
- **Risky Fixes (Manual Only):** Pulumi Output transformations (requires verification)

**Error Recovery:**
- Automatically fixes recursive dev scripts (separates SST from framework)
- Automatically removes unsupported Next.js canary features
- Automatically unlocks SST if locked
- Provides specific fixes for Pulumi Output errors (manual intervention required)
- Translates common SST errors into actionable guidance

**Example Error Detections:**

```typescript
// Pattern 1: Pulumi Output Misuse
// ❌ Detected and warned (manual fix required)
resources: [table.arn]  // Missing .apply()

// ✅ Correct suggestion
resources: [table.arn.apply(arn => arn)]
```

```json
// Pattern 2: Recursive SST Dev Script
// ❌ Detected and auto-fixed
{
  "scripts": {
    "dev": "sst dev"  // Creates infinite recursion!
  }
}

// ✅ Auto-fixed to
{
  "scripts": {
    "dev": "next dev",       // What SST calls internally
    "sst:dev": "sst dev"     // What you run
  }
}
```

```typescript
// Pattern 3: Next.js Canary Features
// ❌ Detected and auto-fixed
const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,  // Canary-only!
  }
};

// ✅ Auto-fixed: Features removed for stable Next.js
```

### `deploy` - Production Deployment

Deploy to staging or production with full safety checks.

```bash
npx @duersjefen/deploy-kit deploy staging
npx @duersjefen/deploy-kit deploy production
```

**Safety Features:**
- Dual-lock system prevents concurrent deployments
- Pre-deployment validation (git, AWS, tests, SSL)
- Build verification
- Post-deployment health checks
- CloudFront cache invalidation
- Deployment timeline with timing breakdown

### `status` - Deployment Status

Check deployment status for all stages or a specific stage.

```bash
# Check all stages
npx @duersjefen/deploy-kit status

# Check specific stage
npx @duersjefen/deploy-kit status staging
```

**Detects:**
- Active deployment locks
- Pulumi state information
- Previous deployment failures
- Lock expiration times

### `recover` - Failure Recovery

Recover from failed deployments by clearing locks and preparing for retry.

```bash
npx @duersjefen/deploy-kit recover staging
npx @duersjefen/deploy-kit recover production
```

**Recovery Actions:**
- Clears file-based deployment locks
- Clears Pulumi state locks
- Validates system is ready for retry

### `health` - Health Check Validation

Run health checks for a deployed application.

```bash
npx @duersjefen/deploy-kit health staging
npx @duersjefen/deploy-kit health production
```

**Validates:**
- HTTP endpoint connectivity
- Expected status codes
- Response content (if configured)
- Database connectivity (if configured)
- CloudFront OAC configuration

### `cloudfront` - CloudFront Management

Manage and audit CloudFront distributions.

```bash
# Audit all distributions
npx @duersjefen/deploy-kit cloudfront audit

# Clean up unused distributions
npx @duersjefen/deploy-kit cloudfront cleanup

# Generate distribution report
npx @duersjefen/deploy-kit cloudfront report
```

### Command Reference

#### `validate` - Configuration Validation
Validates `.deploy-config.json` for errors before deployment.

**Checks:**
- ✅ JSON syntax validity
- ✅ Required fields (projectName, infrastructure, stages)
- ✅ Domain format validation
- ✅ Stage configuration completeness
- ✅ AWS profile existence (if specified)
- ✅ Health check endpoint format

**Usage:** `npx @duersjefen/deploy-kit validate`

---

#### `doctor` - Pre-Deployment Health Check
Comprehensive system diagnostic to ensure deployment readiness.

**Checks:**
- ✅ Configuration validity
- ✅ Git status (clean working directory)
- ✅ AWS credentials (valid access)
- ✅ AWS profile (auto-detected for SST projects)
- ✅ SST configuration (sst.config.ts exists)
- ✅ Node.js & npm versions
- ✅ Test suite availability

**Usage:** `npx @duersjefen/deploy-kit doctor`

**Output:** Color-coded diagnostic report with pass/warn/fail status for each check.

---

#### `cloudfront` - CloudFront Management (SST Projects)
Audit and clean up CloudFront distributions.

**Subcommands:**
- `audit` - List all CloudFront distributions with status
- `cleanup --dry-run` - Preview orphaned distributions that would be deleted
- `cleanup` - Delete orphaned distributions (safe, validates against Route53 DNS)

**Safety Features:**
- ✅ Cross-references with Route53 DNS records
- ✅ Validates against deployment configuration
- ✅ Only deletes truly orphaned distributions
- ✅ Never touches active deployments

**Usage:**
```bash
# Audit all distributions
npx @duersjefen/deploy-kit cloudfront audit

# Preview cleanup (safe)
npx @duersjefen/deploy-kit cloudfront cleanup --dry-run

# Execute cleanup
npx @duersjefen/deploy-kit cloudfront cleanup
```

**Configuration:** Add Route53 hosted zones to `.deploy-config.json`:
```json
{
  "hostedZones": [
    {
      "domain": "example.com",
      "zoneId": "Z05724053AS52UG7NV3YZ"
    }
  ]
}
```

## Deployment Process

### Stage 1: Pre-Deployment Checks
- ✅ Git status clean
- ✅ AWS credentials valid
- ✅ Tests passing (if configured)

### Stage 2: Build & Prepare
- ✅ Build application
- ✅ Verify source structure

### Stage 3: Deploy
- ✅ Deploy via SST or custom script
- ✅ Wait for initialization

### Stage 4: Post-Deployment Validation
- ✅ Health checks
- ✅ CloudFront OAC validation
- ✅ Database connectivity (if configured)

### Stage 5: Cache Invalidation (Background)
- ✅ Clear CloudFront cache
- ✅ Allow global propagation

## Locking System

### Dual-Lock Design

**Lock 1: File-based lock** (`.deployment-lock-{stage}`)
- Prevents concurrent human-triggered deployments
- Auto-expires after 2 hours
- Created at start, released at end

**Lock 2: Pulumi state lock**
- Detects infrastructure state locks
- Auto-cleared at deployment start
- Prevents state corruption

### Recovery

If a deployment fails and locks remain:

```bash
# Check what's preventing deployment
make deployment-status

# Clear locks and retry
make recover-staging
make recover-production
```

## Advanced Usage

### Custom Deployment Script

For non-SST projects, provide a custom deploy script:

```json
{
  "customDeployScript": "./scripts/deploy.sh"
}
```

Script receives stage as argument:

```bash
#!/bin/bash
STAGE=$1
echo "Deploying to $STAGE..."
docker-compose up -d
```

### Lifecycle Hooks

Run commands at specific points:

```json
{
  "hooks": {
    "preDeploy": "npm test",
    "postBuild": "npm run build",
    "postDeploy": "npm run verify",
    "onError": "npm run rollback"
  }
}
```

### Per-Stage Health Checks

Different checks for different stages:

```json
{
  "stageConfig": {
    "staging": {
      "skipHealthChecks": false
    },
    "production": {
      "skipHealthChecks": false
    }
  },
  "healthChecks": [
    {
      "url": "/api/health",
      "name": "Health check"
    }
  ]
}
```

## Troubleshooting

### Deployment Blocked by Lock

```bash
# Check status
make deployment-status

# If lock is stale (>2 hours):
make recover-staging
```

### Health Checks Failing

- Check domain in `.deploy-config.json`
- Verify endpoints are accessible
- CloudFront takes 5-15 minutes to fully propagate
- Check logs: `npm run logs:staging`

### CloudFront OAC Validation

If you see 403 errors:
1. Verify S3 bucket policy allows CloudFront
2. Check Origin Access Control is configured
3. Run: `npx @duersjefen/deploy-kit health staging`

## Roadmap & Future Improvements

### Planned Features (High Impact)

1. **Plugin Architecture** - Support multiple deployment platforms
   - Currently: SST/Next.js only
   - Plan: Vercel, Netlify, Docker/ECS, Kubernetes, Lambda, Heroku plugins

2. **Advanced Rollback Strategies** - Beyond full revert
   - Instant rollback (code revert)
   - Blue-green deployments
   - Canary deployments (gradual rollout 5% → 10% → 100%)
   - Feature flag toggles
   - Database migration rollback

3. **Deployment Notifications** - Team visibility
   - Slack, Discord, email, webhooks
   - Custom message templates
   - Deployment timeline in notifications
   - Mention @oncall on failures

4. **Audit Logging & History** - Full accountability
   - Persistent deployment records (S3/DynamoDB)
   - Who deployed what, when, and why
   - Git diff integration
   - Compare deployments: `npx deploy-kit compare staging@v1 staging@v2`
   - Query history: `npx deploy-kit history --author --since "2 weeks ago"`

5. **Config Validation & Schema** - Prevent typos
   - JSON Schema validation
   - Helpful error messages with suggestions
   - Check for command existence in hooks
   - Validate AWS profile, domains, stages

6. **Multi-Project Support** - Manage many projects
   - Workspace management: `npx deploy-kit init-workspace`
   - Deploy multiple projects: `npx deploy-kit deploy --all`
   - Health check across portfolio: `npx deploy-kit status --all`
   - Shared configuration templates

7. **Cost Estimation & Monitoring** - Budget control
   - Estimate infrastructure cost before deploy
   - Compare current vs. new costs
   - Alert on cost threshold exceeded
   - Track cost trends over time

8. **Advanced Health Checks** - Beyond HTTP status
   - Custom smoke tests
   - Performance thresholds (alert if >2s response time)
   - Database query validation
   - Authentication/authorization checks
   - Cache hit rate verification

9. **Security Scanning** - Prevent vulnerabilities
   - Dependency vulnerability scan (npm audit)
   - Hardcoded secret detection
   - SAST code analysis
   - License compliance check
   - Block deploy on critical findings

10. **Environment Templates** - Faster project setup
    - Pre-built configs: `npx deploy-kit init --template nextjs-sst`
    - Templates for: Remix/Vercel, FastAPI/ECS, Django/Heroku, static/Netlify
    - Includes hooks, health checks, monitoring defaults

11. **Deployment Diff & Preview** - See what will change
    - Code diff (files, lines added/removed)
    - Infrastructure diff (new/removed resources)
    - Database migration preview
    - Cost impact estimate
    - Estimated deployment time

12. **Enhanced Pre/Post Hooks** - Full customization
    - Database migrations (`before_deployment`)
    - Cache warming (`after_deployment`)
    - Smoke tests (`post_deployment`)
    - Custom cleanup (`on_failure`)
    - Rollback triggers

### Architecture Enhancements

- **Plugin system** for deployment engines
- **Event-driven** hook system with error handling
- **Persistent storage** for deployment history
- **Distributed tracing** for deployment steps
- **Rate limiting** for multi-project deployments

## Version History

### 1.4.0 (2024-11-01)
- ✨ **Dev Command with Pre-Flight Checks**
  - Wraps `sst dev` with automatic validation
  - 8 pre-flight checks: AWS, locks, ports, config, .sst, recursive scripts, canary features, Pulumi Outputs
  - Detects "Partition 1 is not valid" error from incorrect Pulumi Output usage
  - Detects recursive SST dev scripts (infinite recursion)
  - Detects Next.js canary-only features in stable versions
  - Hybrid auto-fix: Safe fixes auto-apply, risky fixes require manual intervention
  - Auto-unlocks SST if locked
  - Error translation layer for common SST errors
  - Flags: `--skip-checks`, `--port=<number>`, `--verbose`
- 🔧 **AWS Profile Auto-Detection**
  - Auto-detects AWS profile from `sst.config.ts` for SST projects
  - Eliminates duplication between SST config and deploy config
  - Priority: explicit config > auto-detected > default
  - Enhanced init wizard with profile detection
- ✅ **Configuration Validation Command**
  - `deploy-kit validate` checks config syntax and structure
  - Validates required fields, domains, health checks
  - AWS profile existence verification
- 🏥 **Pre-Deployment Health Check Command**
  - `deploy-kit doctor` runs comprehensive diagnostic checks
  - Verifies git, AWS, SST, Node.js, tests
  - Shows profile source (explicit vs auto-detected)
- 🎯 **Partial Init Flags**
  - `--config-only`: Only create config file
  - `--scripts-only`: Only update npm scripts
  - `--makefile-only`: Only create Makefile
  - Flexible setup for existing projects
- 📚 **Documentation Consolidation**
  - Single comprehensive README for AI agent accessibility
  - Removed outdated planning and development docs
  - Complete command reference with examples

### 1.3.0 (2024-10-31)
- ✨ **Interactive Init Wizard**
  - One-command project setup: `npx deploy-kit init`
  - Beautiful terminal UI with prompts
  - Auto-generates `.deploy-config.json`
  - Auto-creates `Makefile` with deploy targets
  - Auto-adds npm scripts for convenient deployment
  - Validation of project names, domains, and AWS profiles
  - Smart defaults and auto-population of related fields
- 🎯 **Faster Onboarding**
  - Eliminates 5 manual setup steps
  - Reduces setup time from 10+ minutes to < 2 minutes
  - Sensible defaults work for most projects
  - Optional customization for advanced users

### 1.2.0 (2024-10-30)
- ✨ Sophisticated Terminal UI
  - Professional formatting with visual borders and separators
  - Progress tracking across deployment stages
  - Deployment timeline with visual bar charts showing stage timing
  - Enhanced pre-deployment check summary with status indicators
- 🤖 Intelligent Error Recovery
  - Pattern-based error matching for common deployment issues
  - Specific recovery steps for each error type (ACM, git, AWS creds, tests, CloudFront, etc.)
  - Actionable guidance for error resolution
- 📋 Professional CLI Experience
  - Enhanced help messages with detailed command descriptions
  - Visual feature list and documentation links
  - Better validation and user feedback
- 🎯 Enhanced Pre-Deployment Checks
  - Detailed check summary with success/warning/failed status
  - Timing information for each check
  - Better error messages and recovery suggestions

### 1.1.0 (2024-10-30)
- ✨ Automated SSL certificate manager
  - Automatic certificate creation for ACM
  - DNS validation with Route 53 integration
  - Auto-injection of certificate ARN into sst.config.ts
  - Interactive setup wizard
  - Fixes "certificate in use" blocker

### 1.0.0 (2024-10-29)
- Initial release
- SST + Next.js support
- EC2 + Docker variant support
- Dual-lock system
- Health check framework
- CloudFront validation

## License

MIT

## Support

For issues or questions:
- Check `.deploy-config.json` syntax
- Review health check endpoints
- Run `make deployment-status` to diagnose
- Check deployment logs in CloudWatch
