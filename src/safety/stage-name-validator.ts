/**
 * Stage Name Consistency Validator (Issue #226)
 *
 * **Problem:**
 * Deploy-Kit allows configuring `sstStageName` in .deploy-config.json, but doesn't validate
 * that this matches the stage name used in sst.config.ts conditional checks. This causes
 * SILENT FAILURES where infrastructure isn't configured correctly.
 *
 * **Real-World Example:**
 * - .deploy-config.json: `sstStageName: "prod"`
 * - sst.config.ts: `stage === "production" ? { domain: ... } : undefined`
 * - Deploy-Kit runs: `npx sst deploy --stage prod`
 * - SST receives: `$app.stage = "prod"`
 * - Domain check: `"prod" === "production"` → false
 * - Result: Domain config skipped, deployment "succeeds" but domain doesn't work
 *
 * **What This Validator Does:**
 * Scans sst.config.ts for stage equality checks and compares them with sstStageName.
 * If Deploy-Kit will pass "prod" but sst.config.ts checks for "production", BLOCKS deployment.
 *
 * **Prevents:**
 * - Production deployed without custom domain
 * - No SSL certificate created
 * - No Route53 A records
 * - Silent failures (no errors, just broken infrastructure)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DeploymentStage } from '../types.js';

export interface StageValidationResult {
  passed: boolean;
  issue?: string;
  details?: string;
  actionRequired?: string;
}

/**
 * Validate stage name consistency between Deploy-Kit config and SST config
 *
 * **Issue #226: Prevent silent failures from stage name mismatches**
 *
 * Common Problem:
 * - .deploy-config.json sets sstStageName: "prod"
 * - sst.config.ts checks: stage === "production"
 * - Result: Domain config doesn't apply (silent failure)
 *
 * This function detects these mismatches by:
 * 1. Reading sstStageName from .deploy-config.json
 * 2. Scanning sst.config.ts for stage equality checks
 * 3. Warning if the checks use a different stage name
 *
 * @param projectRoot - Project root directory
 * @param stageName - Deploy-Kit stage name (e.g., "production")
 * @param sstStageName - Overridden SST stage name (e.g., "prod")
 * @returns Validation result with pass/fail and detailed error messages
 */
export function validateStageNameConsistency(
  projectRoot: string,
  stageName: DeploymentStage,
  sstStageName?: string
): StageValidationResult {
  // If no sstStageName override, stages match by definition
  if (!sstStageName || sstStageName === stageName) {
    return { passed: true };
  }

  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  if (!existsSync(sstConfigPath)) {
    // No SST config to validate against
    return { passed: true };
  }

  const content = readFileSync(sstConfigPath, 'utf-8');

  // Remove comments to avoid false positives
  const contentWithoutComments = content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  // Pattern 1: Exact equality checks (most common source of bugs)
  // Matches: stage === "production", stage == "production"
  const exactEqualityPattern = new RegExp(
    `\\bstage\\s*===?\\s*['"\`]${stageName}['"\`]`,
    'g'
  );
  const exactEqualityMatches = contentWithoutComments.match(exactEqualityPattern);

  // Pattern 2: Template literal checks
  // Matches: `${stage}` === "production", stage === `production`
  const templateLiteralPattern = new RegExp(
    `(?:\\bstage\\s*===?\\s*\`${stageName}\`|\`\\$\\{stage\\}\`\\s*===?\\s*['"\`]${stageName}['"\`])`,
    'g'
  );
  const templateLiteralMatches = contentWithoutComments.match(templateLiteralPattern);

  // Pattern 3: Inequality checks (also dangerous)
  // Matches: stage !== "dev", stage != "development"
  const inequalityPattern = new RegExp(
    `\\bstage\\s*!==?\\s*['"\`](?!${sstStageName})\\w+['"\`]`,
    'g'
  );
  const inequalityMatches = contentWithoutComments.match(inequalityPattern);

  const totalMatches =
    (exactEqualityMatches?.length || 0) +
    (templateLiteralMatches?.length || 0) +
    (inequalityMatches?.length || 0);

  if (totalMatches > 0) {
    const examples: string[] = [];

    if (exactEqualityMatches) {
      examples.push(...exactEqualityMatches.slice(0, 2));
    }
    if (templateLiteralMatches) {
      examples.push(...templateLiteralMatches.slice(0, 2));
    }
    if (inequalityMatches) {
      examples.push(...inequalityMatches.slice(0, 2));
    }

    return {
      passed: false,
      issue: `Stage name mismatch detected in sst.config.ts`,
      details:
        `Deploy-Kit will deploy using stage name: "${sstStageName}"\n` +
        `But sst.config.ts has ${totalMatches} check(s) for: "${stageName}"\n\n` +
        `Example mismatches found:\n${examples.map((ex) => `  • ${ex}`).join('\n')}\n\n` +
        `This means conditional configurations (domain, environment, link) will NOT apply!\n\n` +
        `**Why This Matters:**\n` +
        `When Deploy-Kit runs: npx sst deploy --stage ${sstStageName}\n` +
        `SST will see: $app.stage = "${sstStageName}"\n` +
        `But your config checks: stage === "${stageName}"\n` +
        `Result: Configuration skipped, deployment "succeeds" but infrastructure is broken`,
      actionRequired:
        'Fix options (choose ONE):\n\n' +
        `1. Update sst.config.ts to use "${sstStageName}" instead of "${stageName}":\n` +
        `   - Change: stage === "${stageName}"\n` +
        `   - To:     stage === "${sstStageName}"\n\n` +
        `2. Update .deploy-config.json to match sst.config.ts:\n` +
        `   - Remove "sstStageName": "${sstStageName}"\n` +
        `   - OR change it to: "sstStageName": "${stageName}"\n\n` +
        `3. If intentional, add a comment explaining why (and expect broken infrastructure)`,
    };
  }

  return { passed: true };
}
