/**
 * CloudFront CLI Commands
 * Audit, analyze, and manage CloudFront distributions
 * 
 * Provides CLI interface for managing CloudFront distributions:
 * - Audit: Analyze distributions and detect orphans/misconfigurations
 * - Report: Generate health summary of infrastructure
 * - Cleanup: Safely delete orphaned distributions with confirmation
 */

import chalk from 'chalk';
import { CloudFrontAPIClient } from '../../lib/cloudfront/client.js';
import { CloudFrontAnalyzer, type DistributionAnalysis, type InfrastructureAuditReport } from '../../lib/cloudfront/analyzer.js';
import type { ProjectConfig, DNSRecord } from '../../types.js';

/**
 * Main CloudFront command entry point
 * 
 * Routes to appropriate subcommand handler:
 * - audit: Analyze all distributions and detect issues
 * - report: Generate infrastructure health report
 * - cleanup: Delete orphaned distributions (with --dry-run or --force)
 * 
 * @param subcommand - One of: audit, report, cleanup
 * @param args - Command line arguments (may include --dry-run, --force)
 * @param config - Project configuration
 * @param projectRoot - Project root directory
 * 
 * @example
 * ```typescript
 * await handleCloudFrontCommand('audit', [], config, '/project');
 * ```
 */
export async function handleCloudFrontCommand(
  subcommand: string,
  args: string[],
  config: ProjectConfig,
  projectRoot: string
) {
  const awsProfile = config.awsProfile || process.env.AWS_PROFILE;
  const awsRegion = config.stageConfig?.staging?.awsRegion || 'eu-north-1';

  const client = new CloudFrontAPIClient(awsRegion, awsProfile);

  switch (subcommand) {
    case 'audit':
      await auditCloudFront(client, config);
      break;

    case 'cleanup':
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');
      await cleanupOrphans(client, config, dryRun, force);
      break;

    case 'report':
      await reportCloudFront(client, config);
      break;

    default:
      console.error(chalk.red(`❌ Unknown cloudfront subcommand: ${subcommand}`));
      console.error(chalk.gray('Valid commands: audit, cleanup, report'));
      process.exit(1);
  }
}

/**
 * Audit CloudFront distributions for issues
 * 
 * Analyzes all distributions and generates a comprehensive audit report
 * identifying orphaned, misconfigured, and healthy distributions.
 * 
 * @param client - CloudFront API client
 * @param config - Project configuration
 * @returns Promise that resolves after audit report is printed
 * @throws {Error} If AWS API calls fail
 */
async function auditCloudFront(
  client: CloudFrontAPIClient,
  config: ProjectConfig
) {
  console.log(chalk.bold.cyan('\n🔍 CloudFront Infrastructure Audit\n'));

  try {
    // Fetch DNS records from Route53 hosted zones
    console.log(chalk.gray('Fetching CloudFront distributions and DNS records...\n'));
    const dnsRecords: DNSRecord[] = [];

    if (config.hostedZones && config.hostedZones.length > 0) {
      for (const zone of config.hostedZones) {
        try {
          const records = await client.getDNSRecords(zone.zoneId);
          dnsRecords.push(...records);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Could not fetch DNS records for ${zone.domain}: ${(error as Error).message}`));
        }
      }
    }

    // Get distributions
    const distributions = await client.listDistributions();

    // Generate audit report
    const report = CloudFrontAnalyzer.generateAuditReport(
      distributions,
      config,
      dnsRecords
    );

    // Print report
    printAuditReport(report);

    // Exit with appropriate code
    if (report.orphanedDistributions.length > 0 ||
        report.misconfiguredDistributions.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Audit failed:'), error);
    process.exit(1);
  }
}

/**
 * Clean up orphaned CloudFront distributions
 * 
 * Finds orphaned distributions and either:
 * - With --dry-run: Shows what would be deleted
 * - With --force: Actually deletes the orphaned distributions
 * 
 * Requires explicit confirmation via flags for safety.
 * 
 * @param client - CloudFront API client
 * @param config - Project configuration
 * @param dryRun - If true, show plan without making changes
 * @param force - If true, actually delete distributions (requires dryRun=false)
 * @returns Promise that resolves after cleanup completes
 */
async function cleanupOrphans(
  client: CloudFrontAPIClient,
  config: ProjectConfig,
  dryRun: boolean,
  force: boolean
) {
  console.log(chalk.bold.cyan('\n🧹 CloudFront Cleanup\n'));

  if (!dryRun && !force) {
    console.log(chalk.yellow('⚠️  Run with --dry-run first to see what would be deleted'));
    console.log(chalk.gray('   npx deploy-kit cloudfront cleanup --dry-run\n'));
    process.exit(0);
  }

  try {
    // Fetch DNS records from Route53 hosted zones
    console.log(chalk.gray('Checking DNS records...\n'));
    const dnsRecords: DNSRecord[] = [];

    if (config.hostedZones && config.hostedZones.length > 0) {
      for (const zone of config.hostedZones) {
        try {
          const records = await client.getDNSRecords(zone.zoneId);
          dnsRecords.push(...records);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Could not fetch DNS records for ${zone.domain}: ${(error as Error).message}`));
        }
      }
    }

    const distributions = await client.listDistributions();

    // Find orphans
    const analyses = distributions.map((dist) =>
      CloudFrontAnalyzer.analyzeDistribution(dist, config, dnsRecords)
    );

    const orphans = analyses.filter((a) =>
      CloudFrontAnalyzer.canDelete(a)
    );

    if (orphans.length === 0) {
      console.log(chalk.green('✅ No orphaned distributions found (all distributions are referenced)'));
      return;
    }

    console.log(chalk.bold(`Found ${orphans.length} orphaned distribution(s)\n`));

    if (dryRun) {
      console.log(chalk.yellow('DRY RUN MODE - No changes will be made\n'));
      printCleanupPlan(orphans);
      console.log(chalk.gray('\nTo proceed with deletion, run:'));
      console.log(chalk.cyan('  npx deploy-kit cloudfront cleanup --force\n'));
      return;
    }

    if (force) {
      console.log(chalk.red('🚨 PROCEEDING WITH ACTUAL DELETION\n'));
      await executeCleanup(client, orphans);
    }
  } catch (error) {
    console.error(chalk.red('❌ Cleanup failed:'), error);
    process.exit(1);
  }
}

/**
 * Generate CloudFront health report
 * 
 * Creates a summary report showing:
 * - Total configured/healthy distributions
 * - Count of misconfigured distributions
 * - Count of orphaned distributions
 * - Overall infrastructure health status
 * 
 * @param client - CloudFront API client
 * @param config - Project configuration
 * @returns Promise that resolves after report is printed
 */
async function reportCloudFront(
  client: CloudFrontAPIClient,
  config: ProjectConfig
) {
  console.log(chalk.bold.cyan('\n📊 CloudFront Health Report\n'));

  try {
    // Fetch DNS records from Route53 hosted zones
    console.log(chalk.gray('Fetching data...\n'));
    const dnsRecords: DNSRecord[] = [];

    if (config.hostedZones && config.hostedZones.length > 0) {
      for (const zone of config.hostedZones) {
        try {
          const records = await client.getDNSRecords(zone.zoneId);
          dnsRecords.push(...records);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Could not fetch DNS records for ${zone.domain}: ${(error as Error).message}`));
        }
      }
    }

    const distributions = await client.listDistributions();

    const report = CloudFrontAnalyzer.generateAuditReport(
      distributions,
      config,
      dnsRecords
    );

    printHealthReport(report);
  } catch (error) {
    console.error(chalk.red('❌ Report failed:'), error);
    process.exit(1);
  }
}

function printAuditReport(report: InfrastructureAuditReport) {
  console.log(chalk.bold('Distribution Summary'));
  console.log(`  Expected:   ${report.configuredDistributions.length + 1} (stages + redirect)`);
  console.log(`  Actual:     ${report.totalDistributions}`);
  console.log(
    `  Status:     ${
      report.orphanedDistributions.length > 0 || report.misconfiguredDistributions.length > 0
        ? chalk.red('❌ ISSUES DETECTED')
        : chalk.green('✅ HEALTHY')
    }\n`
  );

  if (report.configuredDistributions.length > 0) {
    console.log(chalk.bold.green('✅ Configured Distributions'));
    report.configuredDistributions.forEach((dist: DistributionAnalysis) => {
      console.log(
        `  ${dist.id}: ${dist.dnsAliases.join(', ') || dist.domain}`
      );
      if (dist.severity === 'warning') {
        console.log(chalk.yellow(`     ⚠️  ${dist.reasons[0]}`));
      }
    });
    console.log();
  }

  if (report.misconfiguredDistributions.length > 0) {
    console.log(chalk.bold.yellow('⚠️  Misconfigured Distributions'));
    report.misconfiguredDistributions.forEach((dist: DistributionAnalysis) => {
      console.log(`  ${dist.id}`);
      dist.reasons.forEach((reason: string) => {
        console.log(chalk.yellow(`     • ${reason}`));
      });
    });
    console.log();
  }

  if (report.orphanedDistributions.length > 0) {
    console.log(chalk.bold.red('🔴 Orphaned Distributions'));
    report.orphanedDistributions.forEach((dist: DistributionAnalysis) => {
      console.log(`  ${dist.id}`);
      dist.reasons.forEach((reason: string) => {
        console.log(chalk.red(`     • ${reason}`));
      });
    });
    console.log();
  }

  if (report.issues.length > 0) {
    console.log(chalk.bold('Issues Detected'));
    report.issues.forEach((issue: string) => {
      console.log(`  • ${issue}`);
    });
    console.log();
  }

  if (report.recommendations.length > 0) {
    console.log(chalk.bold('Recommendations'));
    report.recommendations.forEach((rec: string) => {
      console.log(`  ${rec}`);
    });
    console.log();
  }
}

function printHealthReport(report: InfrastructureAuditReport) {
  console.log(chalk.bold('Status Summary'));
  console.log(`  Total distributions:  ${report.totalDistributions}`);
  console.log(`  Configured:          ${report.configuredDistributions.length}`);
  console.log(`  Misconfigured:       ${report.misconfiguredDistributions.length}`);
  console.log(`  Orphaned:            ${report.orphanedDistributions.length}\n`);

  if (report.issues.length > 0) {
    console.log(chalk.bold('Status'));
    report.issues.forEach((issue: string) => {
      console.log(`  ${issue}`);
    });
  }
}

function printCleanupPlan(orphans: DistributionAnalysis[]) {
  console.log(chalk.bold('DELETION PLAN\n'));
  orphans.forEach((orphan, idx) => {
    console.log(`${idx + 1}. ${orphan.id}`);
    console.log(`   Domain: ${orphan.domain}`);
    console.log(`   Created: ${orphan.createdTime || 'unknown'}`);
    console.log(`   Status: ${orphan.severity}`);
    orphan.reasons.forEach((reason: string) => {
      console.log(`   • ${reason}`);
    });
    console.log();
  });

  console.log(chalk.yellow(`Total deletions: ${orphans.length}`));
  console.log(chalk.yellow('Estimated time: 45-75 minutes (includes CloudFront propagation)\n'));
}

/**
 * Execute cleanup of orphaned distributions
 * 
 * For each orphaned distribution:
 * 1. Disable it
 * 2. Wait for CloudFront propagation
 * 3. Delete it
 * 
 * This is an irreversible operation.
 * 
 * @param client - CloudFront API client
 * @param orphans - List of orphaned distributions to delete
 * @returns Promise that resolves when all deletions complete
 */
async function executeCleanup(client: CloudFrontAPIClient, orphans: DistributionAnalysis[]) {
  console.log(`Deleting ${orphans.length} distributions...\n`);

  for (const orphan of orphans) {
    try {
      console.log(`Processing ${orphan.id}...`);

      // Disable
      console.log(`  1. Disabling distribution...`);
      await client.disableDistribution(orphan.id);

      // Wait
      console.log(`  2. Waiting for deployment...`);
      await client.waitForDistributionDeployed(orphan.id);

      // Delete
      console.log(`  3. Deleting...`);
      await client.deleteDistribution(orphan.id);

      console.log(chalk.green(`  ✅ ${orphan.id} deleted\n`));
    } catch (error) {
      console.error(chalk.red(`  ❌ Failed to delete ${orphan.id}:`), error);
    }
  }

  console.log(chalk.green('✅ Cleanup complete'));
}
