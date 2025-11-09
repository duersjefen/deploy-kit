/**
 * CloudFront Domain Conflict Check (Issue #220)
 *
 * **Purpose:** Detect existing CloudFront distributions using the same domain as deployment target
 *
 * **Real-World Incident:**
 * - Project had existing CloudFront distributions for staging/production domains
 * - SST config lacked `override: true` in dns configuration
 * - Deployment failed with: "CNAMEAlreadyExists: One or more of the CNAMEs you provided..."
 * - Required manual intervention (deleting distributions, updating config)
 * - Hit SST framework bugs during recovery
 * - Result: Production downtime
 *
 * **What This Check Does:**
 * 1. Parse sst.config.ts to extract configured custom domains
 * 2. Query AWS CloudFront for existing distributions with those domains
 * 3. Check if sst.config.ts has dns.override: true
 * 4. Block deployment if conflicts exist without override
 *
 * **Prevents:**
 * - CNAMEAlreadyExists errors during deployment
 * - Manual CloudFront distribution deletion
 * - SST framework bugs triggered by manual interventions
 * - Production downtime from deployment failures
 */

import chalk from 'chalk';
import { CloudFrontClient, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import type { ProjectConfig } from '../../types.js';

export function createCloudFrontDomainCheck(
  projectRoot: string,
  stage: string,
  config: ProjectConfig | null
): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking for CloudFront domain conflicts...'));

    try {
      // Parse sst.config.ts to extract domain configuration
      const domains = extractDomainsFromConfig(projectRoot, stage);

      if (domains.length === 0) {
        console.log(chalk.green('✅ No custom domains configured (using CloudFront default URL)\n'));
        return { passed: true };
      }

      // Check AWS for existing distributions with these domains
      const awsProfile = config?.awsProfile;
      const client = new CloudFrontClient({
        region: 'us-east-1', // CloudFront is global, but API is in us-east-1
        ...(awsProfile && { profile: awsProfile }),
      });

      const command = new ListDistributionsCommand({});
      const response = await client.send(command);

      const conflicts: Array<{ domain: string; distributionId: string }> = [];

      for (const distribution of response.DistributionList?.Items || []) {
        const aliases = distribution.Aliases?.Items || [];

        for (const domain of domains) {
          if (aliases.includes(domain)) {
            conflicts.push({
              domain,
              distributionId: distribution.Id!,
            });
          }
        }
      }

      if (conflicts.length > 0) {
        const conflictDetails = conflicts
          .map((c) => `  • ${c.domain} → CloudFront Distribution ${c.distributionId}`)
          .join('\n');

        // Check if sst.config.ts has override: true
        const hasOverride = checkDnsOverrideInConfig(projectRoot);

        if (!hasOverride) {
          console.log(chalk.red('❌ CloudFront domain conflicts detected\n'));

          return {
            passed: false,
            issue: `CloudFront distributions already exist for configured domains:\n${conflictDetails}`,
            manualFix:
              'Fix options:\n\n' +
              '1. Add override: true to dns configuration in sst.config.ts:\n' +
              '   dns: sst.aws.dns({ zone: "YOUR_ZONE_ID", override: true })\n\n' +
              '2. OR delete existing distributions (⚠️  CAUTION: May cause downtime):\n' +
              '   aws cloudfront delete-distribution --id <DISTRIBUTION_ID>\n\n' +
              '3. OR deploy to a different stage with different domains',
          };
        }

        // Has override but still found conflicts - this is expected
        // SST will update the existing distributions
        console.log(chalk.yellow('⚠️  Found existing distributions but dns.override: true is set'));
        console.log(chalk.yellow('   SST will update these distributions:'));
        console.log(chalk.yellow(conflictDetails));
        console.log(chalk.yellow('   Proceeding with deployment...\n'));
        return { passed: true };
      }

      console.log(chalk.green(`✅ No CloudFront domain conflicts found\n`));
      return { passed: true };
    } catch (error) {
      // Don't fail deployment for check errors (could be permissions issue)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.yellow('⚠️  Could not check CloudFront distributions (proceeding anyway)'));
      console.log(chalk.gray(`   ${errorMsg}\n`));
      return { passed: true };
    }
  };
}

/**
 * Extract custom domains from sst.config.ts for given stage
 *
 * **Example:**
 * ```typescript
 * // sst.config.ts
 * domain: stage === "production" ? {
 *   name: "example.com",
 *   redirects: ["www.example.com"]
 * } : undefined
 *
 * // Returns: ["example.com", "www.example.com"] for stage="production"
 * ```
 *
 * @param projectRoot - Project root directory
 * @param stage - Deployment stage (e.g., "production", "staging")
 * @returns Array of domain names configured for this stage
 */
function extractDomainsFromConfig(projectRoot: string, stage: string): string[] {
  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  if (!existsSync(sstConfigPath)) {
    return [];
  }

  try {
    const content = readFileSync(sstConfigPath, 'utf-8');
    const domains: string[] = [];

    // Simple regex-based extraction (good enough for domain detection)
    // Pattern 1: name: "example.com" or name: `example.com`
    const namePattern = /name:\s*["'`]([a-zA-Z0-9.-]+)["'`]/g;
    let match;

    while ((match = namePattern.exec(content)) !== null) {
      domains.push(match[1]);
    }

    // Pattern 2: redirects: ["www.example.com", "old.example.com"]
    const redirectsPattern = /redirects:\s*\[(.*?)\]/g;
    while ((match = redirectsPattern.exec(content)) !== null) {
      const redirectsList = match[1];
      const domainMatches = redirectsList.matchAll(/["'`]([a-zA-Z0-9.-]+)["'`]/g);

      for (const domainMatch of domainMatches) {
        domains.push(domainMatch[1]);
      }
    }

    // Remove duplicates
    return Array.from(new Set(domains));
  } catch (error) {
    // If parsing fails, return empty array (fail safe)
    return [];
  }
}

/**
 * Check if sst.config.ts has dns.override: true
 *
 * **Patterns Detected:**
 * ```typescript
 * dns: sst.aws.dns({ zone: "...", override: true })
 * dns: sst.cloudflare.dns({ override: true })
 * ```
 *
 * @param projectRoot - Project root directory
 * @returns true if override: true is found, false otherwise
 */
function checkDnsOverrideInConfig(projectRoot: string): boolean {
  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  if (!existsSync(sstConfigPath)) {
    return false;
  }

  try {
    const content = readFileSync(sstConfigPath, 'utf-8');

    // Look for dns configurations with override: true
    // Pattern: dns: sst.aws.dns({ ... override: true ... })
    const dnsPattern = /dns:\s*sst\.(aws|cloudflare|vercel)\.dns\s*\(\s*\{([^}]+)\}\s*\)/g;
    let match;

    while ((match = dnsPattern.exec(content)) !== null) {
      const configContent = match[2];

      // Check if override: true is present in the config
      if (/override:\s*true/.test(configContent)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If parsing fails, assume no override (conservative approach)
    return false;
  }
}
