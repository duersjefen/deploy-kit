/**
 * Development Pre-Flight Checks Registry
 * Manages registration and execution of all dev environment checks
 */
import type { ProjectConfig } from '../../types.js';
import type { CheckResult, DevCheck } from './types.js';
/**
 * Create all development pre-flight checks
 */
export declare function getDevChecks(projectRoot: string, config: ProjectConfig | null, requestedPort?: number): DevCheck[];
/**
 * Run all pre-flight checks with hybrid auto-fix approach
 *
 * - Safe fixes: Auto-apply without prompting
 * - Risky fixes: Show issue but require manual intervention
 */
export declare function runDevChecks(projectRoot: string, config: ProjectConfig | null, requestedPort?: number): Promise<{
    allPassed: boolean;
    results: CheckResult[];
}>;
//# sourceMappingURL=registry.d.ts.map