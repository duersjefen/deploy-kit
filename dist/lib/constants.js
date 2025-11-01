/**
 * Global constants and configuration defaults
 */
/**
 * SST deployment configuration
 */
export const SST_DEPLOYMENT = {
    /** Maximum lines of SST output to show in real-time */
    MAX_OUTPUT_LINES: 4,
    /** Maximum retries for failed deployments */
    MAX_RETRIES: 3,
    /** Delay between retries in milliseconds */
    RETRY_DELAY_MS: 5000,
    /** Timeout for SST deployment in milliseconds (30 minutes) */
    TIMEOUT_MS: 30 * 60 * 1000,
};
/**
 * CloudFront configuration
 */
export const CLOUDFRONT = {
    /** Maximum time to wait for cache invalidation (5 minutes) */
    INVALIDATION_TIMEOUT_MS: 5 * 60 * 1000,
    /** Polling interval for invalidation status (10 seconds) */
    INVALIDATION_POLL_INTERVAL_MS: 10 * 1000,
    /** Maximum distributions to list per API call */
    MAX_DISTRIBUTIONS: 100,
};
/**
 * Deployment locking configuration
 */
export const DEPLOYMENT_LOCK = {
    /** Maximum time a lock is valid (5 minutes) */
    TIMEOUT_MS: 5 * 60 * 1000,
    /** Lock file name */
    FILENAME: '.deployment-lock.json',
};
/**
 * Route53 DNS configuration
 */
export const ROUTE53 = {
    /** Time to wait for DNS propagation (60 seconds) */
    PROPAGATION_WAIT_MS: 60 * 1000,
    /** Maximum record sets to fetch per request */
    MAX_RECORD_SETS: 300,
};
/**
 * Health check configuration
 */
export const HEALTH_CHECK = {
    /** Timeout for health check requests (10 seconds) */
    TIMEOUT_MS: 10 * 1000,
    /** Maximum retries for failed health checks */
    MAX_RETRIES: 3,
    /** Delay between health check retries (2 seconds) */
    RETRY_DELAY_MS: 2000,
};
