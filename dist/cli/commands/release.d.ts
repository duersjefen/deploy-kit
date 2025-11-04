/**
 * Release Command - TypeScript implementation
 *
 * Handles package versioning, testing, and publishing with full safety checks.
 * Replaces the bash release script with a type-safe, testable implementation.
 */
export type ReleaseType = 'patch' | 'minor' | 'major';
export interface ReleaseOptions {
    type: ReleaseType;
    dryRun?: boolean;
    skipTests?: boolean;
    cwd?: string;
}
/**
 * Main release function
 */
export declare function handleReleaseCommand(options: ReleaseOptions): Promise<void>;
//# sourceMappingURL=release.d.ts.map