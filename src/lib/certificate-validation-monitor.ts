/**
 * Certificate Validation Monitor
 *
 * Monitors ACM certificate validation status and waits for ISSUED state.
 * Critical for preventing deployment failures due to pending certificate validation.
 *
 * Based on AWS best practices:
 * - Certificates for CloudFront MUST be in us-east-1
 * - Validation can take 5-30 minutes
 * - DNS validation is automatic but can get "stuck"
 *
 * @module certificate-validation-monitor
 */

import {
  ACMClient,
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from '@aws-sdk/client-acm';
import chalk from 'chalk';
import ora from 'ora';
import { retryAWSCommand } from './aws-retry.js';

/**
 * Certificate validation status
 */
export type CertificateStatus =
  | 'PENDING_VALIDATION'
  | 'ISSUED'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'VALIDATION_TIMED_OUT'
  | 'REVOKED'
  | 'FAILED';

/**
 * Certificate validation result
 */
export interface CertificateValidationResult {
  passed: boolean;
  certificateArn?: string;
  status?: CertificateStatus;
  domainName?: string;
  validationMethod?: string;
  validationRecords?: Array<{
    name: string;
    type: string;
    value: string;
    status: string;
  }>;
  message: string;
  waitedMinutes?: number;
}

/**
 * Find ACM certificate for domain
 *
 * @param domain - Domain name (e.g., 'staging.example.com')
 * @param awsProfile - AWS profile to use
 * @returns Certificate ARN if found, null otherwise
 */
async function findCertificate(
  domain: string,
  awsProfile?: string
): Promise<{ arn: string; status: CertificateStatus } | null> {
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new ACMClient({
    region: 'us-east-1', // CloudFront certificates MUST be in us-east-1
  });

  try {
    const listCommand = new ListCertificatesCommand({});
    const listResponse = await retryAWSCommand(client, listCommand, { maxAttempts: 3 });

    // Extract base domain for wildcard matching
    const baseDomain = domain.split('.').slice(-2).join('.');

    // Find matching certificate (exact match, wildcard, or base domain)
    const matchingCert = listResponse.CertificateSummaryList?.find(
      cert =>
        cert.DomainName === domain ||
        cert.DomainName === `*.${baseDomain}` ||
        cert.DomainName === baseDomain
    );

    if (!matchingCert || !matchingCert.CertificateArn) {
      return null;
    }

    return {
      arn: matchingCert.CertificateArn,
      status: (matchingCert.Status as CertificateStatus) || 'PENDING_VALIDATION',
    };
  } catch (error) {
    console.log(
      chalk.yellow(
        `⚠️  Could not query ACM: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return null;
  }
}

/**
 * Get detailed certificate information
 */
async function getCertificateDetails(
  certificateArn: string,
  awsProfile?: string
): Promise<{
  status: CertificateStatus;
  domainName: string;
  validationMethod: string;
  validationRecords: Array<{
    name: string;
    type: string;
    value: string;
    status: string;
  }>;
} | null> {
  if (awsProfile) {
    process.env.AWS_PROFILE = awsProfile;
  }

  const client = new ACMClient({
    region: 'us-east-1',
  });

  try {
    const describeCommand = new DescribeCertificateCommand({
      CertificateArn: certificateArn,
    });

    const response = await retryAWSCommand(client, describeCommand, { maxAttempts: 3 });

    if (!response.Certificate) {
      return null;
    }

    const cert = response.Certificate;

    const validationRecords =
      cert.DomainValidationOptions?.map(opt => ({
        name: opt.ResourceRecord?.Name || '',
        type: opt.ResourceRecord?.Type || '',
        value: opt.ResourceRecord?.Value || '',
        status: opt.ValidationStatus || 'PENDING',
      })) || [];

    return {
      status: (cert.Status as CertificateStatus) || 'PENDING_VALIDATION',
      domainName: cert.DomainName || '',
      validationMethod: cert.Type || 'DNS',
      validationRecords,
    };
  } catch (error) {
    console.log(
      chalk.yellow(
        `⚠️  Could not get certificate details: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return null;
  }
}

/**
 * Wait for ACM certificate to be validated and issued
 *
 * Polls certificate status every 30 seconds for up to 30 minutes.
 * Shows validation progress and DNS records to user.
 *
 * @param domain - Domain name
 * @param awsProfile - AWS profile
 * @param maxWaitMinutes - Maximum wait time in minutes (default: 30)
 * @returns Validation result
 */
export async function waitForCertificateValidation(
  domain: string,
  awsProfile?: string,
  maxWaitMinutes: number = 30
): Promise<CertificateValidationResult> {
  const spinner = ora(`Checking ACM certificate for ${domain}...`).start();

  // First, find the certificate
  const cert = await findCertificate(domain, awsProfile);

  if (!cert) {
    spinner.info(chalk.gray(`ℹ️  No ACM certificate found for ${domain}`));

    return {
      passed: false,
      message: `No ACM certificate exists for ${domain}. SST will create one during deployment.`,
    };
  }

  spinner.text = `Found certificate ${cert.arn.split('/')[1]}...`;

  // Get certificate details
  const details = await getCertificateDetails(cert.arn, awsProfile);

  if (!details) {
    spinner.fail(chalk.red(`❌ Could not get certificate details`));

    return {
      passed: false,
      certificateArn: cert.arn,
      message: 'Failed to retrieve certificate details',
    };
  }

  // If already issued, great!
  if (details.status === 'ISSUED') {
    spinner.succeed(chalk.green(`✅ Certificate is already issued`));

    return {
      passed: true,
      certificateArn: cert.arn,
      status: 'ISSUED',
      domainName: details.domainName,
      validationMethod: details.validationMethod,
      message: 'Certificate is valid and ready to use',
    };
  }

  // If in bad state, fail immediately
  if (['VALIDATION_TIMED_OUT', 'REVOKED', 'FAILED', 'EXPIRED', 'INACTIVE'].includes(details.status)) {
    spinner.fail(chalk.red(`❌ Certificate is in ${details.status} state`));

    return {
      passed: false,
      certificateArn: cert.arn,
      status: details.status,
      domainName: details.domainName,
      message: `Certificate validation failed: ${details.status}`,
    };
  }

  // Certificate is PENDING_VALIDATION - wait for it
  spinner.text = `Waiting for certificate validation (${details.status})...`;

  console.log(chalk.cyan('\n📋 Certificate Validation Details:'));
  console.log(chalk.gray(`   Domain: ${details.domainName}`));
  console.log(chalk.gray(`   Method: ${details.validationMethod}`));
  console.log(chalk.gray(`   Status: ${details.status}`));

  if (details.validationRecords.length > 0) {
    console.log(chalk.cyan('\n🔐 DNS Validation Records:'));
    details.validationRecords.forEach((record, i) => {
      console.log(chalk.gray(`   ${i + 1}. ${record.name}`));
      console.log(chalk.gray(`      Type: ${record.type}`));
      console.log(chalk.gray(`      Value: ${record.value.substring(0, 50)}...`));
      console.log(chalk.gray(`      Status: ${record.status}\n`));
    });
  }

  console.log(
    chalk.yellow(
      `⏳ Waiting for certificate validation... (max ${maxWaitMinutes} minutes)\n`
    )
  );
  console.log(
    chalk.gray('   AWS ACM will automatically validate via DNS records.')
  );
  console.log(
    chalk.gray('   This usually takes 5-30 minutes on first deployment.\n')
  );

  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const pollInterval = 30000; // 30 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);

    spinner.text = `Waiting for certificate validation... (${elapsedMinutes}/${maxWaitMinutes} min)`;

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    // Check certificate status
    const currentDetails = await getCertificateDetails(cert.arn, awsProfile);

    if (!currentDetails) {
      continue; // Retry on error
    }

    if (currentDetails.status === 'ISSUED') {
      const waitedMinutes = Math.ceil((Date.now() - startTime) / 60000);

      spinner.succeed(
        chalk.green(`✅ Certificate validated and issued (waited ${waitedMinutes} min)`)
      );

      return {
        passed: true,
        certificateArn: cert.arn,
        status: 'ISSUED',
        domainName: currentDetails.domainName,
        validationMethod: currentDetails.validationMethod,
        validationRecords: currentDetails.validationRecords,
        message: `Certificate validated successfully after ${waitedMinutes} minutes`,
        waitedMinutes,
      };
    }

    if (['VALIDATION_TIMED_OUT', 'REVOKED', 'FAILED'].includes(currentDetails.status)) {
      spinner.fail(chalk.red(`❌ Certificate validation failed: ${currentDetails.status}`));

      return {
        passed: false,
        certificateArn: cert.arn,
        status: currentDetails.status,
        domainName: currentDetails.domainName,
        validationMethod: currentDetails.validationMethod,
        validationRecords: currentDetails.validationRecords,
        message: `Certificate validation failed with status: ${currentDetails.status}`,
      };
    }
  }

  // Timeout
  const waitedMinutes = Math.ceil((Date.now() - startTime) / 60000);

  spinner.fail(
    chalk.red(`❌ Certificate validation timeout (waited ${waitedMinutes} min)`)
  );

  return {
    passed: false,
    certificateArn: cert.arn,
    status: details.status,
    domainName: details.domainName,
    validationMethod: details.validationMethod,
    validationRecords: details.validationRecords,
    message: `Certificate still pending validation after ${waitedMinutes} minutes`,
    waitedMinutes,
  };
}

/**
 * Quick certificate status check (non-blocking)
 *
 * Just checks current status without waiting.
 *
 * @param domain - Domain name
 * @param awsProfile - AWS profile
 * @returns Current certificate status
 */
export async function checkCertificateStatus(
  domain: string,
  awsProfile?: string
): Promise<{
  exists: boolean;
  status?: CertificateStatus;
  arn?: string;
  message: string;
}> {
  const cert = await findCertificate(domain, awsProfile);

  if (!cert) {
    return {
      exists: false,
      message: `No ACM certificate found for ${domain}`,
    };
  }

  return {
    exists: true,
    status: cert.status,
    arn: cert.arn,
    message: `Certificate status: ${cert.status}`,
  };
}
