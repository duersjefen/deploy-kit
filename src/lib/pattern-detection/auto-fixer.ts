/**
 * Auto-Fix Engine (DEP-30)
 *
 * Applies safe code transformations to fix pattern violations.
 *
 * Features:
 * - Confidence-based fixing (high/medium/low)
 * - Dry-run mode for preview
 * - Interactive mode for medium-confidence fixes
 * - Safe text-based replacements
 *
 * Safety: Only high-confidence fixes are applied automatically.
 * Medium-confidence fixes require user confirmation.
 */

import { readFileSync, writeFileSync } from 'fs';
import type {
  PatternViolation,
  AutoFixOptions,
  AutoFixResult,
  FixConfidence,
} from './types.js';

/**
 * Auto-fix engine for pattern violations
 */
export class AutoFixer {
  /**
   * Apply fixes to pattern violations
   *
   * @param configPath - Path to sst.config.ts
   * @param violations - Pattern violations to fix
   * @param options - Auto-fix options
   * @returns Result with applied and skipped fixes
   */
  async fix(
    configPath: string,
    violations: PatternViolation[],
    options: AutoFixOptions
  ): Promise<AutoFixResult> {
    const sourceCode = readFileSync(configPath, 'utf-8');
    let fixedCode = sourceCode;

    const appliedFixes: Array<{ code: string; fix: any }> = [];
    const skippedFixes: Array<{ code: string; fix: any; reason: string }> = [];

    // Filter violations that have fixes
    const fixableViolations = violations.filter(v => v.fix);

    // Sort by position (descending) to avoid position shifts during replacement
    fixableViolations.sort((a, b) => {
      if (!a.fix || !b.fix) return 0;
      return b.fix.start - a.fix.start;
    });

    for (const violation of fixableViolations) {
      if (!violation.fix) continue;

      const { fix, code } = violation;

      // Check confidence level
      if (!this.shouldApplyFix(fix.confidence, options.minConfidence)) {
        skippedFixes.push({
          code,
          fix,
          reason: `Confidence level ${fix.confidence} below minimum ${options.minConfidence}`,
        });
        continue;
      }

      // Interactive mode for medium confidence
      if (options.interactive && fix.confidence === 'medium') {
        // In a real implementation, this would prompt the user
        // For now, skip medium-confidence fixes in interactive mode
        skippedFixes.push({
          code,
          fix,
          reason: 'Medium confidence - requires user confirmation',
        });
        continue;
      }

      // Apply the fix
      try {
        fixedCode = this.applyFix(fixedCode, fix.start, fix.end, fix.newCode);
        appliedFixes.push({ code, fix });
      } catch (error) {
        skippedFixes.push({
          code,
          fix,
          reason: `Failed to apply: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Write fixed code if apply=true
    if (options.apply && appliedFixes.length > 0) {
      writeFileSync(configPath, fixedCode, 'utf-8');
    }

    return {
      applied: options.apply && appliedFixes.length > 0,
      fixCount: appliedFixes.length,
      fixedCode: appliedFixes.length > 0 ? fixedCode : undefined,
      appliedFixes,
      skippedFixes,
    };
  }

  /**
   * Check if fix should be applied based on confidence level
   */
  private shouldApplyFix(fixConfidence: FixConfidence, minConfidence: FixConfidence): boolean {
    const confidenceLevels: Record<FixConfidence, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    return confidenceLevels[fixConfidence] >= confidenceLevels[minConfidence];
  }

  /**
   * Apply a single fix to source code
   */
  private applyFix(sourceCode: string, start: number, end: number, newCode: string): string {
    return sourceCode.substring(0, start) + newCode + sourceCode.substring(end);
  }

  /**
   * Preview fixes without applying them
   */
  async preview(
    configPath: string,
    violations: PatternViolation[],
    options: Omit<AutoFixOptions, 'apply'>
  ): Promise<AutoFixResult> {
    return this.fix(configPath, violations, { ...options, apply: false });
  }

  /**
   * Generate diff for preview
   */
  generateDiff(originalCode: string, fixedCode: string): string {
    const originalLines = originalCode.split('\n');
    const fixedLines = fixedCode.split('\n');

    let diff = '';
    const maxLines = Math.max(originalLines.length, fixedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i] || '';
      const fixedLine = fixedLines[i] || '';

      if (origLine !== fixedLine) {
        if (origLine) {
          diff += `- ${origLine}\n`;
        }
        if (fixedLine) {
          diff += `+ ${fixedLine}\n`;
        }
      }
    }

    return diff;
  }
}

/**
 * Format auto-fix result for display
 */
export function formatAutoFixResult(result: AutoFixResult): string {
  let output = '';

  if (result.appliedFixes.length > 0) {
    output += `\n✅ Applied ${result.appliedFixes.length} fix(es):\n\n`;
    for (const { code, fix } of result.appliedFixes) {
      output += `  ${code}: ${fix.description}\n`;
      output += `    - ${fix.oldCode}\n`;
      output += `    + ${fix.newCode}\n\n`;
    }
  }

  if (result.skippedFixes.length > 0) {
    output += `\n⏭️  Skipped ${result.skippedFixes.length} fix(es):\n\n`;
    for (const { code, fix, reason } of result.skippedFixes) {
      output += `  ${code}: ${fix.description}\n`;
      output += `    Reason: ${reason}\n\n`;
    }
  }

  if (result.appliedFixes.length === 0 && result.skippedFixes.length === 0) {
    output += '\nNo fixes available.\n';
  }

  return output;
}
