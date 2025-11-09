/**
 * SST Stage Mismatch Check (Issue #220)
 *
 * **Purpose:** Detect when .sst/stage doesn't match deployment target
 *
 * **Real-World Incident:**
 * - .sst directory contained state for "martijn" stage (development)
 * - Attempted deployment to "production" stage
 * - SST tried to create new resources instead of updating existing ones
 * - Result: Resource conflicts, CNAMEAlreadyExists errors, infrastructure drift
 *
 * **What This Check Does:**
 * 1. Read .sst/stage file to determine current SST stage
 * 2. Compare with deployment target stage
 * 3. Block deployment if mismatch detected (unless user confirms)
 *
 * **Prevents:**
 * - Deploying production with dev state (creates duplicate resources)
 * - Infrastructure drift (SST state out of sync with actual infrastructure)
 * - Resource conflicts (CloudFront distributions, S3 buckets, etc.)
 * - Accidental resource creation when trying to update
 */

import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

export function createSstStageMismatchCheck(
  projectRoot: string,
  targetStage: string
): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking SST stage alignment...'));

    const stageFile = join(projectRoot, '.sst', 'stage');

    if (!existsSync(stageFile)) {
      // No .sst/stage file = fresh deployment (acceptable)
      console.log(chalk.green(`✅ Fresh SST deployment (no existing stage)\n`));
      return { passed: true };
    }

    try {
      const currentStage = readFileSync(stageFile, 'utf-8').trim();

      if (currentStage !== targetStage) {
        console.log(chalk.red('❌ SST stage mismatch detected\n'));

        return {
          passed: false,
          issue: `SST state mismatch: Current stage is "${currentStage}" but deploying to "${targetStage}"`,
          manualFix:
            'This usually means:\n' +
            '1. You previously deployed to a different stage\n' +
            '2. Your .sst directory contains wrong state\n\n' +
            'Options:\n' +
            `1. Deploy to ${currentStage} instead: npx deploy-kit deploy ${currentStage}\n` +
            `2. Remove .sst directory and redeploy: rm -rf .sst && npx deploy-kit deploy ${targetStage}\n` +
            '   ⚠️  WARNING: This will create new resources (may cause conflicts)\n' +
            '3. If intentional, SST will create new resources (may cause CloudFront CNAME conflicts)',
        };
      }

      console.log(chalk.green(`✅ SST stage aligned (${currentStage})\n`));
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        issue: `Could not read .sst/stage file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        manualFix: 'Check .sst directory permissions or remove and redeploy',
      };
    }
  };
}
