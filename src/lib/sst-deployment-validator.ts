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
import { resolve as resolveNS } from 'dns/promises';
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
  ChangeResourceRecordSetsCommand,
  type HostedZone,
  type ResourceRecordSet,
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
import { retryAWSCommand } from './aws-retry.js';
import { trackZoneCreation, isZoneRecent, getZoneAgeMinutes } from './zone-tracker.js';

/**
 * SST domain configuration extracted from sst.config.ts
 */
export interface SSTDomainConfig {
  hasDomain: boolean;
  usesSstDns: boolean;
  hasExplicitZone?: boolean; // DEP-25: Whether zone ID is explicitly provided
  hasOverride?: boolean; // DEP-26: Whether override:true is present in dns config
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
  skipped?: boolean; // True if check was skipped (e.g., no domain configured)
  issue?: string;
  details?: string;
  actionRequired?: string;
}

/**
 * Parse SST config to extract domain configuration
 *
 * Supports multiple SST config patterns including:
 * - Simple ternary: stage !== "dev" ? "example.com" : undefined
 * - Stage-specific: stage === "staging" ? "staging.example.com" : "example.com"
 * - Template literals: `${stage}.example.com`
 * - Multiple conditions: stage !== "dev" && stage !== "development"
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

  // Remove comments to avoid false positives
  const contentWithoutComments = content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  // Check if domain is configured (multiple patterns)
  const domainPatterns = [
    /domain:\s*stage\s*!==\s*['"]dev['"]/,
    /domain:\s*stage\s*!==\s*['"]development['"]/,
    /domain:\s*\w+\s*\?\s*['"`]/,
    /domain:\s*\{/,
    /domain:\s*getDomain\(/,
    /domain:\s*process\.env\./,
  ];

  const domainConfigured = domainPatterns.some((pattern) =>
    pattern.test(contentWithoutComments)
  );

  if (!domainConfigured) {
    return {
      hasDomain: false,
      usesSstDns: false,
      hasExplicitZone: false,
      hasOverride: false,
    };
  }

  // Check if using sst.aws.dns() (with or without arguments)
  // Matches: dns: sst.aws.dns(), dns:sst.aws.dns(), dns: sst.aws.dns({ zone: "..." })
  const usesSstDns = /dns:\s*sst\.aws\.dns\(/.test(contentWithoutComments);

  // Check if zone ID is explicitly provided (DEP-25)
  // This helps detect when auto-detection may fail
  const hasExplicitZone = /dns:\s*sst\.aws\.dns\(\s*\{[^}]*zone:/.test(contentWithoutComments);

  // Check if override:true is present in dns config (DEP-26)
  // Required when adding domain to existing CloudFront distribution
  const hasOverride = /dns:\s*sst\.aws\.dns\(\s*\{[^}]*override:\s*true/.test(contentWithoutComments);

  // Extract domain name for this stage (try multiple patterns)
  let domainName: string | undefined;

  // Pattern 1: stage === 'staging' ? 'staging.example.com' : ...
  const stageEqualPattern = new RegExp(
    `stage\\s*===\\s*['"]${stage}['"]\\s*\\?\\s*['"\`]([^'"\`]+)['"\`]`,
    'i'
  );
  const stageEqualMatch = contentWithoutComments.match(stageEqualPattern);
  if (stageEqualMatch) {
    domainName = stageEqualMatch[1];
  }

  // Pattern 2: stage !== 'dev' ? 'example.com' : undefined
  if (!domainName) {
    const notDevPattern = /domain:\s*stage\s*!==\s*['"](?:dev|development)['"]\s*\?\s*['"`]([^'"`]+)['"`]/;
    const notDevMatch = contentWithoutComments.match(notDevPattern);
    if (notDevMatch) {
      domainName = notDevMatch[1];
    }
  }

  // Pattern 3: Template literal `${stage}.example.com`
  // Handles: domain: `${stage}.example.com` and name: `${stage}.example.com`
  if (!domainName) {
    const templatePattern = /(?:domain|name):\s*['"`]\$\{[^}]*\}\.([a-z0-9-]+\.[a-z]{2,})['"`]/i;
    const templateMatch = contentWithoutComments.match(templatePattern);
    if (templateMatch) {
      // Reconstruct domain with current stage
      domainName = `${stage}.${templateMatch[1]}`;
    }
  }

  // Pattern 4: Look for any domain-like string in domain configuration
  if (!domainName) {
    const anyDomainPattern = /domain:.*?['"`]([a-z0-9-]+\.(?:[a-z0-9-]+\.)?[a-z]{2,})['"`]/i;
    const anyDomainMatch = contentWithoutComments.match(anyDomainPattern);
    if (anyDomainMatch) {
      domainName = anyDomainMatch[1];
    }
  }

  // Pattern 5: Multi-part domain object { name: "example.com", dns: ... }
  // Handles: domain: { name: "..." } and domain: condition ? { name: "..." } : undefined
  if (!domainName) {
    // More flexible pattern that handles ternary operators before the object
    const objectDomainPattern = /domain:[^{]*\{[^}]*name:\s*['"`\$\{]([a-z0-9-.]+)(?:['"`\}]|\\)/i;
    const objectDomainMatch = contentWithoutComments.match(objectDomainPattern);
    if (objectDomainMatch) {
      domainName = objectDomainMatch[1];
    }
  }

  const baseDomain = domainName ? getBaseDomain(domainName) : undefined;

  return {
    hasDomain: domainConfigured,
    usesSstDns,
    hasExplicitZone,
    hasOverride,
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
  // Set AWS profile BEFORE creating client so SDK can load credentials
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new Route53Client({
    region: 'us-east-1',
    // Don't pass credentials - let SDK use AWS_PROFILE from environment
  });

  try {
    const command = new ListHostedZonesByNameCommand({
      DNSName: baseDomain,
      MaxItems: 10,
    });

    const response = await retryAWSCommand(client, command, {
      maxAttempts: 3,
      onRetry: (error, attempt, delay) => {
        console.log(chalk.gray(`  Retrying Route53 query (attempt ${attempt}/3) after ${delay}ms...`));
      },
    });

    const matchingZone = response.HostedZones?.find(
      (z: any) => z.Name === `${baseDomain}.` || z.Name === baseDomain
    );

    if (!matchingZone) {
      return null;
    }

    // Get full zone details including nameservers
    const getZoneCommand = new GetHostedZoneCommand({
      Id: matchingZone.Id,
    });
    const zoneDetails = await retryAWSCommand(client, getZoneCommand, { maxAttempts: 3 });

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
  // Set AWS profile BEFORE creating client
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new Route53Client({
    region: 'us-east-1',
  });

  try {
    const command = new CreateHostedZoneCommand({
      Name: baseDomain,
      CallerReference: `deploy-kit-${Date.now()}`,
      HostedZoneConfig: {
        Comment: `Created by Deploy-Kit for ${projectName}`,
        PrivateZone: false,
      },
    });

    const response = await retryAWSCommand(client, command, {
      maxAttempts: 3,
      onRetry: (error, attempt, delay) => {
        console.log(chalk.gray(`  Retrying zone creation (attempt ${attempt}/3) after ${delay}ms...`));
      },
    });

    if (!response.HostedZone || !response.DelegationSet) {
      throw new Error('Failed to create hosted zone - no zone returned');
    }

    const createdAt = new Date();

    const zoneInfo: Route53ZoneInfo = {
      zone: response.HostedZone,
      baseDomain,
      nameServers: response.DelegationSet.NameServers || [],
      createdAt,
      ageMinutes: 0,
    };

    return zoneInfo;
  } catch (error) {
    throw new Error(
      `Failed to create Route53 zone for ${baseDomain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Query DNS nameservers using Node.js dns module
 *
 * @param domain - Domain to query
 * @param resolver - DNS server IP (e.g., '8.8.8.8')
 * @returns Array of nameservers or empty array on error
 */
async function queryNameservers(domain: string, resolver: string): Promise<string[]> {
  try {
    // Use Node.js DNS resolver with custom nameserver
    const { Resolver } = await import('dns');
    const customResolver = new Resolver();
    customResolver.setServers([resolver]);

    return new Promise((resolve, reject) => {
      customResolver.resolveNs(domain, (err, addresses) => {
        if (err) {
          resolve([]); // Return empty on error, don't fail
        } else {
          resolve(addresses || []);
        }
      });
    });
  } catch {
    return [];
  }
}

/**
 * Wait for DNS propagation to specified nameservers
 *
 * Uses Node.js dns module for cross-platform compatibility (no dig required).
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
      const [googleNS, cloudflareNS] = await Promise.all([
        queryNameservers(domain, '8.8.8.8'),
        queryNameservers(domain, '1.1.1.1'),
      ]);

      // Normalize nameservers for comparison (remove trailing dots)
      const normalizeNS = (ns: string) => ns.toLowerCase().replace(/\.$/, '');

      const expectedNormalized = expectedNameservers.map(normalizeNS);

      const googleMatches = expectedNormalized.every((ns) =>
        googleNS.some((gns) => normalizeNS(gns) === ns || normalizeNS(gns).includes(ns))
      );

      const cloudflareMatches = expectedNormalized.every((ns) =>
        cloudflareNS.some((cns) => normalizeNS(cns) === ns || normalizeNS(cns).includes(ns))
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
 * ACM Certificate Validation
 *
 * @param domain - Domain name
 * @param awsProfile - AWS profile name
 * @returns Certificate info if exists and issued, null otherwise
 */
export async function checkACMCertificate(
  domain: string,
  awsProfile?: string
): Promise<{ arn: string; status: string; domainName: string } | null> {
  // Set AWS profile BEFORE creating client
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new ACMClient({
    region: 'us-east-1', // ACM for CloudFront must be in us-east-1
  });

  try {
    const listCommand = new ListCertificatesCommand({});
    const listResponse = await retryAWSCommand(client, listCommand, { maxAttempts: 3 });

    const baseDomain = getBaseDomain(domain);

    const matchingCert = listResponse.CertificateSummaryList?.find(
      (cert: any) =>
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
    const describeResponse = await retryAWSCommand(client, describeCommand, { maxAttempts: 3 });

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
  // Set AWS profile BEFORE creating client
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new CloudFrontClient({
    region: 'us-east-1',
  });

  try {
    const command = new ListDistributionsCommand({});
    const response = await retryAWSCommand(client, command, { maxAttempts: 3 });

    const matchingDist = response.DistributionList?.Items?.find((d: any) =>
      d.Comment?.includes(projectName) && d.Comment?.includes(stage)
    );

    if (!matchingDist) {
      return null;
    }

    // Get full distribution config
    const getCommand = new GetDistributionCommand({
      Id: matchingDist.Id,
    });
    const getResponse = await retryAWSCommand(client, getCommand, { maxAttempts: 3 });

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
 * Route53 DNS Records Validation
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
  // Set AWS profile BEFORE creating client
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new Route53Client({
    region: 'us-east-1',
  });

  try {
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
    });
    const response = await retryAWSCommand(client, command, { maxAttempts: 3 });

    const domainRecord = response.ResourceRecordSets?.find(
      (r: any) =>
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
 * Next.js Server Lambda Validation
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
  // Set AWS profile BEFORE creating client
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new LambdaClient({
    region: awsRegion,
  });

  try {
    const command = new ListFunctionsCommand({});
    const response = await retryAWSCommand(client, command, { maxAttempts: 3 });

    const serverFunction = response.Functions?.find(
      (f: any) =>
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
 * Check for conflicting DNS records (DEP-22 Gap 1)
 *
 * Detects old CNAME/A/AAAA records that may conflict with SST's domain configuration.
 * These records can cause SST to silently skip domain setup.
 *
 * @param domain - Full domain name to check (e.g., 'staging.example.com')
 * @param zoneId - Route53 hosted zone ID
 * @param awsProfile - AWS profile name
 * @returns Conflicting record if found, null otherwise
 */
export async function checkConflictingDNSRecords(
  domain: string,
  zoneId: string,
  awsProfile?: string
): Promise<ResourceRecordSet | null> {
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new Route53Client({
    region: 'us-east-1',
  });

  try {
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
    });
    const response = await retryAWSCommand(client, command, { maxAttempts: 3 });

    // Look for existing A, AAAA, or CNAME records for this domain
    // These could conflict with SST's automatic domain configuration
    const conflictingRecord = response.ResourceRecordSets?.find(
      (r: any) =>
        r.Name === `${domain}.` &&
        (r.Type === 'A' || r.Type === 'AAAA' || r.Type === 'CNAME') &&
        // Ignore alias records (SST creates these)
        !r.AliasTarget
    );

    return conflictingRecord || null;
  } catch (error) {
    throw new Error(
      `Failed to check DNS records for ${domain}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a DNS record from Route53 (DEP-22 Gap 1)
 *
 * @param zoneId - Route53 hosted zone ID
 * @param record - Resource record set to delete
 * @param awsProfile - AWS profile name
 */
export async function deleteDNSRecord(
  zoneId: string,
  record: ResourceRecordSet,
  awsProfile?: string
): Promise<void> {
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new Route53Client({
    region: 'us-east-1',
  });

  try {
    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: record,
          },
        ],
      },
    });

    await retryAWSCommand(client, command, { maxAttempts: 3 });
  } catch (error) {
    throw new Error(
      `Failed to delete DNS record: ${error instanceof Error ? error.message : String(error)}`
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
      return { passed: true, skipped: true };
    }

    if (!sstConfig.usesSstDns) {
      spinner.succeed('✅ Route53 check skipped (not using sst.aws.dns())');
      return { passed: true, skipped: true };
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

    // DEP-25: Warn if using subdomain without explicit zone ID
    // SST auto-detection can fail for subdomains, leading to silent failures
    if (
      sstConfig.usesSstDns &&
      !sstConfig.hasExplicitZone &&
      sstConfig.domainName &&
      sstConfig.domainName.includes('.') &&
      sstConfig.domainName !== sstConfig.baseDomain
    ) {
      console.log(chalk.yellow('\n⚠️  Using sst.aws.dns() without explicit zone ID'));
      console.log(chalk.yellow('   SST auto-detection can fail for subdomains'));
      console.log(chalk.yellow(`   Detected subdomain: ${sstConfig.domainName}`));
      console.log(chalk.yellow('   Recommendation: Specify zone ID explicitly\n'));
      console.log(chalk.gray('   Example:'));
      console.log(chalk.gray('   dns: sst.aws.dns({'));
      console.log(chalk.gray(`     zone: "${zoneInfo.zone.Id?.replace('/hostedzone/', '')}"  // Your Route53 hosted zone ID`));
      console.log(chalk.gray('   })\n'));
    }

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
      return { passed: true, skipped: true };
    }

    // Get zone info if not provided
    let localZoneInfo: Route53ZoneInfo | undefined = zoneInfo || undefined;
    if (!localZoneInfo) {
      const zoneResult = await checkRoute53Zone(sstConfig.baseDomain, config.awsProfile);
      localZoneInfo = zoneResult || undefined;
    }

    if (!localZoneInfo) {
      return { passed: true, skipped: true }; // Already checked in existence validation
    }

    // DEP-22 Gap 1: Check for conflicting DNS records
    // Old CNAME/A records can cause SST to silently skip domain configuration
    if (sstConfig.domainName) {
      try {
        const conflictingRecord = await checkConflictingDNSRecords(
          sstConfig.domainName,
          localZoneInfo.zone.Id || '',
          config.awsProfile
        );

        if (conflictingRecord) {
          console.log(chalk.yellow(`\n⚠️  Existing DNS record found for ${sstConfig.domainName}`));
          console.log(chalk.yellow(`   Type: ${conflictingRecord.Type}`));

          if (conflictingRecord.ResourceRecords && conflictingRecord.ResourceRecords.length > 0) {
            console.log(chalk.yellow(`   Points to: ${conflictingRecord.ResourceRecords[0].Value}`));
          }

          console.log(chalk.yellow(`\n   This may block SST's automatic domain configuration!`));
          console.log(chalk.yellow(`   SST will silently skip domain setup if it detects conflicting records.\n`));

          const response = await prompts({
            type: 'confirm',
            name: 'delete',
            message: 'Delete old DNS record? (SST will recreate it correctly)',
            initial: true,
          });

          if (response.delete) {
            console.log(chalk.cyan('\n🔧 Deleting old DNS record...\n'));
            await deleteDNSRecord(localZoneInfo.zone.Id || '', conflictingRecord, config.awsProfile);
            console.log(chalk.green('✅ Old DNS record deleted - SST can now configure domain properly\n'));
          } else {
            console.log(chalk.yellow('\n⚠️  Keeping old DNS record - deployment may fail or have incomplete domain config\n'));

            const continueResponse = await prompts({
              type: 'confirm',
              name: 'continue',
              message: 'Continue deployment anyway?',
              initial: false,
            });

            if (!continueResponse.continue) {
              return {
                passed: false,
                issue: 'Conflicting DNS record found',
                details: `${conflictingRecord.Type} record exists for ${sstConfig.domainName}`,
                actionRequired: 'Delete conflicting DNS record or update sst.config.ts',
              };
            }
          }
        }
      } catch (error) {
        // Don't block on DNS conflict check failures - log warning and continue
        console.log(chalk.yellow(`⚠️  Could not check for conflicting DNS records: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // Check zone age using our tracking system
    const ageMinutes = getZoneAgeMinutes(projectRoot, sstConfig.baseDomain);
    const isRecent = isZoneRecent(projectRoot, sstConfig.baseDomain, 5);

    if (isRecent && ageMinutes !== null) {
      console.log(chalk.yellow(`\n⚠️  Route53 zone created ${Math.floor(ageMinutes)} minutes ago`));
      console.log(chalk.yellow('   SST may not detect it yet (caching/timing issue)'));
      console.log(chalk.yellow('   Recommendation: Wait 5 minutes after zone creation before first deploy\n'));

      const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Continue deployment anyway? Risk of incomplete domain config',
        initial: false,
      });

      if (!response.continue) {
        return {
          passed: false,
          issue: 'Zone created too recently - waiting for propagation',
          actionRequired: 'Wait 5 minutes after Route53 zone creation',
        };
      }
    }

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
 * Validate override:true requirement (Pre-deployment, DEP-26)
 *
 * Detects when adding domain to existing CloudFront distribution without override:true.
 * SST requires explicit permission to update existing distributions, otherwise it
 * silently ignores domain configuration.
 *
 * Scenario:
 * 1. CloudFront distribution exists WITHOUT custom domain (dev mode)
 * 2. User adds domain configuration to sst.config.ts
 * 3. Without override:true, SST will silently skip domain setup
 *
 * @param config - Project configuration
 * @param stage - Deployment stage
 * @param projectRoot - Project root directory
 * @returns Validation result
 */
export async function validateOverrideRequirement(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<ValidationResult> {
  const spinner = ora('Checking CloudFront override requirement...').start();

  try {
    // Parse SST config
    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
      spinner.succeed('✅ Override check skipped (no domain configured)');
      return { passed: true, skipped: true };
    }

    if (!sstConfig.usesSstDns) {
      spinner.succeed('✅ Override check skipped (not using sst.aws.dns())');
      return { passed: true, skipped: true };
    }

    // Check if CloudFront distribution exists for this stage
    let distribution;
    try {
      distribution = await findCloudFrontDistribution(
        config.projectName,
        stage,
        config.awsProfile
      );
    } catch (error) {
      // If we can't query CloudFront (no AWS creds, etc.), skip check
      spinner.succeed('✅ Override check skipped (cannot query CloudFront)');
      return { passed: true, skipped: true };
    }

    // No existing distribution - override not required for new deployments
    if (!distribution) {
      spinner.succeed('✅ Override not required (new deployment)');
      return { passed: true };
    }

    // Distribution exists WITH domain aliases - no override needed
    if (distribution.aliases && distribution.aliases.length > 0) {
      spinner.succeed('✅ Override not required (distribution has domain configured)');
      return { passed: true };
    }

    // CRITICAL: Distribution exists WITHOUT aliases, user is adding domain
    // Check if override:true is present
    if (!sstConfig.hasOverride) {
      spinner.fail('❌ Domain configuration requires override:true');

      const zoneId = sstConfig.hasExplicitZone
        ? '(your zone ID)'
        : 'Z009045037PQISRABUZ1C';

      return {
        passed: false,
        issue: 'Missing override:true when adding domain to existing distribution',
        details: `Your CloudFront distribution exists without a custom domain, but you're attempting to add one.

SST requires explicit permission to update existing distributions:

  dns: sst.aws.dns({
    zone: "${zoneId}",
    override: true  // Add this
  })

Without override:true, SST will silently ignore your domain config and continue using ${distribution.domainName}.

Resources that WON'T be created without this flag:
- ACM certificate for ${sstConfig.domainName}
- Route53 DNS records
- CloudFront custom domain aliases

Current CloudFront: ${distribution.id}
- Status: ${distribution.status}
- Domain: ${distribution.domainName} (CloudFront default)
- Aliases: None (no custom domain configured)`,
        actionRequired: 'Add override:true to your dns configuration in sst.config.ts',
      };
    }

    spinner.succeed('✅ Override:true present - safe to update distribution');
    return { passed: true };
  } catch (error) {
    spinner.fail('❌ Override requirement check failed');
    return {
      passed: false,
      issue: `Override check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
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

  // Track zone creation for age checks
  trackZoneCreation(projectRoot, sstConfig.baseDomain, zoneInfo.zone.Id || '', config.projectName);

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
 * Validate ACM certificate (Post-deployment)
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
      return { passed: true, skipped: true };
    }

    // Check if ACM certificate exists
    const cert = await checkACMCertificate(sstConfig.domainName, config.awsProfile);

    if (!cert) {
      spinner.fail(`❌ ACM certificate not created for ${sstConfig.domainName}`);
      return {
        passed: false,
        issue: 'SST silently ignored domain configuration',
        details: `Domain configured in sst.config.ts but ACM certificate missing. This usually means:
   1. Conflicting DNS records existed (old CNAME/A records)
   2. Route53 zone was missing or not ready
   3. SST encountered an error but continued deployment`,
        actionRequired: `Check Route53 for conflicts, then: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
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
 * Validate CloudFront domain alias (Post-deployment)
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
      return { passed: true, skipped: true };
    }

    // Find CloudFront distribution
    const dist = await findCloudFrontDistribution(
      config.projectName,
      stage,
      config.awsProfile
    );

    if (!dist) {
      spinner.info('ℹ️  CloudFront distribution not found - skipping alias check');
      return { passed: true, skipped: true }; // Can't validate without distribution
    }

    // Check for dev mode (placeholder.sst.dev origin)
    if (dist.origin === 'placeholder.sst.dev') {
      spinner.fail('❌ CloudFront deployed in dev mode (placeholder origin)');
      return {
        passed: false,
        issue: 'SST deployed in dev mode - domain configuration completely ignored',
        details: `Origin is placeholder.sst.dev instead of real domain.

   This critical failure means:
   1. Route53 zone was missing during deployment, OR
   2. Conflicting DNS records blocked SST from configuring domain, OR
   3. SST encountered errors and fell back to dev mode

   Your application is NOT accessible via the configured domain.`,
        actionRequired: `Fix Route53/DNS issues, then: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
      };
    }

    // Check if domain alias is configured
    if (!dist.aliases.includes(sstConfig.domainName)) {
      spinner.fail(`❌ CloudFront domain alias not configured for ${sstConfig.domainName}`);
      return {
        passed: false,
        issue: 'SST silently ignored domain configuration - CloudFront has no alias',
        details: `Expected: ${sstConfig.domainName}, Got: ${dist.aliases.join(', ') || 'None'}

   This usually means SST skipped domain setup due to:
   1. Conflicting DNS records (old CNAME/A pointing to wrong CloudFront)
   2. Missing ACM certificate
   3. Route53 zone issues`,
        actionRequired: `Check and fix DNS conflicts, then: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
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
 * Validate Route53 DNS records (Post-deployment)
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
      return { passed: true, skipped: true };
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
        issue: 'SST silently ignored domain configuration - DNS records missing',
        details: `Domain configured in sst.config.ts but Route53 records not created.

   This usually means SST skipped domain setup due to:
   1. Conflicting DNS records existed before deployment
   2. ACM certificate was not created
   3. CloudFront deployment failed to configure custom domain`,
        actionRequired: `Check pre-deployment validation logs for DNS conflicts, then: npx sst remove --stage ${stage} && deploy-kit deploy ${stage}`,
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
 * Validate Next.js server Lambda (Post-deployment)
 */
export async function validateNextjsServerLambda(
  config: ProjectConfig,
  stage: DeploymentStage
): Promise<ValidationResult> {
  const spinner = ora('Checking Next.js server Lambda...').start();

  try {
    if (config.infrastructure !== 'sst-serverless') {
      spinner.succeed('✅ Lambda check skipped (non-SST infrastructure)');
      return { passed: true, skipped: true };
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
