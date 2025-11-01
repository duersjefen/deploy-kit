/**
 * CloudFront CLI Commands
 * Audit, analyze, and manage CloudFront distributions
 *
 * Provides CLI interface for managing CloudFront distributions:
 * - Audit: Analyze distributions and detect orphans/misconfigurations
 * - Report: Generate health summary of infrastructure
 * - Cleanup: Safely delete orphaned distributions with confirmation
 */
import type { ProjectConfig } from '../../types.js';
/**
 * Main CloudFront command entry point
 *
 * Routes to appropriate subcommand handler:
 * - audit: Analyze all distributions and detect issues
 * - report: Generate infrastructure health report
 * - cleanup: Delete orphaned distributions (with --dry-run or --force)
 *
 * @param subcommand - One of: audit, report, cleanup
 * @param args - Command line arguments (may include --dry-run, --force)
 * @param config - Project configuration
 * @param projectRoot - Project root directory
 *
 * @example
 * ```typescript
 * await handleCloudFrontCommand('audit', [], config, '/project');
 * ```
 */
export declare function handleCloudFrontCommand(subcommand: string, args: string[], config: ProjectConfig, projectRoot: string): Promise<void>;
//# sourceMappingURL=cloudfront.d.ts.map