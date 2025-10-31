# Deploy-Kit v1.4.0: Infrastructure Validation & CloudFront Management

**Target Release:** Today (October 31, 2025)
**Scope:** CloudFront audit, orphan detection, infrastructure validation
**Motivation:** Prevent CloudFront distribution proliferation going forward

---

## Vision

Transform deploy-kit from **"deployment orchestration only"** to **"deployment orchestration + infrastructure validation"**.

This means deploy-kit becomes the source of truth for infrastructure health:
```
Before v1.4.0:
  make deploy-staging
  ├─ Deploys code
  ├─ Verifies endpoints work
  └─ Done ✓

  [Orphaned distributions exist but deploy-kit doesn't know/care]

After v1.4.0:
  make deploy-staging
  ├─ Deploys code
  ├─ Verifies endpoints work
  ├─ Validates CloudFront configuration
  ├─ Detects orphaned distributions
  ├─ Reports on infrastructure health
  └─ Done ✓

  [Orphaned distributions are detected and reported]
```

---

## Features for v1.4.0

### 1. CloudFront Audit Command

**Command:**
```bash
npx @duersjefen/deploy-kit cloudfront audit
```

**What it does:**
- List all CloudFront distributions in AWS account
- Compare against `.deploy-config.json` (expected distributions)
- Identify:
  - ✅ Expected distributions (staging, production)
  - ⚠️ Orphaned distributions (not in config)
  - 🔴 Misconfigured distributions (placeholder origins)
  - ⚠️ State mismatches (Pulumi vs AWS vs DNS)

**Output:**
```
╔════════════════════════════════════════════════════════════╗
║         CloudFront Infrastructure Audit Report             ║
╚════════════════════════════════════════════════════════════╝

📊 DISTRIBUTION COUNT
  Expected:  2 (staging, production)
  Actual:    9 (includes 7 orphans)
  Status:    ❌ MISMATCH

─────────────────────────────────────────────────────────────

✅ CONFIGURED DISTRIBUTIONS (2)

  [1] Staging
      ID:           E2YTVXOOI4UCD0
      Domain:       d2bw0mzubjnx0r.cloudfront.net
      DNS:          staging.gabs-massage.de ✓
      Origin:       ⚠️  placeholder.sst.dev (should be S3)
      Status:       Deployed
      Created:      2025-10-29 11:08:23 UTC

  [2] Production
      ID:           E1WV2QKTIREJTN
      Domain:       d3kzkcgxcgz1zz.cloudfront.net
      DNS:          gabs-massage.de ✓
      Origin:       ⚠️  placeholder.sst.dev (should be S3)
      Status:       Deployed
      Created:      2025-10-27 20:28:10 UTC

─────────────────────────────────────────────────────────────

🔴 ORPHANED DISTRIBUTIONS (7)

  [1] E2RXFOKZW4Q720 (d3skb2im10pak6.cloudfront.net)
      Created: 2025-10-27 19:20:37 UTC
      Origin:  placeholder.sst.dev
      DNS:     NOT FOUND (orphaned)
      Action:  DELETE

  [2] E8G5HTSXSA7DU (d1k9cxio240ao.cloudfront.net)
      Created: 2025-10-27 19:20:35 UTC
      Origin:  placeholder.sst.dev
      DNS:     NOT FOUND (orphaned)
      Action:  DELETE

  ... (5 more)

─────────────────────────────────────────────────────────────

⚠️  ISSUES DETECTED

1. Placeholder Origins (2)
   Staging and production use placeholder.sst.dev instead of S3.
   Recommendation: Redeploy with fresh SST configuration.

   Fix: make deploy-staging && make deploy-production

2. Orphaned Distributions (7)
   These distributions are not referenced in DNS or config.
   They consume AWS resources and should be deleted.

   Fix: npx deploy-kit cloudfront cleanup --stage=production

3. State Mismatch
   Pulumi state doesn't match AWS resources.
   Recommendation: Run cleanup to sync state.

─────────────────────────────────────────────────────────────

📋 RECOMMENDATIONS

1. Run: npx deploy-kit cloudfront cleanup
   └─ Deletes 7 orphaned distributions

2. Run: make deploy-staging
   └─ Creates fresh staging distribution (fixes placeholder origin)

3. Run: make deploy-production
   └─ Creates fresh production distribution (fixes placeholder origin)

4. Run: npx deploy-kit cloudfront audit
   └─ Verify all issues resolved

═════════════════════════════════════════════════════════════
```

### 2. CloudFront Cleanup Command

**Command:**
```bash
npx @duersjefen/deploy-kit cloudfront cleanup [--dry-run] [--force]
```

**What it does:**
- Identifies orphaned distributions
- Optionally performs dry-run (shows what would be deleted)
- Disables each distribution
- Waits for deployment
- Deletes each distribution
- Reports on cleanup

**Output:**
```
🧹 CloudFront Cleanup
────────────────────

Scanning for orphaned distributions...
  Found: 7 orphaned distributions

Dry-run mode: enabled
  This shows what WOULD be deleted, without making changes.

─────────────────────────────────────────────────────────────

WOULD DELETE:

  [1] E2RXFOKZW4Q720
      Domain:  d3skb2im10pak6.cloudfront.net
      Created: 2025-10-27 19:20:37 UTC
      Step 1:  Disable distribution
      Step 2:  Wait for deployment (5-15 min)
      Step 3:  Delete distribution

  [2] E8G5HTSXSA7DU
      Domain:  d1k9cxio240ao.cloudfront.net
      Created: 2025-10-27 19:20:35 UTC
      Step 1:  Disable distribution
      Step 2:  Wait for deployment (5-15 min)
      Step 3:  Delete distribution

  ... (5 more)

─────────────────────────────────────────────────────────────

To proceed with actual deletion, run:
  npx deploy-kit cloudfront cleanup --force

Estimated time: 45-75 minutes (includes CloudFront propagation waits)
```

### 3. Infrastructure Validation (Post-Deploy)

Automatically run after `make deploy-staging` and `make deploy-production`:

**Before:**
```
✅ Deployment succeeded
```

**After v1.4.0:**
```
✅ Deployment succeeded

🔍 Infrastructure Validation
  ├─ CloudFront origin: placeholder.sst.dev ⚠️
  │  Expected: gabs-massage-staging-gabsmassagesiteassetsbucket-ncorxnwx.s3.eu-north-1.amazonaws.com
  │  Status: MISCONFIGURED
  │
  │  This is expected after redeploy. Origins will be fixed on next
  │  deployment cycle when SST completes full configuration.
  │
  ├─ CloudFront status: Deployed ✓
  ├─ DNS resolution: staging.gabs-massage.de ✓
  ├─ HTTP response: 200 OK ✓
  └─ Orphaned distributions: 0 ✓
```

### 4. Post-Deployment CloudFront Report

After every deployment, generate summary:

```
📊 CloudFront Health Report (Post-Deployment)

Staging (E2YTVXOOI4UCD0):
  Origin:    placeholder.sst.dev ⚠️  (normal after redeploy)
  DNS:       staging.gabs-massage.de ✓
  Health:    OK
  Status:    Deployed

Production (E1WV2QKTIREJTN):
  Origin:    placeholder.sst.dev ⚠️  (normal after redeploy)
  DNS:       gabs-massage.de ✓
  Health:    OK
  Status:    Deployed

Orphaned:  0 distributions (clean) ✓
```

---

## Implementation Details

### Architecture

```
deploy-kit/
  src/
    cli/
      commands/
        cloudfront.ts          ← NEW
        ├─ audit()             ← List and analyze distributions
        ├─ cleanup()           ← Delete orphaned distributions
        └─ report()            ← Generate infrastructure report
    lib/
      cloudfront/             ← NEW
      ├─ client.ts            ← AWS CloudFront API wrapper
      ├─ analyzer.ts          ← Detect orphans, misconfigs
      ├─ cleanup.ts           ← Disable and delete distributions
      └─ report.ts            ← Format reports

      dns/                     ← NEW
      ├─ resolver.ts          ← Resolve DNS aliases
      └─ matcher.ts           ← Match distributions to DNS records
```

### Key Algorithms

**Orphan Detection:**
```typescript
// A distribution is orphaned if:
// 1. Not in .deploy-config.json
// 2. Not in DNS records (no alias pointing to it)
// 3. Created > 1 hour ago (not actively deploying)
// 4. Has placeholder.sst.dev origin (incomplete)

function isOrphaned(distribution, config, dnsRecords): boolean {
  const inConfig = config.stageConfig[distribution.id];
  const inDns = dnsRecords.some(r =>
    r.AliasTarget.DNSName === distribution.DomainName
  );
  const isStale = Date.now() - distribution.CreatedTime > 3600000;
  const hasPlaceholder = distribution.Origins[0].DomainName
    .includes('placeholder.sst.dev');

  return !inConfig && !inDns && isStale && hasPlaceholder;
}
```

**Misconfiguration Detection:**
```typescript
// A distribution is misconfigured if:
// 1. Has placeholder.sst.dev origin (incomplete)
// 2. Expected origin is S3 bucket (from config)

function isMisconfigured(distribution, config): boolean {
  const hasPlaceholder = distribution.Origins[0].DomainName
    .includes('placeholder.sst.dev');
  const expectedOriginIsS3 = config.infrastructure === 'sst-serverless';

  return hasPlaceholder && expectedOriginIsS3;
}
```

### CLI Commands

**New command structure:**
```bash
npx deploy-kit cloudfront audit
npx deploy-kit cloudfront cleanup [--dry-run] [--force]
npx deploy-kit cloudfront report
npx deploy-kit infrastructure validate
```

**Integration with existing commands:**
```bash
make deploy-staging
  ├─ Runs: npx sst deploy --stage staging
  ├─ Runs: npx deploy-kit cloudfront validate (post-deploy)
  └─ Shows: CloudFront health report

make cloudfront-audit
  └─ Runs: npx deploy-kit cloudfront audit

make cloudfront-cleanup
  └─ Runs: npx deploy-kit cloudfront cleanup --force
```

---

## Implementation Steps

### Step 1: Create CloudFront Client Library
- AWS SDK wrapper for CloudFront operations
- DNS resolver for matching distributions to domains
- Pagination handling for listing distributions

### Step 2: Implement Analysis Engine
- Orphan detection algorithm
- Misconfiguration detection
- State comparison (Pulumi vs AWS vs DNS)

### Step 3: Create CLI Commands
- `cloudfront audit` - Report on infrastructure
- `cloudfront cleanup` - Delete orphaned distributions
- `cloudfront report` - Generate summary

### Step 4: Integrate with Deployment Process
- Add post-deployment validation
- Add CloudFront health checks
- Add reporting to deployment output

### Step 5: Test on Gabs-Massage Project
- Run `cloudfront audit` - see 7 orphans detected
- Run `cloudfront cleanup --dry-run` - see what would be deleted
- Run `cloudfront cleanup --force` - actually delete orphans
- Verify all reports work correctly

### Step 6: Update Makefile
- Add `make cloudfront-audit` target
- Add `make cloudfront-cleanup` target
- Add post-deploy CloudFront validation

### Step 7: Publish v1.4.0
- Update version in package.json
- Update README with new commands
- Publish to npm

### Step 8: Use on Gabs-Massage
- Run full redeploy with new v1.4.0
- Clean up all infrastructure
- Verify everything works

---

## Success Criteria

✅ **Detection:**
- Audit command correctly identifies 7 orphaned distributions
- Correctly identifies placeholder origin misconfiguration
- Generates clear, actionable reports

✅ **Cleanup:**
- Cleanup command safely disables and deletes orphans
- Dry-run mode shows what would be deleted
- Cleanup takes ~45-75 minutes (acceptable for one-time operation)

✅ **Prevention:**
- Post-deployment validation detects misconfiguration
- Clear warnings if infrastructure is incomplete
- Integration with deploy-kit prevents user confusion

✅ **Documentation:**
- Commands have clear help text
- Reports explain what's wrong and how to fix it
- Makefile targets are well-documented

---

## Timeline

- **Implementation:** 90 minutes
  - CloudFront client: 20 min
  - Analysis engine: 20 min
  - CLI commands: 30 min
  - Integration: 20 min

- **Testing:** 30 minutes
  - Test on gabs-massage
  - Verify all commands work
  - Check output formatting

- **Publishing:** 10 minutes
  - Bump version
  - Update docs
  - Publish to npm

- **Full Redeploy:** 60 minutes (parallel with above)
  - Run cleanup
  - Deploy staging
  - Deploy production
  - Verify everything works

**Total:** ~2.5-3 hours, mostly waiting on AWS operations

---

## Why This Matters

This transforms deploy-kit from a "deployment tool" to a "deployment AND infrastructure management tool":

**Before v1.4.0:**
- Deploy code: ✅ Works
- Infrastructure visibility: ❌ Blind
- Orphan prevention: ❌ No
- Orphan detection: ❌ No

**After v1.4.0:**
- Deploy code: ✅ Works
- Infrastructure visibility: ✅ Full
- Orphan prevention: ✅ Yes (post-deploy validation)
- Orphan detection: ✅ Yes (audit command)
- Orphan cleanup: ✅ Yes (cleanup command)

This is what a professional deployment system looks like.

---

**Status:** Ready to implement
**Estimated completion:** Today (Oct 31, 2025)
**Impact:** v1.4.0 becomes the definitive tool for gabs-massage infrastructure management
