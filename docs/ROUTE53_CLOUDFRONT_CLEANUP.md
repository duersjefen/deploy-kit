# Route53 DNS Validation for CloudFront Cleanup

## Overview

The deploy-kit CloudFront cleanup now uses Route53 DNS lookups to accurately identify truly orphaned CloudFront distributions. This enables confident, automatic deletion of unused distributions without risking active services.

## How It Works

### Detection Process

When you run `npx deploy-kit cloudfront cleanup --dry-run`, the system:

1. **Fetches CloudFront distributions** - Lists all distributions in your AWS account
2. **Queries Route53 DNS records** - Retrieves CNAME/ALIAS records from configured hosted zones
3. **Cross-references** - Compares each distribution against:
   - Deployment configuration (.deploy-config.json)
   - Active Route53 DNS records
   - CloudFront metadata (origin, status, creation time)
4. **Identifies orphans** - Marks as safe-to-delete only if:
   - ✅ NOT in deployment config
   - ✅ NOT referenced in any Route53 DNS record
   - ✅ NOT used by current stage deployments

### Deletion Criteria

A distribution is marked as **safe to delete** if it meets ONE of:

1. **Placeholder origin** - Has `placeholder.sst.dev` origin (incomplete SST configuration from interrupted deployment)
2. **Truly orphaned** - Not in config AND not in DNS (verified through Route53 lookup)

## Configuration

### Setup in .deploy-config.json

Add your Route53 hosted zones:

```json
{
  "projectName": "my-project",
  "hostedZones": [
    {
      "domain": "example.com",
      "zoneId": "Z05724053AS52UG7NV3YZ"
    },
    {
      "domain": "staging.example.com",
      "zoneId": "Z1234567890ABC"
    }
  ],
  "stageConfig": { ... }
}
```

### Finding Your Hosted Zone ID

1. **AWS Console Method:**
   ```bash
   # Install aws-cli if needed
   brew install awscli

   # Configure credentials (one-time)
   aws configure

   # List your hosted zones
   aws route53 list-hosted-zones
   ```
   Look for your domain in the results. The ID format is: `Z05724053AS52UG7NV3YZ`

2. **With AWS Profile:**
   ```bash
   AWS_PROFILE=your-profile aws route53 list-hosted-zones-by-name \
     --query 'HostedZones[?Name==`example.com.`]'
   ```

3. **From gabs-massage (example):**
   ```bash
   AWS_PROFILE=gabs-massage aws route53 list-hosted-zones-by-name \
     --query 'HostedZones[?Name==`gabs-massage.de.`]'

   # Output:
   # {
   #   "Id": "/hostedzone/Z05724053AS52UG7NV3YZ",
   #   "Name": "gabs-massage.de.",
   #   ...
   # }
   ```

## Usage

### 1. Preview What Would Be Deleted (Safe)

```bash
npx deploy-kit cloudfront cleanup --dry-run
```

Output shows:
```
🧹 CloudFront Cleanup

Checking DNS records...

Found 4 orphaned distribution(s)

DRY RUN MODE - No changes will be made

DELETION PLAN

1. E2RXFOKZW4Q720
   Domain: d3skb2im10pak6.cloudfront.net
   Status: Verified orphaned (not in config or DNS)

2. E8G5HTSXSA7DU
   Domain: d1k9cxio240ao.cloudfront.net
   Status: Verified orphaned (not in config or DNS)

[... more distributions ...]

Total deletions: 4
Estimated time: 45-75 minutes (CloudFront global propagation)

To proceed with deletion, run:
  npx deploy-kit cloudfront cleanup --force
```

### 2. Actually Delete (Irreversible)

```bash
npx deploy-kit cloudfront cleanup --force
```

This will:
1. Disable each orphaned distribution (takes ~5 min per distribution)
2. Wait for CloudFront to process the change
3. Delete the distribution
4. Move to the next distribution

**Total time: 45-75 minutes** (includes CloudFront global propagation)

### 3. Check Health Anytime

```bash
npx deploy-kit cloudfront report
```

Shows current distribution status across all stages.

## Real-World Example (gabs-massage)

Configuration:
```json
{
  "mainDomain": "gabs-massage.de",
  "hostedZones": [
    {
      "domain": "gabs-massage.de",
      "zoneId": "Z05724053AS52UG7NV3YZ"
    }
  ],
  "stageConfig": {
    "staging": { "domain": "staging.gabs-massage.de" },
    "production": { "domain": "gabs-massage.de" }
  }
}
```

Route53 DNS records for gabs-massage.de:
- `gabs-massage.de` → ALIAS to E2CL8RLN7T0SGY.cloudfront.net
- `www.gabs-massage.de` → CNAME to E2CL8RLN7T0SGY.cloudfront.net
- `staging.gabs-massage.de` → CNAME to deployment staging distribution
- 8 other records (mail, API subdomains, etc.)

Cleanup finds 4 distributions NOT referenced in:
- `.deploy-config.json` (only staging + production configured)
- Route53 DNS records (11 records checked)

Result: **Safe to delete, removes $10/month CloudFront cost**

## Troubleshooting

### Cleanup says "No orphaned distributions found"

**Possible causes:**
1. All distributions are referenced in DNS
2. All distributions are in deployment config
3. Hosted zones not configured

**Solution:**
```bash
# Check audit for more details
npx deploy-kit cloudfront audit

# Verify hosted zones configured
cat .deploy-config.json | grep -A 5 "hostedZones"
```

### "Could not fetch DNS records for [domain]"

**Possible causes:**
1. Invalid Zone ID
2. AWS credentials don't have Route53 permissions
3. Hosted zone doesn't exist

**Solution:**
```bash
# Verify zone ID
AWS_PROFILE=your-profile aws route53 list-hosted-zones-by-name

# Check permissions
AWS_PROFILE=your-profile aws route53 list-resource-record-sets \
  --hosted-zone-id /hostedzone/Z05724053AS52UG7NV3YZ
```

### Want to delete a specific distribution?

Manual deletion via AWS Console:
1. Go to CloudFront console
2. Select distribution
3. Click "Disable"
4. Wait for deployment (status = Deployed)
5. Click "Delete"

## How This Saves Money

**Before (conservative cleanup):** "No orphaned distributions found"
- 7 unused distributions × $2.50/month = **$17.50/month extra cost**

**After (DNS-validated cleanup):** "Found 4 orphaned distributions"
- Deletes only verified orphans
- Saves **$10/month**
- Keeps 3 configured distributions (staging, prod, www redirect)

## Technical Details

### Why Route53 Lookup?

Without DNS validation:
- ❌ Can't distinguish "intentional but unused" from "truly orphaned"
- ❌ Risk deleting distributions that exist for disaster recovery
- ❌ Too conservative - most orphans never get deleted

With DNS validation:
- ✅ Only delete distributions verified not in use
- ✅ Safe, confident, automatic cleanup
- ✅ Prevents cost waste from stale deployments

### How DNS Records are Matched

For each Route53 DNS record:
```
If ALIAS to CloudFront:
  Compare AliasTarget.DNSName to distribution.DomainName

If CNAME to CloudFront:
  Compare ResourceRecords to distribution.DomainName
```

Only distributions found in this comparison are marked "in DNS".

### Stale Distribution Detection

Distributions marked as orphaned must also:
- Be >1 hour old (prevents false positives on fresh deployments)
- Have either placeholder origin OR confirmed not in DNS
- Not be configured in .deploy-config.json

## Integration with Deployment

CloudFront cleanup is automatically triggered during deployment:

```bash
make deploy-staging
# ↓
# Build & test
# ↓
# Deploy to AWS
# ↓
# Health checks
# ↓
# 🔍 Auditing CloudFront infrastructure...
# ⚠️ Orphaned CloudFront Distributions Detected
# Found 4 orphaned distribution(s)
# 💾 Estimated cost: ~$10.00/month
# [?] Would you like to cleanup these orphaned distributions?
```

If you accept, cleanup starts in background (doesn't block deployment completion).

## Related Commands

```bash
# Full audit report with all issues
npx deploy-kit cloudfront audit

# Cleanup preview (no changes)
npx deploy-kit cloudfront cleanup --dry-run

# Actually delete orphaned distributions
npx deploy-kit cloudfront cleanup --force

# Health status report
npx deploy-kit cloudfront report

# Run via Makefile (if configured)
make cloudfront-cleanup
make cloudfront-audit
make cloudfront-report
```

## Best Practices

1. **Always preview first**
   ```bash
   npx deploy-kit cloudfront cleanup --dry-run
   ```
   Review the list before running `--force`

2. **Check after deployment**
   If deployment creates new distributions, cleanup helps identify obsolete ones

3. **Schedule periodically**
   Add to monthly/quarterly routine to prevent accumulation of unused distributions

4. **Monitor DNS changes**
   If you add new CloudFront distributions, add corresponding DNS records before deploying

5. **Keep audit history**
   Save audit reports to track which distributions were removed and when

---

**Last Updated:** October 31, 2025
**Version:** deploy-kit 1.4.0+
**Status:** Production ready
