/**
 * Type definitions for development environment pre-flight checks
 */

export interface CheckResult {
  passed: boolean;
  issue?: string;
  manualFix?: string;
  canAutoFix?: boolean;
  autoFix?: () => Promise<void>;
  errorType?: string;  // For categorizing safe vs risky fixes
}

export interface DevCheck {
  name: string;
  check: () => Promise<CheckResult>;
}
