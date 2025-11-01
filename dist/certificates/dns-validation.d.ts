/**
 * DNS Validation helpers for ACM certificates
 * Handles Route 53 CNAME record validation
 */
export interface DNSRecord {
    name: string;
    value: string;
    type: string;
}
/**
 * Get the hosted zone ID for a domain
 */
export declare function getHostedZoneId(domain: string, awsProfile?: string): Promise<string | null>;
/**
 * Add CNAME validation record to Route 53
 */
export declare function addValidationRecord(zoneId: string, record: DNSRecord, awsProfile?: string): Promise<boolean>;
/**
 * Check if DNS record has propagated
 */
export declare function checkDNSPropagation(recordName: string, recordValue: string): Promise<boolean>;
/**
 * Wait for DNS record to propagate
 */
export declare function waitForDNSPropagation(recordName: string, recordValue: string, maxWaitSeconds?: number): Promise<boolean>;
/**
 * Show validation record to user in a friendly format
 */
export declare function formatValidationRecord(record: DNSRecord): string;
/**
 * Show validation instructions to user
 */
export declare function showValidationInstructions(record: DNSRecord, domain: string): void;
//# sourceMappingURL=dns-validation.d.ts.map