/**
 * Pre-Deployment Check Types
 */

/**
 * Configuration for a single pre-deployment check
 */
export interface CheckConfig {
  /** Human-readable name of the check */
  name?: string;
  /** Command to execute */
  command: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Which deployment stages to run this check on */
  stages?: string[];
  /** Whether this check is enabled */
  enabled?: boolean;
}

/**
 * Result of running a single check
 */
export interface CheckResult {
  /** Name of the check */
  name: string;
  /** Whether the check passed */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Combined stdout output */
  output: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Pre-deployment checks configuration
 */
export interface PreDeploymentChecksConfig {
  /** Type checking (TypeScript, Flow, etc.) */
  typecheck?: CheckConfig | boolean;

  /** Unit tests */
  test?: CheckConfig | boolean;

  /** Build verification */
  build?: CheckConfig | boolean;

  /** E2E tests */
  e2e?: CheckConfig | boolean;

  /** Linting */
  lint?: CheckConfig | boolean;

  /** Custom checks */
  custom?: CheckConfig[];
}

/**
 * Summary of all pre-deployment check results
 */
export interface PreDeploymentChecksSummary {
  /** Whether all checks passed */
  allPassed: boolean;
  /** Total duration in milliseconds */
  totalDuration: number;
  /** Individual check results */
  results: CheckResult[];
  /** Number of checks that passed */
  passed: number;
  /** Number of checks that failed */
  failed: number;
}
