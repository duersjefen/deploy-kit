import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';
import {
  parseSSTDomainConfig,
  checkRoute53Zone,
  checkACMCertificate,
  findCloudFrontDistribution,
  checkRoute53DNSRecords,
  checkNextjsServerLambda,
} from '../lib/sst-deployment-validator.js';

const execAsync = promisify(exec);

/**
 * Comprehensive deployment status checking (DEP-19 Enhanced)
 *
 * Now includes:
 * - Route53 zone validation
 * - ACM certificate status
 * - CloudFront domain aliases
 * - Route53 DNS records
 * - Next.js Lambda status
 * - Dev mode detection
 */
export function getStatusChecker(config: ProjectConfig, projectRoot: string) {
  /**
   * Check all stages at once
   */
  async function checkAllStages(): Promise<void> {
    console.log(chalk.bold.cyan('\n📊 DEPLOYMENT STATUS REPORT (Enhanced)\n'));

    const stages: DeploymentStage[] = ['staging', 'production'];

    for (const stage of stages) {
      if (!config.stages.includes(stage)) continue;

      await checkStage(stage);
      console.log('');
    }

    // Check for global issues
    await checkGlobalIssues();
  }

  /**
   * Check a single stage (DEP-19 Enhanced)
   */
  async function checkStage(stage: DeploymentStage): Promise<void> {
    console.log(chalk.bold(`\n═══════════════════════════════════════`));
    console.log(chalk.bold.cyan(`  Stage: ${stage.toUpperCase()}`));
    console.log(chalk.bold(`═══════════════════════════════════════\n`));

    // Check lock status
    const lockStatus = await checkLockStatus(stage);
    console.log(`  🔒 Lock Status: ${lockStatus}`);

    // Check SST domain configuration
    if (config.infrastructure === 'sst-serverless') {
      await checkSSTDomainConfiguration(stage);
    }

    // Check CloudFront status
    const cfStatus = await checkCloudFrontStatus(stage);
    console.log(`  ☁️  CloudFront: ${cfStatus}`);

    // Check database status
    if (config.database === 'dynamodb') {
      const dbStatus = await checkDatabaseStatus(stage);
      console.log(`  🗄️  Database: ${dbStatus}`);
    }

    // Check domain accessibility
    const domainStatus = await checkDomainAccessibility(stage);
    console.log(`  🌐 Domain: ${domainStatus}`);
  }

  /**
   * Check SST domain configuration (DEP-19 comprehensive validation)
   */
  async function checkSSTDomainConfiguration(stage: DeploymentStage): Promise<void> {
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain) {
      console.log(chalk.gray('  🔧 SST Domain: Not configured'));
      return;
    }

    if (!sstConfig.usesSstDns) {
      console.log(chalk.gray('  🔧 SST Domain: Not using sst.aws.dns()'));
      return;
    }

    if (!sstConfig.baseDomain || !sstConfig.domainName) {
      console.log(chalk.yellow('  🔧 SST Domain: Could not parse domain from sst.config.ts'));
      return;
    }

    console.log(chalk.bold(`\n  🔧 SST Domain Configuration (${sstConfig.domainName}):`));

    // Check 1: Route53 Zone
    try {
      const zoneInfo = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);
      if (zoneInfo) {
        console.log(chalk.green(`     ✅ Route53 Zone: ${zoneInfo.zone.Id} (${zoneInfo.zone.Name})`));
      } else {
        console.log(chalk.red(`     ❌ Route53 Zone: Not found for ${sstConfig.baseDomain}`));
        console.log(chalk.yellow(`        → Run: dk deploy ${stage} (will auto-create)`));
      }
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️  Route53 Zone: Check failed - ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // Check 2: ACM Certificate
    try {
      const cert = await checkACMCertificate(sstConfig.domainName, config.awsProfile);
      if (cert) {
        const statusIcon = cert.status === 'ISSUED' ? '✅' : '⏳';
        const statusColor = cert.status === 'ISSUED' ? chalk.green : chalk.yellow;
        console.log(statusColor(`     ${statusIcon} ACM Certificate: ${cert.status} (${cert.arn.split('/').pop()})`));
      } else {
        console.log(chalk.red(`     ❌ ACM Certificate: Not found for ${sstConfig.domainName}`));
        console.log(chalk.yellow(`        → SST may have deployed in dev mode`));
      }
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️  ACM Certificate: Check failed - ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // Check 3: CloudFront Domain Alias
    try {
      const dist = await findCloudFrontDistribution(config.projectName, stage, config.awsProfile);
      if (dist) {
        if (dist.origin === 'placeholder.sst.dev') {
          console.log(chalk.red(`     ❌ CloudFront Alias: DEV MODE DETECTED (placeholder.sst.dev origin)`));
          console.log(chalk.yellow(`        → Destroy and redeploy: npx sst remove --stage ${stage} && dk deploy ${stage}`));
        } else if (dist.aliases.includes(sstConfig.domainName)) {
          console.log(chalk.green(`     ✅ CloudFront Alias: ${sstConfig.domainName} configured`));
        } else {
          console.log(chalk.red(`     ❌ CloudFront Alias: ${sstConfig.domainName} not configured`));
          console.log(chalk.yellow(`        → Expected: ${sstConfig.domainName}, Got: ${dist.aliases.join(', ') || 'None'}`));
        }
      } else {
        console.log(chalk.yellow(`     ⚠️  CloudFront: Distribution not found`));
      }
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️  CloudFront Alias: Check failed - ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // Check 4: Route53 DNS Records
    try {
      const zoneInfo = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);
      if (zoneInfo) {
        const recordExists = await checkRoute53DNSRecords(
          sstConfig.domainName,
          zoneInfo.zone.Id || '',
          config.awsProfile
        );
        if (recordExists) {
          console.log(chalk.green(`     ✅ DNS Records: ${sstConfig.domainName} → CloudFront`));
        } else {
          console.log(chalk.red(`     ❌ DNS Records: ${sstConfig.domainName} not configured`));
          console.log(chalk.yellow(`        → SST may have deployed in dev mode`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️  DNS Records: Check failed - ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    // Check 5: Next.js Server Lambda
    try {
      const awsRegion = config.stageConfig[stage].awsRegion || 'us-east-1';
      const serverFunction = await checkNextjsServerLambda(
        config.projectName,
        stage,
        awsRegion,
        config.awsProfile
      );
      if (serverFunction) {
        console.log(chalk.green(`     ✅ Next.js Lambda: ${serverFunction}`));
      } else {
        console.log(chalk.red(`     ❌ Next.js Lambda: Server function not found`));
        console.log(chalk.yellow(`        → Only DevServer exists - likely dev mode deployment`));
      }
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️  Next.js Lambda: Check failed - ${error instanceof Error ? error.message : 'Unknown error'}`));
    }

    console.log(''); // Spacing
  }

  /**
   * Check if stage is locked
   */
  async function checkLockStatus(stage: DeploymentStage): Promise<string> {
    try {
      // Check for lock files
      const lockFile = `${projectRoot}/.deployment-lock-${stage}`;

      // Check Pulumi lock
      const { stdout } = await execAsync(
        `npx sst status --stage ${stage} 2>/dev/null || echo "unlocked"`,
        { cwd: projectRoot }
      );

      if (stdout.includes('locked') || stdout.includes('Lock')) {
        return chalk.yellow('🔒 LOCKED (Pulumi state)');
      } else {
        return chalk.green('✅ Unlocked');
      }
    } catch {
      return chalk.green('✅ Unlocked');
    }
  }

  /**
   * Check CloudFront distribution status
   */
  async function checkCloudFrontStatus(stage: DeploymentStage): Promise<string> {
    try {
      const domain = config.stageConfig[stage].domain ||
        `${stage}.${config.mainDomain}`;

      if (!domain) {
        return chalk.gray('ℹ️  Not configured');
      }

      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      const { stdout: distOutput } = await execAsync(
        `aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='${domain}'].{Id:Id,Status:Status,DomainName:DomainName}" --output json`,
        { env }
      ).catch(() => ({ stdout: '[]' }));

      const distributions = JSON.parse(distOutput || '[]');

      if (distributions.length === 0) {
        // Try finding by project name instead
        const dist = await findCloudFrontDistribution(config.projectName, stage, config.awsProfile);
        if (dist) {
          const statusEmoji = dist.status === 'Deployed' ? '✅' : '⏳';
          return `${statusEmoji} ${dist.status} (${dist.id})`;
        }
        return chalk.yellow('ℹ️  Distribution not yet created');
      }

      const dist = distributions[0];
      const statusEmoji = dist.Status === 'Deployed' ? '✅' : '⏳';
      return `${statusEmoji} ${dist.Status} (${dist.Id})`;
    } catch {
      return chalk.gray('ℹ️  Could not check');
    }
  }

  /**
   * Check database status
   */
  async function checkDatabaseStatus(stage: DeploymentStage): Promise<string> {
    try {
      const tableName = config.stageConfig[stage].dynamoTableName;
      if (!tableName) {
        return chalk.gray('ℹ️  Not configured');
      }

      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      const { stdout } = await execAsync(
        `aws dynamodb describe-table --table-name ${tableName} --query 'Table.TableStatus' --output text`,
        { env }
      ).catch(() => ({ stdout: 'UNKNOWN' }));

      const status = stdout.trim();
      const statusEmoji = status === 'ACTIVE' ? '✅' : '⏳';
      return `${statusEmoji} ${status}`;
    } catch {
      return chalk.red('❌ Error checking');
    }
  }

  /**
   * Check domain accessibility
   */
  async function checkDomainAccessibility(stage: DeploymentStage): Promise<string> {
    try {
      const domain = config.stageConfig[stage].domain ||
        `${stage}.${config.mainDomain}`;

      if (!domain) {
        return chalk.gray('ℹ️  Not configured');
      }

      const url = `https://${domain}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        signal: controller.signal as any,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (response && response.status < 500) {
        return chalk.green(`✅ Accessible (${response.status})`);
      } else if (response) {
        return chalk.yellow(`⚠️  Server error (${response.status})`);
      } else {
        return chalk.yellow('⏳ Not responding (may be propagating)');
      }
    } catch {
      return chalk.yellow('⏳ Could not reach');
    }
  }

  /**
   * Check for global issues
   */
  async function checkGlobalIssues(): Promise<void> {
    console.log(chalk.bold('\n═══════════════════════════════════════'));
    console.log(chalk.bold.cyan('  GLOBAL CHECKS'));
    console.log(chalk.bold('═══════════════════════════════════════\n'));

    // Check AWS credentials
    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      await execAsync('aws sts get-caller-identity', { env });
      console.log(`  ✅ AWS credentials configured${config.awsProfile ? ` (${config.awsProfile})` : ''}`);
    } catch {
      console.log(chalk.red('  ❌ AWS credentials not configured'));
    }

    // Check npm packages
    try {
      const { stdout } = await execAsync('npm ls @duersjefen/deploy-kit --depth=0', {
        cwd: projectRoot,
      });
      if (stdout.includes('deploy-kit')) {
        console.log('  ✅ deploy-kit package available');
      }
    } catch {
      console.log(chalk.yellow('  ⚠️  deploy-kit package issue'));
    }

    console.log('');
  }

  return {
    checkAllStages,
    checkStage,
    checkLockStatus,
    checkCloudFrontStatus,
    checkDatabaseStatus,
    checkDomainAccessibility,
    checkSSTDomainConfiguration,
  };
}
