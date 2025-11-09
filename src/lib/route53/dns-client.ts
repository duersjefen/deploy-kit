import { promisify } from 'util';
import { exec } from 'child_process';
import { extractRootDomain } from '../domain-utils.js';
import { DeploymentError } from '../errors.js';

const execAsync = promisify(exec);

/**
 * DNS record from Route53
 */
export interface DNSRecord {
  /** Record name (e.g., "staging.example.com") */
  name: string;
  /** Record type (A, AAAA, CNAME, MX, etc.) */
  type: string;
  /** Record value(s) */
  value: string;
  /** Time to live in seconds */
  ttl: number;
}

/**
 * Internal type for AWS CLI JSON response (hosted zone)
 */
interface Route53HostedZoneResponse {
  Id: string;
  Name: string;
  ResourceRecordSetCount?: number;
}

/**
 * Internal type for AWS CLI JSON response (record set)
 */
interface Route53RecordSetResponse {
  Name: string;
  Type: string;
  ResourceRecords?: Array<{ Value: string }>;
  AliasTarget?: { DNSName: string };
  TTL?: number;
}

/**
 * Route53 hosted zone
 */
export interface HostedZone {
  /** Zone ID (e.g., "/hostedzone/Z1234567890ABC") */
  id: string;
  /** Zone name (e.g., "example.com.") */
  name: string;
  /** Number of record sets in the zone */
  recordCount: number;
}

/**
 * Route53 DNS client for fetching DNS records
 *
 * @example
 * ```typescript
 * const client = new Route53DNSClient('my-aws-profile');
 * const records = await client.getCurrentDNSRecords('staging.example.com');
 * console.log(records); // [{ name: 'staging.example.com', type: 'CNAME', ... }]
 * ```
 */
export class Route53DNSClient {
  private awsProfile?: string;

  /**
   * Create a new Route53 DNS client
   *
   * @param awsProfile - Optional AWS profile name for authentication
   */
  constructor(awsProfile?: string) {
    this.awsProfile = awsProfile;
  }

  /**
   * Fetch current DNS records for a domain from Route53
   *
   * Searches for the hosted zone matching the domain's root domain,
   * then retrieves all record sets that match the domain (exact match or wildcard).
   *
   * @param domain - Full domain name (e.g., staging.example.com)
   * @returns Array of DNS records
   * @throws {DeploymentError} If Route53 API call fails
   *
   * @example
   * ```typescript
   * const records = await client.getCurrentDNSRecords('staging.example.com');
   * // Returns:
   * // [
   * //   {name: 'staging.example.com', type: 'CNAME', value: 'd123.cloudfront.net', ttl: 300},
   * //   {name: '*.staging.example.com', type: 'CNAME', value: 'd123.cloudfront.net', ttl: 300}
   * // ]
   * ```
   */
  async getCurrentDNSRecords(domain: string): Promise<DNSRecord[]> {
    console.log(`📋 Fetching DNS records for ${domain}...`);

    try {
      // 1. Find hosted zone for domain
      const rootDomain = extractRootDomain(domain);
      const hostedZones = await this.listHostedZones();

      const zone = hostedZones.find(z => {
        const zoneName = z.name.replace(/\.$/, ''); // Remove trailing dot
        return rootDomain === zoneName;
      });

      if (!zone) {
        console.warn(`⚠️  No hosted zone found for ${rootDomain}`);
        return [];
      }

      // 2. Fetch all record sets for the zone
      const recordSets = await this.listRecordSets(zone.id);

      // 3. Filter records matching the domain (exact match or wildcard)
      const relevantRecords = recordSets.filter(record => {
        const recordName = record.name.replace(/\.$/, '');
        return recordName === domain ||
               recordName === `*.${domain}` ||
               domain.startsWith(recordName);
      });

      return relevantRecords;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Failed to fetch DNS records: ${error.message}`);
      }
      throw new DeploymentError(
        `Could not fetch DNS records for ${domain}`,
        'DNS_FETCH_FAILED',
        { domain, error }
      );
    }
  }

  /**
   * List all hosted zones in Route53
   *
   * @returns Array of hosted zones
   * @throws {Error} If AWS CLI command fails
   *
   * @example
   * ```typescript
   * const zones = await client.listHostedZones();
   * // Returns: [{id: '/hostedzone/Z123', name: 'example.com.', recordCount: 5}]
   * ```
   */
  async listHostedZones(): Promise<HostedZone[]> {
    const env = {
      ...process.env,
      ...(this.awsProfile && { AWS_PROFILE: this.awsProfile }),
    };

    const { stdout } = await execAsync(
      'aws route53 list-hosted-zones --output json',
      { env }
    );

    const response = JSON.parse(stdout) as { HostedZones: Route53HostedZoneResponse[] };
    return response.HostedZones.map((zone: Route53HostedZoneResponse) => ({
      id: zone.Id,
      name: zone.Name,
      recordCount: zone.ResourceRecordSetCount || 0,
    }));
  }

  /**
   * List all record sets for a hosted zone
   *
   * @param zoneId - Hosted zone ID (e.g., "/hostedzone/Z1234567890ABC")
   * @returns Array of DNS records
   * @throws {Error} If AWS CLI command fails
   *
   * @example
   * ```typescript
   * const records = await client.listRecordSets('/hostedzone/Z123');
   * // Returns: [{name: 'example.com', type: 'A', value: '1.2.3.4', ttl: 300}]
   * ```
   */
  async listRecordSets(zoneId: string): Promise<DNSRecord[]> {
    const env = {
      ...process.env,
      ...(this.awsProfile && { AWS_PROFILE: this.awsProfile }),
    };

    // Remove '/hostedzone/' prefix if present
    const cleanZoneId = zoneId.replace('/hostedzone/', '');

    const { stdout } = await execAsync(
      `aws route53 list-resource-record-sets --hosted-zone-id ${cleanZoneId} --output json`,
      { env }
    );

    const response = JSON.parse(stdout) as { ResourceRecordSets: Route53RecordSetResponse[] };
    return response.ResourceRecordSets.map((record: Route53RecordSetResponse) => ({
      name: record.Name,
      type: record.Type,
      value: record.ResourceRecords?.[0]?.Value || record.AliasTarget?.DNSName || '',
      ttl: record.TTL || 300,
    }));
  }

  /**
   * Delete a CNAME record from Route53 (DEP-43)
   * Removes CNAME records that prevent SST from creating A/AAAA alias records
   *
   * @param zoneId - Hosted zone ID
   * @param domain - Domain name with the CNAME record
   * @param cnameValue - Current CNAME record value
   * @param ttl - TTL of the CNAME record
   * @throws {Error} If AWS CLI command fails
   *
   * @example
   * ```typescript
   * await client.deleteCnameRecord('Z123', 'staging.example.com', 'd123.cloudfront.net', 300);
   * ```
   */
  async deleteCnameRecord(
    zoneId: string,
    domain: string,
    cnameValue: string,
    ttl: number
  ): Promise<void> {
    const env = {
      ...process.env,
      ...(this.awsProfile && { AWS_PROFILE: this.awsProfile }),
    };

    // Remove '/hostedzone/' prefix if present
    const cleanZoneId = zoneId.replace('/hostedzone/', '');

    // Build the change batch JSON
    const changeBatch = JSON.stringify({
      Changes: [
        {
          Action: 'DELETE',
          ResourceRecordSet: {
            Name: domain,
            Type: 'CNAME',
            TTL: ttl,
            ResourceRecords: [{ Value: cnameValue }],
          },
        },
      ],
    });

    try {
      await execAsync(
        `aws route53 change-resource-record-sets --hosted-zone-id ${cleanZoneId} --change-batch '${changeBatch}'`,
        { env }
      );
    } catch (error) {
      throw new Error(
        `Failed to delete CNAME record for ${domain}: ${(error as Error).message}`
      );
    }
  }
}
