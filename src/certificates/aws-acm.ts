/**
 * AWS ACM (AWS Certificate Manager) API wrapper
 * Handles certificate creation, lookup, and status checking
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { DeploymentStage } from '../types.js';

const execAsync = promisify(exec);

export interface CertificateInfo {
  arn: string;
  domain: string;
  status: 'ISSUED' | 'PENDING_VALIDATION' | 'FAILED' | 'INACTIVE';
  validationRecords: ValidationRecord[];
  createdAt: Date;
}

export interface ValidationRecord {
  name: string;
  value: string;
  type: 'CNAME' | 'DNS';
}

/**
 * Find existing certificate by domain name
 */
export async function findCertificateByDomain(
  domain: string,
  awsProfile?: string
): Promise<CertificateInfo | null> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';
    const command = `aws acm list-certificates ${profileArg} --certificate-statuses ISSUED PENDING_VALIDATION --region us-east-1 --output json`;

    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);

    if (!result.CertificateSummaryList || result.CertificateSummaryList.length === 0) {
      return null;
    }

    // Find matching certificate
    for (const cert of result.CertificateSummaryList) {
      const details = await describeCertificate(cert.CertificateArn, awsProfile);

      if (details && details.DomainName === domain) {
        return {
          arn: cert.CertificateArn,
          domain: details.DomainName,
          status: details.Status,
          validationRecords: extractValidationRecords(details),
          createdAt: new Date(details.CreatedAt),
        };
      }
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to find certificate for ${domain}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create new ACM certificate
 */
export async function createCertificate(
  domain: string,
  awsProfile?: string
): Promise<CertificateInfo> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';
    const command = `aws acm request-certificate \
      --domain-name ${domain} \
      --subject-alternative-names ${domain} \
      --validation-method DNS \
      --region us-east-1 \
      ${profileArg} \
      --output json`;

    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);
    const arn = result.CertificateArn;

    // Wait a moment for AWS to register the certificate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch details
    const details = await describeCertificate(arn, awsProfile);
    if (!details) {
      throw new Error('Failed to retrieve created certificate details');
    }

    return {
      arn,
      domain: details.DomainName,
      status: details.Status,
      validationRecords: extractValidationRecords(details),
      createdAt: new Date(details.CreatedAt),
    };
  } catch (error) {
    throw new Error(`Failed to create certificate for ${domain}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get certificate details
 */
export async function describeCertificate(
  arn: string,
  awsProfile?: string
): Promise<any> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';
    const command = `aws acm describe-certificate \
      --certificate-arn ${arn} \
      --region us-east-1 \
      ${profileArg} \
      --output json`;

    const { stdout } = await execAsync(command);
    return JSON.parse(stdout).Certificate;
  } catch (error) {
    throw new Error(`Failed to describe certificate ${arn}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Wait for certificate to be issued
 */
export async function waitForCertificateIssuance(
  arn: string,
  maxWaitSeconds: number = 300,
  awsProfile?: string
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    try {
      const details = await describeCertificate(arn, awsProfile);

      if (details.Status === 'ISSUED') {
        return true;
      }

      if (details.Status === 'FAILED') {
        throw new Error(`Certificate issuance failed: ${details.FailureReason || 'Unknown reason'}`);
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && error.message.includes('Certificate issuance failed')) {
        throw error;
      }
      // Ignore temporary errors, keep polling
    }
  }

  return false;
}

/**
 * Extract DNS validation records from certificate details
 */
function extractValidationRecords(certDetails: any): ValidationRecord[] {
  const records: ValidationRecord[] = [];

  if (certDetails.DomainValidationOptions) {
    for (const option of certDetails.DomainValidationOptions) {
      if (option.ResourceRecord) {
        records.push({
          name: option.ResourceRecord.Name,
          value: option.ResourceRecord.Value,
          type: 'CNAME',
        });
      }
    }
  }

  return records;
}

/**
 * List all certificates for a given stage
 */
export async function listCertificatesForStage(
  stage: DeploymentStage,
  awsProfile?: string
): Promise<CertificateInfo[]> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';
    const command = `aws acm list-certificates ${profileArg} --certificate-statuses ISSUED PENDING_VALIDATION --region us-east-1 --output json`;

    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);

    const certificates: CertificateInfo[] = [];

    if (result.CertificateSummaryList) {
      for (const cert of result.CertificateSummaryList) {
        const details = await describeCertificate(cert.CertificateArn, awsProfile);
        if (details) {
          certificates.push({
            arn: cert.CertificateArn,
            domain: details.DomainName,
            status: details.Status,
            validationRecords: extractValidationRecords(details),
            createdAt: new Date(details.CreatedAt),
          });
        }
      }
    }

    return certificates;
  } catch (error) {
    throw new Error(`Failed to list certificates: ${error instanceof Error ? error.message : String(error)}`);
  }
}
