/**
 * Version utility for reading package version
 */
/**
 * Get the current version of deploy-kit from package.json
 *
 * Reads package.json from the dist directory (one level up from compiled code).
 * Falls back to "unknown" if package.json cannot be read.
 *
 * @returns Version string (e.g., "2.8.4") or "unknown"
 *
 * @example
 * ```typescript
 * const version = getVersion();
 * console.log(`deploy-kit ${version}`); // deploy-kit 2.8.4
 * ```
 */
export declare function getVersion(): string;
/**
 * Get formatted version string for CLI output
 *
 * Returns version in the format "v2.8.4" with v prefix.
 *
 * @returns Formatted version string (e.g., "v2.8.4")
 *
 * @example
 * ```typescript
 * const version = getFormattedVersion();
 * console.log(`Deploy-Kit ${version}`); // Deploy-Kit v2.8.4
 * ```
 */
export declare function getFormattedVersion(): string;
//# sourceMappingURL=version.d.ts.map