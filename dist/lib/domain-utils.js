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
export function extractRootDomain(fullDomain) {
    const parts = fullDomain.split('.');
    if (parts.length > 2) {
        return parts.slice(-2).join('.');
    }
    return fullDomain;
}
/**
 * Validates that a domain name is well-formed
 *
 * @throws {Error} If domain is invalid
 */
export function validateDomain(domain) {
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
        throw new Error(`Invalid domain name: ${domain}`);
    }
}
/**
 * Extracts subdomain from a full domain name
 *
 * @example
 * extractSubdomain('staging.api.example.com', 'example.com') // => 'staging.api'
 * extractSubdomain('example.com', 'example.com') // => ''
 */
export function extractSubdomain(fullDomain, rootDomain) {
    if (fullDomain === rootDomain) {
        return '';
    }
    return fullDomain.replace(`.${rootDomain}`, '');
}
