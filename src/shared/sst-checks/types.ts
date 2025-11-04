/**
 * Type definitions for SST environment checks
 * Used in both dev and deployment contexts
 */

export interface SstCheckResult {
  passed: boolean;
  issue?: string;
  manualFix?: string;
  canAutoFix?: boolean;
  autoFix?: () => Promise<void>;
  errorType?: string;  // For categorizing safe vs risky fixes
}

export interface SstCheck {
  name: string;
  check: () => Promise<SstCheckResult>;
}
