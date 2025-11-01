/**
 * Global constants and configuration defaults
 */
/**
 * SST deployment configuration
 */
export declare const SST_DEPLOYMENT: {
    /** Maximum lines of SST output to show in real-time */
    readonly MAX_OUTPUT_LINES: 4;
    /** Maximum retries for failed deployments */
    readonly MAX_RETRIES: 3;
    /** Delay between retries in milliseconds */
    readonly RETRY_DELAY_MS: 5000;
    /** Timeout for SST deployment in milliseconds (30 minutes) */
    readonly TIMEOUT_MS: number;
};
/**
 * CloudFront configuration
 */
export declare const CLOUDFRONT: {
    /** Maximum time to wait for cache invalidation (5 minutes) */
    readonly INVALIDATION_TIMEOUT_MS: number;
    /** Polling interval for invalidation status (10 seconds) */
    readonly INVALIDATION_POLL_INTERVAL_MS: number;
    /** Maximum distributions to list per API call */
    readonly MAX_DISTRIBUTIONS: 100;
};
/**
 * Deployment locking configuration
 */
export declare const DEPLOYMENT_LOCK: {
    /** Maximum time a lock is valid (5 minutes) */
    readonly TIMEOUT_MS: number;
    /** Lock file name */
    readonly FILENAME: ".deployment-lock.json";
};
/**
 * Route53 DNS configuration
 */
export declare const ROUTE53: {
    /** Time to wait for DNS propagation (60 seconds) */
    readonly PROPAGATION_WAIT_MS: number;
    /** Maximum record sets to fetch per request */
    readonly MAX_RECORD_SETS: 300;
};
/**
 * Health check configuration
 */
export declare const HEALTH_CHECK: {
    /** Timeout for health check requests (10 seconds) */
    readonly TIMEOUT_MS: number;
    /** Maximum retries for failed health checks */
    readonly MAX_RETRIES: 3;
    /** Delay between health check retries (2 seconds) */
    readonly RETRY_DELAY_MS: 2000;
};
//# sourceMappingURL=constants.d.ts.map