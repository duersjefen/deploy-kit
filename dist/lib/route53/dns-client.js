import { promisify } from 'util';
import { exec } from 'child_process';
import { extractRootDomain } from '../domain-utils.js';
import { DeploymentError } from '../errors.js';
const execAsync = promisify(exec);
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
    /**
     * Create a new Route53 DNS client
     *
     * @param awsProfile - Optional AWS profile name for authentication
     */
    constructor(awsProfile) {
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
    async getCurrentDNSRecords(domain) {
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
        }
        catch (error) {
            if (error instanceof Error) {
                console.error(`❌ Failed to fetch DNS records: ${error.message}`);
            }
            throw new DeploymentError(`Could not fetch DNS records for ${domain}`, 'DNS_FETCH_FAILED', { domain, error });
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
    async listHostedZones() {
        const env = {
            ...process.env,
            ...(this.awsProfile && { AWS_PROFILE: this.awsProfile }),
        };
        const { stdout } = await execAsync('aws route53 list-hosted-zones --output json', { env });
        const response = JSON.parse(stdout);
        return response.HostedZones.map((zone) => ({
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
    async listRecordSets(zoneId) {
        const env = {
            ...process.env,
            ...(this.awsProfile && { AWS_PROFILE: this.awsProfile }),
        };
        // Remove '/hostedzone/' prefix if present
        const cleanZoneId = zoneId.replace('/hostedzone/', '');
        const { stdout } = await execAsync(`aws route53 list-resource-record-sets --hosted-zone-id ${cleanZoneId} --output json`, { env });
        const response = JSON.parse(stdout);
        return response.ResourceRecordSets.map((record) => ({
            name: record.Name,
            type: record.Type,
            value: record.ResourceRecords?.[0]?.Value || record.AliasTarget?.DNSName || '',
            ttl: record.TTL || 300,
        }));
    }
}
