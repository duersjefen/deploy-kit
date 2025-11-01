/**
 * Port Availability Check with Auto-Increment
 * Ensures required ports are not already in use, with graceful fallback to next available port
 */
import type { CheckResult } from './types.js';
interface PortInfo {
    port: number;
    available: boolean;
    pids?: string[];
    processes?: string[];
}
/**
 * Find first available port in range, with auto-increment
 *
 * @param startPort - Starting port to check (default: 3000)
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Port info for first available port, or null if all exhausted
 */
export declare function findAvailablePort(startPort?: number, maxAttempts?: number): PortInfo | null;
/**
 * Create port availability check with auto-increment support
 *
 * Behavior:
 * - If port available: Pass silently
 * - If port in use: Auto-increment to next available (3000 → 3001 → 3002...)
 * - If all ports exhausted (3000-3009): Fail with detailed process info
 */
export declare function createPortAvailabilityCheck(requestedPort?: number): () => Promise<CheckResult>;
export {};
//# sourceMappingURL=port-availability.d.ts.map