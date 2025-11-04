/**
 * SST Environment Checks Orchestrator
 * Runs SST-specific checks before deployment with formatted output
 *
 * These are the subset of dev checks that are deployment-relevant:
 * - AWS Credentials
 * - SST Lock
 * - Running SST Processes
 * - SST Config
 * - .sst Directory Health
 * - Lambda Reserved Environment Variables
 * - Pulumi Output Usage
 *
 * Dev-only checks (NOT included):
 * - Port Availability
 * - Recursive SST Dev Script
 * - Next.js Canary Features
 * - Turbopack Migration
 */
import type { ProjectConfig } from '../../types.js';
interface SstChecksSummary {
    allPassed: boolean;
    totalDuration: number;
    results: Array<{
        name: string;
        passed: boolean;
        duration: number;
        error?: string;
    }>;
    passed: number;
    failed: number;
}
/**
 * Run all SST environment checks with formatted output
 *
 * Output format matches pre-deployment checks:
 * - Header with check count
 * - Progress indicators (▶)
 * - Individual check timing
 * - Summary box with results
 * - Total duration
 *
 * DEPLOYMENT BEHAVIOR:
 * - Does NOT auto-fix issues (fail fast for safety)
 * - Stops on first failure
 * - Blocks deployment on any failure
 *
 * NOTE: Individual checks provide their own detailed output
 * (e.g., AWS account info, lock details). The orchestrator
 * adds progress indicators and timing summary.
 */
export declare function runSstEnvironmentChecks(projectRoot: string, config: ProjectConfig | null, stage: string, verbose?: boolean): Promise<SstChecksSummary>;
export {};
//# sourceMappingURL=orchestrator.d.ts.map