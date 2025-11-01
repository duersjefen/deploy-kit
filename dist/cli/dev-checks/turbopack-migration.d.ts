/**
 * Next.js 16+ Turbopack Migration Check
 * Detects custom webpack configs in projects with Next.js 16+ (which uses Turbopack by default)
 *
 * Next.js 16 made Turbopack the default bundler. Projects with custom webpack configs
 * but no turbopack config will encounter build errors. This check helps with migration.
 */
import type { CheckResult } from './types.js';
export declare function createTurbopackMigrationCheck(projectRoot: string): () => Promise<CheckResult>;
//# sourceMappingURL=turbopack-migration.d.ts.map