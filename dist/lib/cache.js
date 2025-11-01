/**
 * Simple in-memory cache with TTL (Time To Live)
 *
 * Provides a lightweight caching layer for AWS API responses and other
 * frequently-accessed data. Uses native JavaScript Map with automatic expiration.
 *
 * Features:
 * - TTL-based expiration (default: 5 minutes)
 * - Automatic cleanup of expired entries
 * - Zero external dependencies
 * - Type-safe with TypeScript generics
 *
 * @example
 * ```typescript
 * const cache = new SimpleCache<string>(300000); // 5 min TTL
 * cache.set('key', 'value');
 * const value = cache.get('key'); // 'value'
 * // After 5 minutes:
 * const expired = cache.get('key'); // null
 * ```
 */
export class SimpleCache {
    /**
     * Create a new cache instance
     *
     * @param defaultTTL - Default time-to-live in milliseconds (default: 5 minutes)
     *
     * @example
     * ```typescript
     * const cache = new SimpleCache<CloudFrontDistribution>(300000);
     * ```
     */
    constructor(defaultTTL = 300000) {
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
    }
    /**
     * Store a value in cache with optional custom TTL
     *
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttl - Optional custom TTL in milliseconds
     *
     * @example
     * ```typescript
     * cache.set('dist-123', distribution);
     * cache.set('temp-data', data, 60000); // 1 min TTL
     * ```
     */
    set(key, value, ttl) {
        const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
        this.cache.set(key, { value, expiresAt });
    }
    /**
     * Retrieve a value from cache
     *
     * Returns null if key doesn't exist or has expired.
     * Automatically removes expired entries.
     *
     * @param key - Cache key
     * @returns Cached value or null if not found/expired
     *
     * @example
     * ```typescript
     * const dist = cache.get('dist-123');
     * if (dist) {
     *   console.log('Cache hit:', dist.Id);
     * } else {
     *   console.log('Cache miss - fetching from AWS');
     * }
     * ```
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    /**
     * Check if a key exists in cache (and is not expired)
     *
     * @param key - Cache key
     * @returns True if key exists and is not expired
     *
     * @example
     * ```typescript
     * if (cache.has('dist-123')) {
     *   console.log('Data is cached');
     * }
     * ```
     */
    has(key) {
        return this.get(key) !== null;
    }
    /**
     * Delete a specific key from cache
     *
     * @param key - Cache key
     * @returns True if key was deleted, false if it didn't exist
     *
     * @example
     * ```typescript
     * cache.delete('dist-123'); // Invalidate after deployment
     * ```
     */
    delete(key) {
        return this.cache.delete(key);
    }
    /**
     * Clear all entries from cache
     *
     * @example
     * ```typescript
     * cache.clear(); // Reset cache after deployment
     * ```
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Remove all expired entries from cache
     *
     * This is automatically called on get(), but can be called manually
     * for proactive memory management.
     *
     * @returns Number of entries removed
     *
     * @example
     * ```typescript
     * const removed = cache.cleanup();
     * console.log(`Removed ${removed} expired entries`);
     * ```
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                removed++;
            }
        }
        return removed;
    }
    /**
     * Get cache statistics
     *
     * @returns Object with cache size and expired entry count
     *
     * @example
     * ```typescript
     * const stats = cache.stats();
     * console.log(`Cache: ${stats.size} entries, ${stats.expired} expired`);
     * ```
     */
    stats() {
        const now = Date.now();
        let expired = 0;
        for (const entry of this.cache.values()) {
            if (now > entry.expiresAt) {
                expired++;
            }
        }
        return {
            size: this.cache.size,
            expired,
        };
    }
    /**
     * Get or set pattern - fetch from cache or compute and store
     *
     * Common pattern for caching: try to get from cache, if miss then compute,
     * store in cache, and return.
     *
     * @param key - Cache key
     * @param fetcher - Function to compute value if cache miss
     * @param ttl - Optional custom TTL
     * @returns Cached or freshly computed value
     *
     * @example
     * ```typescript
     * const dist = await cache.getOrSet(
     *   'dist-123',
     *   async () => await fetchDistributionFromAWS('dist-123')
     * );
     * ```
     */
    async getOrSet(key, fetcher, ttl) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }
        const value = await fetcher();
        this.set(key, value, ttl);
        return value;
    }
}
/**
 * Create a cache key from multiple parts
 *
 * Utility function to generate consistent cache keys.
 *
 * @param parts - Parts to join into cache key
 * @returns Cache key string
 *
 * @example
 * ```typescript
 * const key = cacheKey('cloudfront', 'dist', 'E123ABC456');
 * // Returns: 'cloudfront:dist:E123ABC456'
 * ```
 */
export function cacheKey(...parts) {
    return parts.filter(Boolean).join(':');
}
