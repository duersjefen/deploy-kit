# Deploy-Kit: Comprehensive Deployment Enhancement Guide

## 🎯 Goal: Zero Failed Deployments

This guide documents the comprehensive deployment validation system designed to prevent all common SST deployment failures.

---

## 🔍 Research Findings (January 2025)

### Critical Issues Causing Deployment Failures

Based on extensive research of SST v3 (Ion) deployments and AWS best practices:

#### 1. **SST Silent Failures** (Most Critical)
- **Issue**: SST deploys successfully BUT silently skips domain configuration
- **Symptoms**:
  - No error messages from SST
  - CloudFront uses `placeholder.sst.dev` origin (dev mode)
  - ACM certificate not created
  - DNS records not created
  - Application completely broken

**Root Causes:**
1. Route53 zone missing when using `sst.aws.dns()`
2. Conflicting DNS records (old CNAME/A records)
3. Missing `override: true` when adding domain to existing CloudFront
4. Route53 zone created <5 minutes ago (timing/caching issue)

#### 2. **Certificate Validation Delays**
- ACM certificates for CloudFront MUST be in us-east-1
- Validation takes 5-30 minutes (DNS validation)
- Validation can get "stuck" and requires manual retry
- No error if validation fails - deployment succeeds but domain broken

#### 3. **DNS Propagation Gaps**
- Current system checks IF nameservers configured
- Does NOT verify domain actually resolves
- Does NOT check propagation to public DNS resolvers
- No validation of real-world accessibility

#### 4. **CloudFront CNAME Conflicts**
- AWS error: "CNAMEAlreadyExists"
- Old distributions keep CNAME even after deletion attempt
- Can block deployment entirely
- Requires manual cleanup via AWS Console

---

## 🛠️ New Validation Tools

### 1. DNS Resolution Validator (`dns-resolution-validator.ts`)

**Purpose**: Validates domain actually resolves across multiple public DNS resolvers

**Features**:
- Queries Google (8.8.8.8), Cloudflare (1.1.1.1), Quad9 (9.9.9.9), OpenDNS
- Checks consistency across resolvers
- Detects partial propagation (e.g., 2/4 resolvers have DNS)
- Retries with configurable intervals
- IPv4 and IPv6 support

**Usage**:
```typescript
import { validateDNSResolution } from './lib/dns-resolution-validator.js';

const result = await validateDNSResolution('staging.example.com', 6, 10000);

if (result.passed) {
  console.log('✅ DNS propagated to all public resolvers');
} else {
  console.log(`❌ ${result.message}`);
  // Result includes details on which resolvers failed
}
```

**When to Use**:
- **Post-deployment**: After SST completes, verify DNS actually works
- **Pre-deployment**: Check if old domain still resolving (conflict detection)

---

### 2. Certificate Validation Monitor (`certificate-validation-monitor.ts`)

**Purpose**: Monitors ACM certificate validation and waits for ISSUED status

**Features**:
- Finds certificate by domain (exact, wildcard, or base domain match)
- Polls certificate status every 30 seconds
- Waits up to 30 minutes (configurable)
- Shows validation progress (DNS records, status changes)
- Detects failed/timed out validation early

**Usage**:
```typescript
import { waitForCertificateValidation } from './lib/certificate-validation-monitor.js';

const result = await waitForCertificateValidation('staging.example.com', 'myprofile', 30);

if (result.passed) {
  console.log(`✅ Certificate issued after ${result.waitedMinutes} minutes`);
} else {
  console.log(`❌ Certificate ${result.status}: ${result.message}`);
}
```

**When to Use**:
- **Post-deployment**: After SST creates certificate, wait for validation
- **Pre-deployment** (optional): Check if certificate already exists and is valid

**Critical Details**:
- Certificates for CloudFront MUST be in us-east-1
- DNS validation is automatic but can fail silently
- First deployment takes 5-15 minutes typically
- Subsequent deployments use cached certificate (fast)

---

### 3. Domain Accessibility Tester (`domain-accessibility-tester.ts`)

**Purpose**: Tests real-world domain accessibility via HTTP/HTTPS

**Features**:
- Tests HTTPS (primary) and HTTP (should redirect)
- Detects SSL/TLS errors
- Measures response time
- Follows redirects
- Detects CloudFront propagation delays
- Retries with backoff

**Usage**:
```typescript
import { testDomainAccessibility } from './lib/domain-accessibility-tester.js';

const result = await testDomainAccessibility('staging.example.com', 6, 10000);

if (result.passed) {
  console.log('✅ Domain is accessible via HTTPS');
  console.log(`   Response time: ${result.httpsTest.responseTime}ms`);
} else {
  console.log(`❌ ${result.message}`);
}
```

**When to Use**:
- **Post-deployment**: Final validation that users can actually reach the site
- **Health checks**: Periodic monitoring of domain accessibility

---

### 4. Enhanced Post-Deploy Validator (`enhanced-post-deploy.ts`)

**Purpose**: Comprehensive post-deployment validation suite

**Orchestrates**:
1. DNS Resolution (3 checks across 4 public resolvers)
2. Certificate Validation (waits up to 5 minutes for ISSUED)
3. Domain Accessibility (HTTPS test with retries)

**Features**:
- Runs all validations in sequence
- Distinguishes failures vs warnings
- Provides actionable troubleshooting
- Summary report with clear pass/fail status

**Usage**:
```typescript
import { runEnhancedPostDeployValidation } from './safety/enhanced-post-deploy.js';

const result = await runEnhancedPostDeployValidation(config, stage, projectRoot);

if (result.passed) {
  console.log('✅ All validations passed');
} else {
  console.log(`❌ Failures: ${result.failures.join(', ')}`);
}
```

---

## 🔄 Integration with Existing Flow

### Current Deployment Flow

```
1. Pre-checks (git, AWS, tests, secrets)
   ├─ Route53 zone existence check ✅
   ├─ CloudFront CNAME conflict check ✅
   ├─ DNS conflicting records check ✅
   └─ Override requirement check ✅

2. Deploy via SST
   └─ Stream output in real-time

3. Post-checks (health, CloudFront, basic validation)
   ├─ ACM certificate exists? (basic)
   ├─ CloudFront alias configured? (basic)
   └─ Route53 DNS records exist? (basic)
```

### Enhanced Flow (Recommended)

```
1. Pre-checks (existing + new validations)
   ├─ All existing pre-checks ✅
   ├─ Domain format validation (NEW)
   └─ Nameserver reachability test (NEW)

2. Deploy via SST
   └─ Stream output + timeout monitoring

3. Enhanced Post-checks (NEW)
   ├─ Wait for ACM certificate validation (5-30 min) 🔥
   ├─ Validate DNS resolution (4 public resolvers) 🔥
   ├─ Test domain accessibility (HTTPS + SSL) 🔥
   └─ Comprehensive summary report 🔥

4. Health checks (existing)
   └─ Application-specific endpoints
```

**Key Additions**:
- 🔥 **Certificate Wait**: Don't proceed until certificate is ISSUED
- 🔥 **DNS Validation**: Verify domain resolves on public internet
- 🔥 **Real Accessibility Test**: Confirm users can actually access the site

---

## 📋 Usage Examples

### Example 1: Enhanced Deployment (Complete Flow)

```typescript
import { DeploymentKit } from '@duersjefen/deploy-kit';
import { runEnhancedPostDeployValidation } from './safety/enhanced-post-deploy.js';

const config = JSON.parse(fs.readFileSync('.deploy-config.json', 'utf-8'));
const kit = new DeploymentKit(config, process.cwd());

// Standard deployment
const result = await kit.deploy('staging');

if (result.success) {
  // Enhanced post-deployment validation
  const validation = await runEnhancedPostDeployValidation(
    config,
    'staging',
    process.cwd()
  );

  if (!validation.passed) {
    console.error('❌ Deployment succeeded but validation failed');
    console.error('Failures:', validation.failures);
    process.exit(1);
  }

  console.log('✅ Deployment and validation complete!');
}
```

### Example 2: Certificate-First Deployment

For critical production deployments, ensure certificate is valid BEFORE starting:

```typescript
import { checkCertificateStatus } from './lib/certificate-validation-monitor.js';

// Pre-deployment certificate check
const certStatus = await checkCertificateStatus('production.example.com', 'myprofile');

if (certStatus.exists && certStatus.status !== 'ISSUED') {
  console.warn('⚠️  Certificate exists but not issued');
  console.warn('   Deployment will wait for validation to complete');
}

// Deploy
await kit.deploy('production');

// Post-deployment: Wait for certificate if needed
const certResult = await waitForCertificateValidation(
  'production.example.com',
  'myprofile',
  30
);

if (!certResult.passed) {
  throw new Error('Certificate validation failed');
}
```

### Example 3: DNS-First Deployment

Ensure DNS is properly configured before deployment:

```typescript
import { validateDNSResolution } from './lib/dns-resolution-validator.js';

// Check if DNS from previous deployment is still active
const dnsCheck = await validateDNSResolution('staging.example.com', 1, 1000);

if (dnsCheck.passed) {
  console.log('✅ DNS already configured (existing deployment)');
} else {
  console.log('ℹ️  No DNS configured (first deployment)');
}

// Deploy
await kit.deploy('staging');

// Verify DNS propagated
const dnsResult = await validateDNSResolution('staging.example.com', 12, 10000);

if (!dnsResult.passed) {
  throw new Error('DNS propagation failed');
}
```

---

## 🚨 Common Failure Scenarios & Solutions

### Scenario 1: "Domain doesn't resolve after deployment"

**Symptoms**:
- `sst deploy` succeeded
- No error messages
- Domain doesn't resolve (NXDOMAIN)

**Cause**: SST deployed in dev mode (Route53 zone missing)

**Detection**:
```typescript
const dnsResult = await validateDNSResolution(domain);
// Result: passed=false, propagated=false
```

**Solution**:
1. Check Route53 zone exists (pre-deployment check does this)
2. Verify nameservers at domain registrar
3. Run `npx sst remove --stage {stage}`
4. Re-deploy

---

### Scenario 2: "Certificate not issued after 30 minutes"

**Symptoms**:
- ACM certificate status = `PENDING_VALIDATION`
- DNS validation records exist in Route53
- Domain accessible via CloudFront URL but not custom domain

**Cause**: DNS validation stuck (AWS issue)

**Detection**:
```typescript
const certResult = await waitForCertificateValidation(domain, profile, 30);
// Result: passed=false, status=PENDING_VALIDATION, waitedMinutes=30
```

**Solution**:
1. Delete certificate in ACM console
2. Run `npx sst remove --stage {stage}`
3. Re-deploy (SST will create new certificate)

---

### Scenario 3: "HTTPS not working (SSL error)"

**Symptoms**:
- Domain resolves correctly
- HTTP works
- HTTPS shows certificate error

**Cause**: Certificate not attached to CloudFront distribution

**Detection**:
```typescript
const accessResult = await testDomainAccessibility(domain);
// Result: passed=false, sslValid=false, error="certificate error"
```

**Solution**:
1. Check ACM certificate status (should be ISSUED)
2. Verify CloudFront distribution has certificate attached
3. Check CloudFront alternate domain names (CNAMEs)
4. May need to redeploy with `override: true`

---

### Scenario 4: "Inconsistent DNS responses"

**Symptoms**:
- Some resolvers return IPs, others don't
- Domain works sometimes, not others

**Cause**: Partial DNS propagation or conflicting records

**Detection**:
```typescript
const dnsResult = await validateDNSResolution(domain);
// Result: consistent=false, propagated=false
// resolvers: [
//   { name: 'Google', success: true, addresses: ['1.2.3.4'] },
//   { name: 'Cloudflare', success: false }
// ]
```

**Solution**:
1. Wait for full DNS propagation (can take 15-60 minutes)
2. Check for conflicting DNS records in Route53
3. Verify TTL settings (lower TTL = faster propagation)

---

## 🎯 Best Practices Summary

### ✅ Do This

1. **Always run enhanced post-deployment validation**
   - Don't trust "deployment succeeded" message
   - Verify DNS, certificate, and accessibility

2. **Wait for certificate validation on first deployment**
   - Budget 5-15 minutes for certificate issuance
   - Don't cancel deployment during certificate creation

3. **Verify DNS propagation before marking deployment complete**
   - Check multiple public resolvers
   - Ensure consistent responses

4. **Monitor CloudFront propagation**
   - Can take 5-15 minutes for changes to propagate
   - Use accessibility tester with retries

5. **Keep deployment logs**
   - Critical for debugging silent failures
   - Include validation results

### ❌ Don't Do This

1. **Don't skip pre-deployment checks**
   - Route53 zone must exist
   - DNS conflicts must be resolved
   - CloudFront CNAMEs must be available

2. **Don't assume deployment success without validation**
   - SST can succeed but skip domain setup
   - Always verify actual functionality

3. **Don't deploy to production without testing in staging first**
   - Certificate validation on first deploy takes time
   - DNS issues are easier to debug in staging

4. **Don't ignore warnings about route53 zone age**
   - Wait 5+ minutes after zone creation
   - SST caching can cause issues with new zones

---

## 📊 Validation Timeline

Typical deployment timeline with enhanced validation:

```
0:00  ──► Pre-checks start (1-2 min)
0:02  ──► SST deployment starts
0:05  ──► SST deployment complete
0:05  ──► Enhanced validation starts
       ├─ DNS resolution check (10-60 sec)
       ├─ Certificate validation (0-30 min) ⚠️  Can be slow on first deploy
       └─ Accessibility test (10-60 sec)
0:06  ──► Validation complete (fast path - existing cert)
0:35  ──► Validation complete (slow path - new cert)
```

**First deployment**: 5-35 minutes (includes certificate validation)
**Subsequent deployments**: 5-7 minutes (certificate already exists)

---

## 🔧 Configuration Recommendations

### Recommended deploy.config.json

```json
{
  "projectName": "my-app",
  "infrastructure": "sst-serverless",
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com",
      "requiresConfirmation": false,
      "awsRegion": "us-east-1"
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true,
      "awsRegion": "us-east-1"
    }
  },
  "preDeploymentChecks": {
    "enabled": true,
    "waitForCertificate": true,
    "validateDNS": true,
    "testAccessibility": true
  }
}
```

### Recommended sst.config.ts

```typescript
export default $config({
  app(input) {
    return {
      name: "my-app",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          profile: process.env.AWS_PROFILE
        }
      }
    };
  },
  async run() {
    const stage = $app.stage;

    // CRITICAL: Explicitly set domain per stage
    const domain = stage === "production"
      ? "example.com"
      : stage === "staging"
        ? "staging.example.com"
        : undefined;

    // Only configure domain if not dev
    const domainConfig = domain ? {
      name: domain,
      dns: sst.aws.dns({
        zone: "Z1234567890ABC", // Explicit zone ID prevents auto-detection failures
        override: true  // Required when adding domain to existing distribution
      })
    } : undefined;

    const site = new sst.aws.Nextjs("MySite", {
      domain: domainConfig,
    });

    return {
      site: site.url,
    };
  },
});
```

---

## 📚 Additional Resources

- [SST Custom Domains Documentation](https://sst.dev/docs/custom-domains/)
- [AWS ACM Certificate Validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html)
- [CloudFront Troubleshooting](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/troubleshooting-distributions.html)
- [Route53 DNS Troubleshooting](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/troubleshooting-domain-unavailable.html)

---

## ✅ Next Steps

To fully integrate these enhancements:

1. **Update main deployer** to use `runEnhancedPostDeployValidation()`
2. **Add CLI flag** for certificate wait timeout (`--cert-timeout=30`)
3. **Add CLI flag** for DNS validation strictness (`--strict-dns`)
4. **Create migration guide** for existing projects
5. **Update documentation** with new validation capabilities

---

**Last Updated**: January 2025
**Deploy-Kit Version**: 3.0.8+
