/**
 * SST Deployment Validator
 *
 * Comprehensive validation for SST deployments with custom domains.
 * Prevents and detects Route53, ACM, CloudFront, and Lambda configuration issues.
 *
 * Implements DEP-19 and DEP-20:
 * - Pre-deployment validation (prevent issues before deployment)
 * - Post-deployment validation (detect issues after deployment)
 * - Auto-create Route53 zones (DEP-20)
 *
 * @module sst-deployment-validator
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import {
  ACMClient,
  ListCertificatesCommand,
  DescribeCertificateCommand,
  type CertificateSummary,
} from '@aws-sdk/client-acm';
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
  GetHostedZoneCommand,
  type HostedZone,
} from '@aws-sdk/client-route-53';
import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import {
  LambdaClient,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import type { ProjectConfig, DeploymentStage } from '../types.js';

/**
 * SST domain configuration extracted from sst.config.ts
 */
export interface SSTDomainConfig {
  hasDomain: boolean;
  usesSstDns: boolean;
  domainName?: string;
  baseDomain?: string;
}

/**
 * Route53 hosted zone information
 */
export interface Route53ZoneInfo {
  zone: HostedZone;
  baseDomain: string;
  nameServers: string[];
  createdAt: Date;
  ageMinutes: number;
}

/**
 * Deployment validation result
 */
export interface ValidationResult {
  passed: boolean;
  issue?: string;
  details?: string;
  actionRequired?: string;
}

/**
 * Parse SST config to extract domain configuration
 *
 * @param projectRoot - Project root directory
 * @param stage - Deployment stage
 * @returns Domain configuration or null if no SST config found
 */
export function parseSSTDomainConfig(
  projectRoot: string,
  stage: DeploymentStage
): SSTDomainConfig | null {
  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  if (!existsSync(sstConfigPath)) {
    return null;
  }

  const content = readFileSync(sstConfigPath, 'utf-8');

  // Check if domain is configured
  const domainConfigured = /domain:\s*stage\s*!==\s*['"]dev['"]\s*\?/.test(content);

  if (!domainConfigured) {
    return {
      hasDomain: false,
      usesSstDns: false,
    };
  }

  // Check if using sst.aws.dns()
  const usesSstDns = content.includes('dns: sst.aws.dns()');

  // Extract domain name for this stage
  let domainName: string | undefined;

  // Look for stage-specific domain patterns like:
  // stage === 'staging' ? 'staging.example.com' : 'example.com'
  const stageDomainMatch = content.match(
    new RegExp(`stage\\s*===\\s*['"]${stage}['"]\\s*\\?\\s*['"]([^'"]+)['"]`, 'i')
  );

  if (stageDomainMatch) {
    domainName = stageDomainMatch[1];
  } else {
    // Fallback: look for domain string after stage check
    const domainMatch = content.match(/domain:\s*stage\s*!==\s*['"]dev['"]\s*\?\s*['"]([^'"]+)['"]/);
    if (domainMatch) {
      domainName = domainMatch[1];
    }
  }

  const baseDomain = domainName ? getBaseDomain(domainName) : undefined;

  return {
    hasDomain: domainConfigured,
    usesSstDns,
    domainName,
    baseDomain,
  };
}

/**
 * Extract base domain from full domain
 * Example: 'staging.example.com' -> 'example.com'
 */
export function getBaseDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return domain;
  }
  return parts.slice(-2).join('.');
}

/**
 * Check if Route53 hosted zone exists for domain
 *
 * DEP-19 Phase 1, Check 1A: Route53 Zone Existence
 *
 * @param baseDomain - Base domain (e.g., 'example.com')
 * @param awsProfile - AWS profile name
 * @returns Zone info if exists, null otherwise
 */
export async function checkRoute53Zone(
  baseDomain: string,
  awsProfile?: string
): Promise<Route53ZoneInfo | null> {
  const client = new Route53Client({
    region: 'us-east-1',
    ...(awsProfile && { credentials: { accessKeyId: '', secretAccessKey: '' } }), // Let SDK load from profile
  });

  // Set AWS profile for SDK to use
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const command = new ListHostedZonesByNameCommand({
      DNSName: baseDomain,
      MaxItems: 10,
    });

    const response = await client.send(command);

    const matchingZone = response.HostedZones?.find(
      (z) => z.Name === `${baseDomain}.` || z.Name === baseDomain
    );

    if (!matchingZone) {
      return null;
    }

    // Get full zone details including nameservers
    const getZoneCommand = new GetHostedZoneCommand({
      Id: matchingZone.Id,
    });
    const zoneDetails = await client.send(getZoneCommand);

    // Note: AWS Route53 doesn't return creation date in the API response
    // We approximate it by assuming recently created zones if they're unfamiliar
    const createdAt = new Date(0); // Unknown creation date
    const ageMinutes = Infinity; // Assume zone is old enough (skip age checks)

    return {
      zone: matchingZone,
      baseDomain,
      nameServers: zoneDetails.DelegationSet?.NameServers || [],
      createdAt,
      ageMinutes,
    };
  } catch (error) {
    throw new Error(
      `Failed to check Route53 zone for ${baseDomain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create Route53 hosted zone
 *
 * DEP-20: Auto-create Route53 zones
 *
 * @param baseDomain - Base domain (e.g., 'example.com')
 * @param projectName - Project name for tagging
 * @param awsProfile - AWS profile name
 * @returns Created zone info
 */
export async function createRoute53Zone(
  baseDomain: string,
  projectName: string,
  awsProfile?: string
): Promise<Route53ZoneInfo> {
  const client = new Route53Client({
    region: 'us-east-1',
  });

  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const command = new CreateHostedZoneCommand({
      Name: baseDomain,
      CallerReference: `deploy-kit-${Date.now()}`,
      HostedZoneConfig: {
        Comment: `Created by Deploy-Kit for ${projectName}`,
        PrivateZone: false,
      },
    });

    const response = await client.send(command);

    if (!response.HostedZone || !response.DelegationSet) {
      throw new Error('Failed to create hosted zone - no zone returned');
    }

    const createdAt = new Date();

    return {
      zone: response.HostedZone,
      baseDomain,
      nameServers: response.DelegationSet.NameServers || [],
      createdAt,
      ageMinutes: 0,
    };
  } catch (error) {
    throw new Error(
      `Failed to create Route53 zone for ${baseDomain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Wait for DNS propagation to specified nameservers
 *
 * @param domain - Domain name to check
 * @param expectedNameservers - Expected nameservers
 * @param maxAttempts - Maximum number of attempts (default: 60)
 * @returns true if propagated, false if timeout
 */
export async function waitForDNSPropagation(
  domain: string,
  expectedNameservers: string[],
  maxAttempts: number = 60
): Promise<boolean> {
  const interval = 10000; // 10 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check Google DNS (8.8.8.8) and Cloudflare DNS (1.1.1.1)
      let googleNS: string[] = [];
      let cloudflareNS: string[] = [];

      try {
        const googleResult = execSync(`dig @8.8.8.8 ${domain} NS +short`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000,
        });
        googleNS = googleResult.trim().split('\n').filter(Boolean);
      } catch {
        // Ignore dig errors
      }

      try {
        const cloudflareResult = execSync(`dig @1.1.1.1 ${domain} NS +short`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000,
        });
        cloudflareNS = cloudflareResult.trim().split('\n').filter(Boolean);
      } catch {
        // Ignore dig errors
      }

      const googleMatches = expectedNameservers.every((ns) =>
        googleNS.some((gns) => gns.includes(ns.replace(/\.$/, '')))
      );

      const cloudflareMatches = expectedNameservers.every((ns) =>
        cloudflareNS.some((cns) => cns.includes(ns.replace(/\.$/, '')))
      );

      process.stdout.write(
        `\r⏳ Attempt ${attempt}/${maxAttempts}... (Google: ${googleMatches ? '✓' : '✗'}, Cloudflare: ${cloudflareMatches ? '✓' : '✗'})`
      );

      if (googleMatches && cloudflareMatches) {
        console.log(''); // New line after progress
        return true;
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      // Continue waiting on errors
    }
  }

  console.log(''); // New line after progress
  return false;
}

/**
 * Check if ACM certificate exists for domain
 *
 * DEP-19 Phase 2, Check 2A: ACM Certificate Validation
 *
 * @param domain - Domain name
 * @param awsProfile - AWS profile name
 * @returns Certificate info if exists and issued, null otherwise
 */
export async function checkACMCertificate(
  domain: string,
  awsProfile?: string
): Promise<{ arn: string; status: string; domainName: string } | null> {
  const client = new ACMClient({
    region: 'us-east-1', // ACM for CloudFront must be in us-east-1
  });

  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const listCommand = new ListCertificatesCommand({});
    const listResponse = await client.send(listCommand);

    const baseDomain = getBaseDomain(domain);

    const matchingCert = listResponse.CertificateSummaryList?.find(
      (cert) =>
        cert.DomainName === domain ||
        cert.DomainName === `*.${baseDomain}` ||
        cert.DomainName === baseDomain
    );

    if (!matchingCert) {
      return null;
    }

    // Get certificate details
    const describeCommand = new DescribeCertificateCommand({
      CertificateArn: matchingCert.CertificateArn,
    });
    const describeResponse = await client.send(describeCommand);

    return {
      arn: matchingCert.CertificateArn || '',
      status: describeResponse.Certificate?.Status || 'UNKNOWN',
      domainName: matchingCert.DomainName || '',
    };
  } catch (error) {
    throw new Error(
      `Failed to check ACM certificate for ${domain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find CloudFront distribution by project name and stage
 *
 * @param projectName - Project name
 * @param stage - Deployment stage
 * @param awsProfile - AWS profile name
 * @returns Distribution info if found, null otherwise
 */
export async function findCloudFrontDistribution(
  projectName: string,
  stage: DeploymentStage,
  awsProfile?: string
): Promise<{
  id: string;
  domainName: string;
  origin: string;
  aliases: string[];
  status: string;
} | null> {
  const client = new CloudFrontClient({
    region: 'us-east-1',
  });

  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const command = new ListDistributionsCommand({});
    const response = await client.send(command);

    const matchingDist = response.DistributionList?.Items?.find((d) =>
      d.Comment?.includes(projectName) && d.Comment?.includes(stage)
    );

    if (!matchingDist) {
      return null;
    }

    // Get full distribution config
    const getCommand = new GetDistributionCommand({
      Id: matchingDist.Id,
    });
    const getResponse = await client.send(getCommand);

    const config = getResponse.Distribution?.DistributionConfig;

    return {
      id: matchingDist.Id || '',
      domainName: matchingDist.DomainName || '',
      origin: config?.Origins?.Items?.[0]?.DomainName || '',
      aliases: config?.Aliases?.Items || [],
      status: matchingDist.Status || '',
    };
  } catch (error) {
    throw new Error(
      `Failed to find CloudFront distribution: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if Route53 DNS records exist for domain
 *
 * DEP-19 Phase 2, Check 2C: Route53 DNS Records Validation
 *
 * @param domain - Domain name
 * @param zoneId - Hosted zone ID
 * @param awsProfile - AWS profile name
 * @returns true if DNS record exists
 */
export async function checkRoute53DNSRecords(
  domain: string,
  zoneId: string,
  awsProfile?: string
): Promise<boolean> {
  const client = new Route53Client({
    region: 'us-east-1',
  });

  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
    });
    const response = await client.send(command);

    const domainRecord = response.ResourceRecordSets?.find(
      (r) =>
        r.Name === `${domain}.` &&
        (r.Type === 'A' || r.Type === 'CNAME' || r.Type === 'AAAA')
    );

    return !!domainRecord;
  } catch (error) {
    throw new Error(
      `Failed to check Route53 DNS records for ${domain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if Next.js server Lambda exists (not DevServer)
 *
 * DEP-19 Phase 2, Check 2D: Next.js Server Lambda Validation
 *
 * @param projectName - Project name
 * @param stage - Deployment stage
 * @param awsRegion - AWS region
 * @param awsProfile - AWS profile name
 * @returns Lambda function name if exists, null otherwise
 */
export async function checkNextjsServerLambda(
  projectName: string,
  stage: DeploymentStage,
  awsRegion: string,
  awsProfile?: string
): Promise<string | null> {
  const client = new LambdaClient({
    region: awsRegion,
  });

  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  try {
    const command = new ListFunctionsCommand({});
    const response = await client.send(command);

    const serverFunction = response.Functions?.find(
      (f) =>
        f.FunctionName?.includes(`${projectName}-${stage}`) &&
        f.FunctionName?.includes('Server') &&
        !f.FunctionName?.includes('DevServer')
    );

    return serverFunction?.FunctionName || null;
  } catch (error) {
    throw new Error(
      `Failed to check Next.js server Lambda: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate Route53 zone existence (Pre-deployment, DEP-19 Phase 1, Check 1A)
 *
 * Blocks deployment if Route53 zone is missing when using sst.aws.dns()
 */
export async function validateRoute53ZoneExistence(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<ValidationResult> {
  const spinner = ora('Checking Route53 hosted zone...').start();

  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain) {
      spinner.succeed('✅ Route53 check skipped (no domain configured)');
      return { passed: true };
    }

    if (!sstConfig.usesSstDns) {
      spinner.succeed('✅ Route53 check skipped (not using sst.aws.dns())');
      return { passed: true };
    }

    if (!sstConfig.baseDomain) {
      spinner.fail('❌ Could not extract domain from sst.config.ts');
      return {
        passed: false,
        issue: 'Could not parse domain configuration from sst.config.ts',
        details: 'Domain is configured but could not be extracted',
      };
    }

    // Check if Route53 zone exists
    const zoneInfo = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);

    if (!zoneInfo) {
      spinner.fail(`❌ Route53 hosted zone not found for ${sstConfig.baseDomain}`);
      return {
        passed: false,
        issue: `Route53 hosted zone not found for ${sstConfig.baseDomain}`,
        details: `SST will deploy in dev mode with placeholder.sst.dev origin (broken)`,
        actionRequired: `Create Route53 zone or use different DNS configuration`,
      };
    }

    spinner.succeed(`✅ Route53 hosted zone found: ${zoneInfo.zone.Id}`);
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ Route53 zone check failed');
    return {
      passed: false,
      issue: `Route53 zone check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate Route53 zone readiness (Pre-deployment, DEP-19 Phase 1, Check 1B)
 *
 * Warns if zone was created recently (timing issues) or if stale Pulumi state exists
 */
export async function validateRoute53ZoneReadiness(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string,
  zoneInfo?: Route53ZoneInfo
): Promise<ValidationResult> {
  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain || !sstConfig.usesSstDns || !sstConfig.baseDomain) {
      return { passed: true };
    }

    // Get zone info if not provided
    let localZoneInfo: Route53ZoneInfo | undefined = zoneInfo || undefined;
    if (!localZoneInfo) {
      const zoneResult = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);
      localZoneInfo = zoneResult || undefined;
    }

    if (!localZoneInfo) {
      return { passed: true }; // Already checked in existence validation
    }

    // Check zone age (< 5 minutes is risky)
    // Note: Skip this check since AWS API doesn't provide creation date
    // if (localZoneInfo.ageMinutes < 5) {
    //   console.log(chalk.yellow(`\n⚠️  Route53 zone created ${Math.floor(localZoneInfo.ageMinutes)} minutes ago`));
    //   console.log(chalk.yellow('   SST may not detect it yet (caching/timing issue)'));
    //   console.log(chalk.yellow('   Recommendation: Wait 5 minutes after zone creation before first deploy\n'));
    //
    //   const response = await prompts({
    //     type: 'confirm',
    //     name: 'continue',
    //     message: 'Continue deployment anyway? Risk of incomplete domain config',
    //     initial: false,
    //   });
    //
    //   if (!response.continue) {
    //     return {
    //       passed: false,
    //       issue: 'Zone created too recently - waiting for propagation',
    //       actionRequired: 'Wait 5 minutes after Route53 zone creation',
    //     };
    //   }
    // }

    // Check for stale Pulumi state (previous dev mode deployment)
    const sstOutputPath = join(projectRoot, '.sst', 'outputs.json');
    if (existsSync(sstOutputPath)) {
      const outputs = readFileSync(sstOutputPath, 'utf-8');

      if (outputs.includes('placeholder.sst.dev')) {
        console.log(chalk.yellow('\n⚠️  Previous deployment was in dev mode (placeholder.sst.dev detected)'));
        console.log(chalk.yellow('   SST may have cached "no Route53 zone" from previous deploy'));
        console.log(chalk.yellow('   Recommendation: Destroy previous deployment first\n'));

        return {
          passed: false,
          issue: 'Previous dev mode deployment detected',
          details: 'SST cached state may prevent proper domain configuration',
          actionRequired: `Run: AWS_PROFILE=${config.awsProfile} npx sst remove --stage ${stage}`,
        };
      }
    }

    return { passed: true };
  } catch (error) {
    // Don't block deployment on readiness check failures
    console.log(chalk.yellow(`⚠️  Route53 readiness check warning: ${error instanceof Error ? error.message : String(error)}`));
    return { passed: true };
  }
}

/**
 * Ensure Route53 hosted zone exists (DEP-20)
 *
 * Auto-create Route53 zone if missing, with optional Namecheap integration
 */
export async function ensureRoute53Zone(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<Route53ZoneInfo | null> {
  // Parse SST config
  const sstConfig = parseSSTDomainConfig(projectRoot, stage);

  if (!sstConfig || !sstConfig.hasDomain || !sstConfig.usesSstDns || !sstConfig.baseDomain) {
    return null;
  }

  // Check if zone exists
  let zoneInfo = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);

  if (zoneInfo) {
    return zoneInfo; // Zone already exists
  }

  // Zone missing - offer to create
  console.log(chalk.yellow(`\n⚠️  Route53 hosted zone not found for ${sstConfig.baseDomain}`));
  console.log(chalk.yellow('\nWithout Route53 zone, SST will deploy in dev mode (broken).\n'));
  console.log('Options:');
  console.log('  1. Auto-create Route53 zone (recommended)');
  console.log('  2. Skip and use CloudFront URL only (remove domain from config)');
  console.log('  3. Abort deployment\n');

  const response = await prompts({
    type: 'confirm',
    name: 'create',
    message: 'Create Route53 hosted zone?',
    initial: true,
  });

  if (!response.create) {
    throw new Error('Route53 zone required for deployment');
  }

  // Create hosted zone
  console.log(chalk.cyan(`\n🔧 Creating Route53 hosted zone for ${sstConfig.baseDomain}...\n`));

  zoneInfo = await createRoute53Zone(
    sstConfig.baseDomain,
    config.projectName,
    config.awsProfile
  );

  console.log(chalk.green(`✅ Route53 hosted zone created: ${zoneInfo.zone.Id}`));
  console.log(chalk.cyan('\nAWS Nameservers:'));
  zoneInfo.nameServers.forEach((ns, i) => {
    console.log(chalk.gray(`  ${i + 1}. ${ns}`));
  });

  // Check for Namecheap script integration (optional)
  const namecheapScriptPath = join(process.env.HOME || '', '.scripts', 'namecheap.js');

  if (existsSync(namecheapScriptPath)) {
    console.log(chalk.cyan('\n🔍 Detected Namecheap DNS script'));

    const updateResponse = await prompts({
      type: 'confirm',
      name: 'update',
      message: 'Update Namecheap nameservers automatically?',
      initial: true,
    });

    if (updateResponse.update) {
      console.log(chalk.cyan('\n🔧 Updating Namecheap nameservers...\n'));

      try {
        execSync(
          `node "${namecheapScriptPath}" nameservers ${sstConfig.baseDomain} ${zoneInfo.nameServers.join(' ')}`,
          { stdio: 'inherit' }
        );

        console.log(chalk.green('\n✅ Namecheap nameservers updated\n'));

        // Wait for DNS propagation
        console.log(chalk.cyan('⏳ Waiting for DNS propagation (checking every 10 seconds)...\n'));

        const propagated = await waitForDNSPropagation(
          sstConfig.baseDomain,
          zoneInfo.nameServers,
          60 // 10 minutes max
        );

        if (propagated) {
          console.log(chalk.green('\n✅ DNS propagated - ready to deploy!\n'));
        } else {
          console.log(chalk.yellow('\n⚠️  DNS propagation taking longer than expected'));
          console.log(chalk.yellow('You can continue, but deployment may fail if DNS hasn\'t propagated to AWS.\n'));

          const continueResponse = await prompts({
            type: 'confirm',
            name: 'continue',
            message: 'Continue anyway?',
            initial: false,
          });

          if (!continueResponse.continue) {
            throw new Error('Waiting for DNS propagation');
          }
        }
      } catch (error) {
        console.log(chalk.red(`\n✗ Failed to update Namecheap nameservers: ${error instanceof Error ? error.message : String(error)}`));
        console.log(chalk.yellow('You\'ll need to update nameservers manually.\n'));
      }
    } else {
      // Manual nameserver update required
      console.log(chalk.yellow('\n⚠️  Manual action required:'));
      console.log('\n1. Login to your domain registrar (Namecheap, etc.)');
      console.log('2. Update nameservers to:');
      zoneInfo.nameServers.forEach((ns, i) => {
        console.log(chalk.gray(`   ${i + 1}. ${ns}`));
      });
      console.log('\n3. Wait for DNS propagation (5-60 minutes)');
      console.log(`4. Run deployment again: deploy-kit deploy ${stage}\n`);

      throw new Error('DNS propagation required before deployment');
    }
  } else {
    // No Namecheap script - manual update required
    console.log(chalk.yellow('\n⚠️  Manual action required:'));
    console.log('\n1. Login to your domain registrar');
    console.log('2. Update nameservers to:');
    zoneInfo.nameServers.forEach((ns, i) => {
      console.log(chalk.gray(`   ${i + 1}. ${ns}`));
    });
    console.log('\n3. Wait for DNS propagation (5-60 minutes)');
    console.log(`4. Run deployment again: deploy-kit deploy ${stage}\n`);

    const continueResponse = await prompts({
      type: 'confirm',
      name: 'continue',
      message: 'Continue deployment anyway? (not recommended)',
      initial: false,
    });

    if (!continueResponse.continue) {
      throw new Error('DNS propagation required before deployment');
    }
  }

  return zoneInfo;
}

/**
 * Validate ACM certificate (Post-deployment, DEP-19 Phase 2, Check 2A)
 */
export async function validateACMCertificate(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<ValidationResult> {
  const spinner = ora('Checking ACM certificate...').start();

  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
      spinner.succeed('✅ ACM check skipped (no domain configured)');
      return { passed: true };
    }

    // Check if ACM certificate exists
    const cert = await checkACMCertificate(sstConfig.domainName, config.awsProfile);

    if (!cert) {
      spinner.fail(`❌ ACM certificate not created for ${sstConfig.domainName}`);
      return {
        passed: false,
        issue: 'ACM certificate not created',
        details: 'SST ignored domain configuration - certificate missing',
        actionRequired: `Destroy and redeploy: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
      };
    }

    if (cert.status !== 'ISSUED') {
      spinner.warn(`⚠️  ACM certificate not yet issued (${cert.status})`);
      return {
        passed: false,
        issue: `ACM certificate status: ${cert.status}`,
        details: 'Certificate validation may take 5-30 minutes',
        actionRequired: `Wait and check again: deploy-kit status ${stage}`,
      };
    }

    spinner.succeed(`✅ ACM certificate issued: ${cert.arn}`);
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ ACM certificate check failed');
    return {
      passed: false,
      issue: `ACM check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate CloudFront domain alias (Post-deployment, DEP-19 Phase 2, Check 2B)
 */
export async function validateCloudFrontDomainAlias(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<ValidationResult> {
  const spinner = ora('Checking CloudFront domain alias...').start();

  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
      spinner.succeed('✅ CloudFront alias check skipped (no domain configured)');
      return { passed: true };
    }

    // Find CloudFront distribution
    const dist = await findCloudFrontDistribution(
      config.projectName,
      stage,
      config.awsProfile
    );

    if (!dist) {
      spinner.warn('⚠️  CloudFront distribution not found');
      return { passed: true }; // Not a critical error
    }

    // Check for dev mode (placeholder.sst.dev origin)
    if (dist.origin === 'placeholder.sst.dev') {
      spinner.fail('❌ CloudFront deployed in dev mode (placeholder origin)');
      return {
        passed: false,
        issue: 'SST deployed in dev mode',
        details: 'Origin is placeholder.sst.dev - Route53 zone was missing during deployment',
        actionRequired: `Create Route53 zone, then: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
      };
    }

    // Check if domain alias is configured
    if (!dist.aliases.includes(sstConfig.domainName)) {
      spinner.fail(`❌ CloudFront domain alias not configured for ${sstConfig.domainName}`);
      return {
        passed: false,
        issue: 'CloudFront has no domain alias',
        details: `Expected: ${sstConfig.domainName}, Got: ${dist.aliases.join(', ') || 'None'}`,
        actionRequired: `Redeploy: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
      };
    }

    spinner.succeed(`✅ CloudFront domain alias configured: ${sstConfig.domainName}`);
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ CloudFront alias check failed');
    return {
      passed: false,
      issue: `CloudFront check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate Route53 DNS records (Post-deployment, DEP-19 Phase 2, Check 2C)
 */
export async function validateRoute53DNSRecords(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<ValidationResult> {
  const spinner = ora('Checking Route53 DNS records...').start();

  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName || !sstConfig.baseDomain) {
      spinner.succeed('✅ DNS records check skipped (no domain configured)');
      return { passed: true };
    }

    // Get zone info
    const zoneInfo = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);

    if (!zoneInfo) {
      spinner.fail(`❌ Route53 zone not found for ${sstConfig.baseDomain}`);
      return {
        passed: false,
        issue: 'Route53 zone not found',
      };
    }

    // Check if DNS records exist
    const recordExists = await checkRoute53DNSRecords(
      sstConfig.domainName,
      zoneInfo.zone.Id || '',
      config.awsProfile
    );

    if (!recordExists) {
      spinner.fail(`❌ Route53 DNS records not created for ${sstConfig.domainName}`);
      return {
        passed: false,
        issue: 'Route53 DNS records not created',
        details: 'SST ignored domain configuration - DNS records missing',
        actionRequired: `Redeploy: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
      };
    }

    spinner.succeed(`✅ Route53 DNS record configured for ${sstConfig.domainName}`);
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ DNS records check failed');
    return {
      passed: false,
      issue: `DNS records check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate Next.js server Lambda (Post-deployment, DEP-19 Phase 2, Check 2D)
 */
export async function validateNextjsServerLambda(
  config: ProjectConfig,
  stage: DeploymentStage
): Promise<ValidationResult> {
  const spinner = ora('Checking Next.js server Lambda...').start();

  try {
    if (config.infrastructure !== 'sst-serverless') {
      spinner.succeed('✅ Lambda check skipped (non-SST infrastructure)');
      return { passed: true };
    }

    const awsRegion = config.stageConfig[stage].awsRegion || 'us-east-1';

    // Check if Next.js server Lambda exists
    const serverFunction = await checkNextjsServerLambda(
      config.projectName,
      stage,
      awsRegion,
      config.awsProfile
    );

    if (!serverFunction) {
      spinner.fail('❌ Next.js server Lambda not created');
      return {
        passed: false,
        issue: 'Next.js server Lambda not created',
        details: 'SST likely deployed in dev mode - only DevServer artifact created',
        actionRequired: 'Check Route53 zone exists, then redeploy',
      };
    }

    spinner.succeed(`✅ Next.js server Lambda: ${serverFunction}`);
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ Lambda check failed');
    return {
      passed: false,
      issue: `Lambda check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
