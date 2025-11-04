/**
 * Development Pre-Flight Checks Registry
 * Manages registration and execution of all dev environment checks
 */
import type { ProjectConfig } from '../../types.js';
import type { CheckResult, DevCheck } from './types.js';
/**
 * Create all development pre-flight checks
 */
export declare function getDevChecks(projectRoot: string, config: ProjectConfig | null, requestedPort?: number, verbose?: boolean): DevCheck[];
/**
 * Run all pre-flight checks with hybrid auto-fix approach
 *
 * - Safe fixes: Auto-apply without prompting
 * - Risky fixes: Show issue but require manual intervention
 *
 * Enhanced Output (v2.9.0):
 * - Progress indicators (▶)
 * - Individual check timing
 * - Summary box with results
 * - Total duration
 */
export declare function runDevChecks(projectRoot: string, config: ProjectConfig | null, requestedPort?: number, verbose?: boolean): Promise<{
    allPassed: boolean;
    results: CheckResult[];
}>;
//# sourceMappingURL=registry.d.ts.map