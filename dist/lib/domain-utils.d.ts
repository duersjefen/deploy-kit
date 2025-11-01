/**
 * Domain name utilities for DNS and CloudFront operations
 */
/**
 * Extracts the root domain from a full domain name
 *
 * @example
 * extractRootDomain('staging.api.example.com') // => 'example.com'
 * extractRootDomain('example.com') // => 'example.com'
 * extractRootDomain('example.co.uk') // => 'co.uk' (note: doesn't handle TLDs)
 */
export declare function extractRootDomain(fullDomain: string): string;
/**
 * Validates that a domain name is well-formed
 *
 * @throws {Error} If domain is invalid
 */
export declare function validateDomain(domain: string): void;
/**
 * Extracts subdomain from a full domain name
 *
 * @example
 * extractSubdomain('staging.api.example.com', 'example.com') // => 'staging.api'
 * extractSubdomain('example.com', 'example.com') // => ''
 */
export declare function extractSubdomain(fullDomain: string, rootDomain: string): string;
//# sourceMappingURL=domain-utils.d.ts.map