# Deploy-Kit: Production-Grade Deployment System

## Features Restored (October 2025)

Deploy-kit has been restored to be **even better** than the original system used in gabs-massage. All ~3000+ lines of battle-tested production code have been extracted, refactored, and integrated.

### 🎯 Core Capabilities

#### 1. Database Backup Management
**Module:** `src/backup/manager.ts`

- **Export DynamoDB Tables:** Automatic snapshots to S3 before each deployment
- **Versioning:** Timestamped backups with automatic history management
- **Restore Capability:** Recover to any previous backup state
- **Wait Logic:** Handles long-running exports (up to 30 minutes)
- **Per-Stage Buckets:** Different S3 buckets for different deployment stages

```typescript
const backupManager = getBackupManager(config, projectRoot);
const backupPath = await backupManager.backup('staging');
await backupManager.restore('staging', backupPath);
const backups = await backupManager.listBackups('staging');
```

#### 2. Comprehensive Health Checks
**Module:** `src/health/checker.ts`

- **HTTP Endpoint Validation:** Status codes, response times, content search
- **Database Connectivity:** DynamoDB table health, connection validation
- **CloudFront Origin Validation:** Detects misconfigured origins
- **Origin Access Control:** Validates S3 security configuration
- **Timeout Handling:** Automatic retries with configurable timeouts

```typescript
const healthChecker = getHealthChecker(config);
await healthChecker.checkDatabase('production');
await healthChecker.checkCloudFrontOrigin('staging');
await healthChecker.checkOriginAccessControl('staging');
```

#### 3. Progress Monitoring
**Module:** `src/monitoring/progress.ts`

- **Stage Tracking:** Monitor deployment stages in real-time
- **Progress Bars:** Visual indication of deployment progress
- **Timing Information:** Duration for each stage
- **Summary Reports:** Deployment completion summary with metrics

```typescript
const monitor = getProgressMonitor();
monitor.registerStage(1, 'Pre-deployment checks');
monitor.registerStage(2, 'Safety checks');
monitor.displayProgressBar();
monitor.displaySummary(success);
```

#### 4. Deployment Status Checking
**Module:** `src/status/checker.ts`

- **Multi-Stage Status:** Check all deployment stages at once
- **Lock Detection:** Identify active and stale locks
- **CloudFront Status:** Distribution state and readiness
- **Database Health:** DynamoDB connectivity validation
- **Domain Accessibility:** Verify site is reachable
- **Global Issue Detection:** AWS credentials, package availability

```typescript
const statusChecker = getStatusChecker(config, projectRoot);
await statusChecker.checkAllStages();
await statusChecker.checkStage('production');
```

#### 5. Deployment Recovery
**Module:** `src/recovery/manager.ts`

- **Orphaned Resource Detection:** Find and report stray CloudFront distributions
- **Incomplete Deployment Cleanup:** Resume or clean up failed deployments
- **Pulumi State Locking:** Detect and clear stuck state locks
- **Full Recovery Procedure:** Automated recovery workflow

```typescript
const recovery = getRecoveryManager(config);
await recovery.detectOrphanedDistributions();
await recovery.cleanupIncompleteDeployment('staging');
await recovery.unlockPulumiState('production');
```

#### 6. Enhanced Cache Invalidation
**Part of:** `src/deployer.ts`

- **Dynamic Distribution Lookup:** Find CloudFront by domain (not env vars)
- **Automatic Wait Logic:** Waits for invalidation completion (up to 5 min)
- **OAC Security Validation:** Ensures S3 bucket is properly secured
- **Graceful Degradation:** Continues if CloudFront not yet ready

Features previously relying on hardcoded env variables now use AWS API queries.

#### 7. Integrated Backup Strategy
**Part of:** `src/deployer.ts` (Stage 2.5)

- Automatic database backup BEFORE deployment
- Captured backup path in deployment results
- Non-blocking if backup fails (continues deployment)
- Rollback information available for recovery

### 📊 Deployment Stages (Extended)

```
Stage 1: Pre-deployment checks
  ├─ Verify locks are clear
  └─ Auto-clean Pulumi state if needed

Stage 2: Safety checks
  ├─ Git status validation
  ├─ Test execution
  └─ Credentials verification

Stage 2.5: Database backup ⭐ NEW
  ├─ DynamoDB export to S3
  ├─ Timestamped versioning
  └─ Graceful failure handling

Stage 3: Build & Deploy
  ├─ Substitutes {stage} placeholder in build hooks
  ├─ Passes AWS_PROFILE env var to hooks
  └─ SST deployment execution

Stage 4: Post-deployment validation
  ├─ Database connectivity check
  ├─ CloudFront origin validation
  ├─ OAC security verification
  └─ HTTP endpoint health checks

Stage 5: Cache invalidation & security validation
  ├─ Dynamic distribution lookup
  ├─ Cache invalidation with retries
  ├─ OAC confirmation
  └─ Global CDN propagation monitoring
```

### 🔧 Configuration

Add to `.deploy-config.json`:

```json
{
  "projectName": "gabs-massage",
  "database": "dynamodb",
  "hooks": {
    "postBuild": "sst shell --stage {stage} -- npm run build"
  },
  "stageConfig": {
    "staging": {
      "domain": "staging.gabs-massage.de",
      "awsRegion": "eu-north-1",
      "dynamoTableName": "GabsMassageData",
      "sstStageName": "staging"
    }
  },
  "backupBucket": "gabs-massage-backups"
}
```

### 🚀 Usage Examples

#### Deploy with all safety checks
```bash
const kit = new DeploymentKit(config);
const result = await kit.deploy('staging');
console.log(result.message);
// ✅ Deployment to staging successful!
```

#### Check deployment status
```bash
const kit = new DeploymentKit(config);
await kit.getStatus('staging');
```

#### Recover from failed deployment
```bash
const kit = new DeploymentKit(config);
await kit.recover('staging');
```

#### Access individual features
```typescript
import {
  getBackupManager,
  getHealthChecker,
  getStatusChecker,
  getRecoveryManager,
} from '@duersjefen/deploy-kit';

const backup = getBackupManager(config, projectRoot);
const health = getHealthChecker(config);
const status = getStatusChecker(config, projectRoot);
const recovery = getRecoveryManager(config);
```

### 📈 Improvements Over Original System

| Feature | Original | Improved |
|---------|----------|----------|
| Cache Invalidation | Env var lookup | Dynamic AWS API lookup |
| Invalidation Wait | No timeout | 5 min with retries |
| Health Checks | Basic | Comprehensive (DB, CF, OAC, endpoints) |
| Progress Display | None | Real-time progress bars |
| Status Checking | Single stage | All stages + locks + timing |
| Recovery | Manual | Automated detection & cleanup |
| Backup Restoration | N/A | Full restore capability |
| OAC Validation | Post-deploy | During and after deployment |
| Database Checks | N/A | Automatic connectivity validation |

### 🔒 Safety Features

- ✅ Database backup BEFORE deployment
- ✅ Non-blocking backup (continues if fails)
- ✅ Automatic lock detection and cleanup
- ✅ Duplicate lock prevention (2-layer system)
- ✅ Stale lock auto-expiration (2 hours)
- ✅ Origin Access Control validation
- ✅ Comprehensive error messages
- ✅ Graceful degradation (warn instead of block)
- ✅ CloudFront propagation monitoring

### 📝 Version History

- **1.0.0** (Oct 2025): Complete feature restoration
  - Added database backup manager
  - Added comprehensive health checks
  - Added progress monitoring
  - Added deployment status checking
  - Added recovery management
  - Enhanced cache invalidation
  - Dynamic distribution lookup
  - OAC security validation

### 🤝 Contributing

Deploy-kit is extracted from battle-tested production code. To add features:

1. Create module in appropriate directory (`src/[feature]/`)
2. Use factory pattern: `get[Feature]Manager(config, projectRoot)`
3. Export from main index
4. Add type definitions to `src/types.ts`
5. Document in this README

### 📞 Support

For issues or feature requests, refer to the original gabs-massage implementation or the restoration notes.
