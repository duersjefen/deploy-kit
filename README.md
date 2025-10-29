# @duersjefen/deploy-kit

Reusable deployment system for SST + Next.js + DynamoDB applications with comprehensive safety checks and CloudFront validation.

## Features

- ✅ **Safe-by-default:** 5-stage deployment process with automatic rollback
- ✅ **Dual-lock system:** Prevents concurrent deployments (human + infrastructure)
- ✅ **Health checks:** Automatic validation after deployment
- ✅ **CloudFront validation:** Ensures Origin Access Control is configured correctly
- ✅ **Configurable:** Works with SST, custom deploys, EC2/Docker
- ✅ **Zero setup:** Just add `.deploy-config.json` to your project

## Installation

```bash
npm install --save-dev @duersjefen/deploy-kit
```

## Quick Start

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

## Version History

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
