import { promisify } from 'util';
import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import prompt from 'prompts';

import { ProjectConfig, DeploymentStage, DNSRecord } from '../../types.js';
import { CloudFrontAPIClient } from './client.js';
import { CloudFrontAnalyzer } from './analyzer.js';
import { Route53DNSClient } from '../route53/dns-client.js';

const execAsync = promisify(exec);

/**
 * CloudFront operations manager
 *
 * Handles:
 * - Cache invalidation
 * - Distribution ID discovery
 * - Post-deployment audits
 * - Orphaned distribution cleanup
 *
 * @example
 * ```typescript
 * const cfOps = new CloudFrontOperations(config, 'my-aws-profile');
 * await cfOps.invalidateCache('staging', 'E1234567890ABC');
 * await cfOps.auditAndCleanup('production');
 * ```
 */
export class CloudFrontOperations {
  private config: ProjectConfig;
  private awsProfile?: string;

  /**
   * Create a new CloudFront operations manager
   *
   * @param config - Project configuration
   * @param awsProfile - Optional AWS profile name for authentication
   */
  constructor(config: ProjectConfig, awsProfile?: string) {
    this.config = config;
    this.awsProfile = awsProfile;
  }

  /**
   * Invalidate CloudFront cache
   *
   * Attempts to find distribution ID using multiple strategies:
   * 1. Use provided distributionId parameter
   * 2. Check environment variable (CLOUDFRONT_DIST_ID_{STAGE})
   * 3. Query CloudFront API for recent distributions
   *
   * @param stage - Deployment stage
   * @param distributionId - Optional distribution ID (auto-detected if not provided)
   *
   * @example
   * ```typescript
   * // With known distribution ID
   * await cfOps.invalidateCache('staging', 'E1234567890ABC');
   *
   * // Auto-detect distribution ID
   * await cfOps.invalidateCache('staging');
   * ```
   */
  async invalidateCache(stage: DeploymentStage, distributionId: string | null): Promise<void> {
    const spinner = ora('Invalidating CloudFront cache...').start();

    try {
      // Try to get distribution ID from parameter, then fall back to environment variable
      let distId = distributionId || process.env[`CLOUDFRONT_DIST_ID_${stage.toUpperCase()}`] || null;

      if (!distId) {
        // If still not found, try to fetch it from CloudFront API by querying for recent distributions
        distId = await this.findDistributionId(stage);
      }

      if (!distId) {
        spinner.warn('CloudFront distribution ID not found - skipping cache invalidation');
        return;
      }

      const { stdout } = await execAsync(
        `aws cloudfront create-invalidation --distribution-id ${distId} --paths "/*"`,
        {
          env: {
            ...process.env,
            ...(this.awsProfile && {
              AWS_PROFILE: this.awsProfile,
            }),
          },
        }
      );

      // Extract invalidation ID from response
      const invMatch = stdout.match(/"Id"[\s:]*"([^"]+)"/);
      if (invMatch && invMatch[1]) {
        spinner.succeed(`✅ Cache invalidation started (ID: ${invMatch[1]})`);
      } else {
        spinner.succeed('✅ Cache invalidation started');
      }
    } catch (error) {
      spinner.warn('⚠️  CloudFront cache invalidation failed (not critical)');
    }
  }

  /**
   * Find CloudFront distribution ID by querying API
   *
   * Used as fallback if distribution ID is not extracted from deployment output.
   * Searches for distributions matching the stage's domain configuration.
   *
   * @param stage - Deployment stage
   * @returns Distribution ID or null if not found
   *
   * @example
   * ```typescript
   * const distId = await cfOps.findDistributionId('staging');
   * // Returns: "E1234567890ABC" or null
   * ```
   */
  async findDistributionId(stage: DeploymentStage): Promise<string | null> {
    try {
      const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);
      const distributions = await client.listDistributions();

      // Get the domain we expect for this stage
      const domain = this.config.stageConfig[stage].domain;
      if (!domain) {
        return null;
      }

      // Find the distribution that matches our domain
      for (const dist of distributions) {
        if (dist.DomainName === domain || dist.DomainName.includes(domain)) {
          return dist.Id;
        }

        // Also check alternate domain names (CNAMEs)
        if (dist.AliasedDomains && dist.AliasedDomains.length > 0) {
          for (const alias of dist.AliasedDomains) {
            if (alias === domain) {
              return dist.Id;
            }
          }
        }
      }

      // If exact match not found, return most recently modified distribution
      // (assuming it's the one we just deployed)
      if (distributions.length > 0) {
        // Sort by LastModifiedTime (most recent first)
        distributions.sort((a, b) => {
          const timeA = a.LastModifiedTime?.getTime() || 0;
          const timeB = b.LastModifiedTime?.getTime() || 0;
          return timeB - timeA;
        });
        return distributions[0].Id;
      }

      return null;
    } catch (error) {
      // If API lookup fails, return null and skip cache invalidation
      return null;
    }
  }

  /**
   * Audit CloudFront after deployment and offer to cleanup orphans
   *
   * Runs a comprehensive audit that:
   * - Lists all CloudFront distributions
   * - Identifies orphaned distributions (not in config)
   * - Calculates estimated cost savings
   * - Offers interactive cleanup option
   *
   * @param stage - Deployment stage (for context, not required)
   *
   * @example
   * ```typescript
   * await cfOps.auditAndCleanup('production');
   * // Prompts user if orphans found:
   * // "Found 3 orphaned distributions (~$7.50/month). Cleanup? (y/n)"
   * ```
   */
  async auditAndCleanup(stage: DeploymentStage): Promise<void> {
    try {
      const spinner = ora('🔍 Auditing CloudFront infrastructure...').start();

      // Note: CloudFront is a global service with API endpoint always in us-east-1
      // even though the deployment may be in a different region
      const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);
      const distributions = await client.listDistributions();

      // Fetch DNS records from Route53
      const dnsClient = new Route53DNSClient(this.awsProfile);
      const dnsRecords = await this.fetchAllRelevantDNSRecords(dnsClient);

      const report = CloudFrontAnalyzer.generateAuditReport(distributions, this.config, dnsRecords);

      if (report.orphanedDistributions.length === 0) {
        spinner.succeed('✅ CloudFront infrastructure is clean');
        return;
      }

      spinner.stop();

      // Show orphaned distributions
      console.log('\n' + chalk.bold.yellow('⚠️  Orphaned CloudFront Distributions Detected\n'));

      const orphanCount = report.orphanedDistributions.length;
      const estimatedMonthlyCost = orphanCount * 2.5; // ~$2.50 per distribution/month

      console.log(chalk.yellow(`Found ${orphanCount} orphaned distribution(s):`));
      for (const analysis of report.orphanedDistributions) {
        const createdDate = analysis.createdTime ? new Date(analysis.createdTime).toLocaleDateString() : 'unknown';
        console.log(chalk.gray(`  • ${analysis.id} (created ${createdDate})`));
      }

      console.log(chalk.yellow(`\n💾 Estimated cost: ~$${estimatedMonthlyCost.toFixed(2)}/month\n`));

      // Ask user if they want to cleanup
      const response = await prompt({
        type: 'confirm',
        name: 'cleanup',
        message: 'Would you like to cleanup these orphaned distributions?',
        initial: false,
      });

      if (response.cleanup) {
        console.log('');
        console.log(chalk.bold.cyan('🧹 Starting CloudFront cleanup in background...'));
        console.log(chalk.gray('   Cleanup will continue even if you close this terminal'));
        console.log(chalk.gray('   Check progress anytime with: dk cloudfront report\n'));

        // Start cleanup in background (don't wait)
        this.startBackgroundCleanup(stage).catch(err => {
          console.error(chalk.red('⚠️  Background cleanup failed:'), err.message);
        });
      } else {
        console.log(chalk.gray('\nℹ️  You can cleanup anytime by running: dk cloudfront cleanup --dry-run\n'));
      }
    } catch (error) {
      // Don't break deployment on audit errors, but log for debugging
      // Audit is informational only - not critical to deployment success
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.gray(`⚠️  CloudFront audit skipped: ${errorMsg}`));
    }
  }

  /**
   * Fetch all relevant DNS records from Route53 for configured domains
   *
   * @param dnsClient - Route53 DNS client instance
   * @returns Array of DNS records for all configured domains
   * @private
   */
  private async fetchAllRelevantDNSRecords(dnsClient: Route53DNSClient): Promise<DNSRecord[]> {
    const allRecords: DNSRecord[] = [];

    // Fetch DNS records for each stage's domain
    for (const [stage, stageConfig] of Object.entries(this.config.stageConfig)) {
      if (stageConfig.domain) {
        try {
          const records = await dnsClient.getCurrentDNSRecords(stageConfig.domain);
          allRecords.push(...records);
        } catch (error) {
          // Log warning but continue - DNS records are informational only
          console.warn(`⚠️  Could not fetch DNS records for ${stageConfig.domain}`);
        }
      }
    }

    return allRecords;
  }

  /**
   * Start CloudFront cleanup in background (non-blocking)
   *
   * Disables and deletes orphaned distributions that are safe to remove.
   * This operation can take several minutes as CloudFront requires waiting
   * for distributions to fully deploy before deletion.
   *
   * @param stage - Deployment stage (for context)
   * @private
   */
  private async startBackgroundCleanup(stage: DeploymentStage): Promise<void> {
    try {
      const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);
      const distributions = await client.listDistributions();

      // Fetch DNS records from Route53
      const dnsClient = new Route53DNSClient(this.awsProfile);
      const dnsRecords = await this.fetchAllRelevantDNSRecords(dnsClient);

      const report = CloudFrontAnalyzer.generateAuditReport(distributions, this.config, dnsRecords);

      // Delete each orphaned distribution
      for (const analysis of report.orphanedDistributions) {
        // Only delete if it's safe (orphaned + placeholder origin)
        if (CloudFrontAnalyzer.canDelete(analysis)) {
          try {
            // Disable first
            await client.disableDistribution(analysis.id);
            // Wait for CloudFront to process (CloudFront deployments can take 15-45 minutes)
            await client.waitForDistributionDeployed(analysis.id, 3600000); // 60 min timeout
            // Then delete
            await client.deleteDistribution(analysis.id);
            console.log(chalk.gray(`✅ Deleted distribution ${analysis.id}`));
          } catch (err) {
            // Log but continue with next distribution
            console.error(chalk.gray(`⚠️  Failed to delete ${analysis.id}: ${(err as Error).message}`));
          }
        }
      }

      console.log(chalk.green('\n✅ CloudFront cleanup complete\n'));
    } catch (error) {
      console.error(chalk.gray(`⚠️  Background cleanup error: ${(error as Error).message}`));
    }
  }

  /**
   * Detect CNAME conflicts for a given domain
   *
   * Checks if any existing CloudFront distribution has the specified domain
   * configured as a CNAME (alias). Returns list of conflicting distributions.
   *
   * @param domain - Domain to check for conflicts (e.g., 'staging.example.com')
   * @returns Array of conflicting distributions with their details
   *
   * @example
   * ```typescript
   * const conflicts = await cfOps.detectCnameConflicts('staging.example.com');
   * if (conflicts.length > 0) {
   *   console.log(`Found ${conflicts.length} CNAME conflict(s)`);
   * }
   * ```
   */
  async detectCnameConflicts(domain: string): Promise<Array<{
    distributionId: string;
    domainName: string;
    aliases: string[];
    status: string;
    enabled: boolean;
  }>> {
    const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);
    const distributions = await client.listDistributions();

    const conflicts: Array<{
      distributionId: string;
      domainName: string;
      aliases: string[];
      status: string;
      enabled: boolean;
    }> = [];
    for (const dist of distributions) {
      if (dist.AliasedDomains.includes(domain)) {
        conflicts.push({
          distributionId: dist.Id,
          domainName: dist.DomainName,
          aliases: dist.AliasedDomains,
          status: dist.Status,
          enabled: dist.Enabled,
        });
      }
    }

    return conflicts;
  }

  /**
   * Remove CNAMEs from distributions (fast cleanup, ~1 minute)
   *
   * Removes specified aliases from CloudFront distributions without deleting them.
   * This is the fastest way to resolve CNAME conflicts when you want to keep
   * the distribution but change its aliases.
   *
   * @param conflicts - Array of conflicting distributions
   * @param targetDomain - Domain to remove from aliases
   *
   * @example
   * ```typescript
   * await cfOps.removeCnamesFromDistributions(conflicts, 'staging.example.com');
   * console.log('CNAMEs removed from conflicting distributions');
   * ```
   */
  async removeCnamesFromDistributions(
    conflicts: Array<{
      distributionId: string;
      aliases: string[];
    }>,
    targetDomain: string
  ): Promise<void> {
    const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);

    for (const conflict of conflicts) {
      try {
        console.log(chalk.cyan(`  Removing ${targetDomain} from ${conflict.distributionId}...`));

        // Get current distribution config
        const { CloudFrontClient, GetDistributionConfigCommand, UpdateDistributionCommand } = await import('@aws-sdk/client-cloudfront');

        // Set AWS profile
        if (this.awsProfile) {
          process.env.AWS_PROFILE = this.awsProfile;
        }

        const cfClient = new CloudFrontClient({ region: 'us-east-1' });

        const getConfigCommand = new GetDistributionConfigCommand({
          Id: conflict.distributionId,
        });
        const configResponse = await cfClient.send(getConfigCommand);

        if (!configResponse.DistributionConfig || !configResponse.ETag) {
          throw new Error(`Could not get config for distribution ${conflict.distributionId}`);
        }

        const config = configResponse.DistributionConfig;

        // Remove target domain from aliases
        const updatedAliases = (config.Aliases?.Items || []).filter(
          (alias) => alias !== targetDomain
        );

        config.Aliases = {
          Quantity: updatedAliases.length,
          Items: updatedAliases.length > 0 ? updatedAliases : undefined,
        };

        // Update distribution
        const updateCommand = new UpdateDistributionCommand({
          Id: conflict.distributionId,
          DistributionConfig: config,
          IfMatch: configResponse.ETag,
        });

        await cfClient.send(updateCommand);

        console.log(chalk.green(`  ✅ Removed ${targetDomain} from ${conflict.distributionId}`));
      } catch (error) {
        console.error(chalk.red(`  ❌ Failed to remove CNAME from ${conflict.distributionId}: ${(error as Error).message}`));
        throw error;
      }
    }
  }

  /**
   * Delete distributions (slow cleanup, ~10-15 minutes)
   *
   * Disables and deletes CloudFront distributions completely. This operation
   * is slow because CloudFront requires distributions to be fully deployed
   * in a disabled state before they can be deleted.
   *
   * @param conflicts - Array of conflicting distributions to delete
   *
   * @example
   * ```typescript
   * await cfOps.deleteDistributions(conflicts);
   * console.log('All conflicting distributions deleted');
   * ```
   */
  async deleteDistributions(
    conflicts: Array<{
      distributionId: string;
      enabled: boolean;
    }>
  ): Promise<void> {
    const client = new CloudFrontAPIClient('us-east-1', this.awsProfile);

    console.log(chalk.cyan('\n  Step 1: Disabling distributions...'));

    // Disable all distributions first
    for (const conflict of conflicts) {
      try {
        if (conflict.enabled) {
          console.log(chalk.gray(`    Disabling ${conflict.distributionId}...`));
          await client.disableDistribution(conflict.distributionId);
          console.log(chalk.green(`    ✅ ${conflict.distributionId} disabled`));
        } else {
          console.log(chalk.gray(`    ${conflict.distributionId} already disabled`));
        }
      } catch (error) {
        console.error(chalk.red(`    ❌ Failed to disable ${conflict.distributionId}: ${(error as Error).message}`));
        throw error;
      }
    }

    console.log(chalk.cyan('\n  Step 2: Waiting for distributions to be deployed (5-15 minutes)...\n'));

    // Wait for all distributions to reach Deployed status
    for (const conflict of conflicts) {
      try {
        console.log(chalk.gray(`    Waiting for ${conflict.distributionId}...`));
        await client.waitForDistributionDeployed(conflict.distributionId, 1200000); // 20 min timeout
        console.log(chalk.green(`    ✅ ${conflict.distributionId} ready for deletion`));
      } catch (error) {
        console.error(chalk.red(`    ❌ Timeout waiting for ${conflict.distributionId}: ${(error as Error).message}`));
        throw error;
      }
    }

    console.log(chalk.cyan('\n  Step 3: Deleting distributions...\n'));

    // Delete all distributions
    for (const conflict of conflicts) {
      try {
        console.log(chalk.gray(`    Deleting ${conflict.distributionId}...`));
        await client.deleteDistribution(conflict.distributionId);
        console.log(chalk.green(`    ✅ ${conflict.distributionId} deleted`));
      } catch (error) {
        console.error(chalk.red(`    ❌ Failed to delete ${conflict.distributionId}: ${(error as Error).message}`));
        throw error;
      }
    }
  }
}
