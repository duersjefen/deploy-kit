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
export declare class Route53DNSClient {
    private awsProfile?;
    /**
     * Create a new Route53 DNS client
     *
     * @param awsProfile - Optional AWS profile name for authentication
     */
    constructor(awsProfile?: string);
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
    getCurrentDNSRecords(domain: string): Promise<DNSRecord[]>;
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
    listHostedZones(): Promise<HostedZone[]>;
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
    listRecordSets(zoneId: string): Promise<DNSRecord[]>;
}
//# sourceMappingURL=dns-client.d.ts.map