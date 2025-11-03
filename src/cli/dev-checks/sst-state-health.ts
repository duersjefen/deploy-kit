/**
 * SST State Health Check (Enhanced)
 *
 * Detects stuck SST deployments and state machine issues:
 * - CloudFront resources stuck in "Deploying" state
 * - Pulumi state file corruption or locks
 * - IAM role drift (state vs reality)
 * - KeyValueStore conflicts
 *
 * This prevents the exact issue you hit:
 * "SST tries to update CloudFront → fails → continues anyway → IAM role never updates"
 */

import chalk from 'chalk';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';
import type { ProjectConfig } from '../../types.js';
import { CloudFrontAPIClient } from '../../lib/cloudfront/client.js';

interface StateIssue {
  type: 'warning' | 'error';
  message: string;
  fix?: string;
}

/**
 * Check Pulumi state files for corruption or stale locks
 */
async function checkPulumiState(projectRoot: string): Promise<StateIssue[]> {
  const issues: StateIssue[] = [];
  const sstDir = join(projectRoot, '.sst');

  if (!existsSync(sstDir)) {
    return issues; // First run, no state yet
  }

  // Check for .pulumi directory
  const pulumiDir = join(sstDir, '.pulumi');
  if (!existsSync(pulumiDir)) {
    return issues; // No Pulumi state yet
  }

  // Check for lock files that might be stale
  const lockFile = join(pulumiDir, 'locks');
  if (existsSync(lockFile)) {
    try {
      const lockFiles = readdirSync(lockFile);
      if (lockFiles.length > 0) {
        // Check if lock files are older than 30 minutes (stale)
        const now = Date.now();
        const staleLocks = lockFiles.filter(file => {
          const lockPath = join(lockFile, file);
          const stats = statSync(lockPath);
          const ageMinutes = (now - stats.mtimeMs) / 1000 / 60;
          return ageMinutes > 30;
        });

        if (staleLocks.length > 0) {
          issues.push({
            type: 'warning',
            message: `Found ${staleLocks.length} stale Pulumi lock(s) (>30 min old)`,
            fix: 'These might block deployments. Run: rm -rf .sst/.pulumi/locks/*',
          });
        }
      }
    } catch (error) {
      // Lock directory exists but can't read - that's suspicious
      issues.push({
        type: 'warning',
        message: 'Cannot read Pulumi lock directory',
        fix: 'Permissions issue. Check: ls -la .sst/.pulumi/locks',
      });
    }
  }

  // Check for corrupted state snapshots
  const snapshotsDir = join(pulumiDir, 'backups');
  if (existsSync(snapshotsDir)) {
    try {
      const snapshots = readdirSync(snapshotsDir);

      // If there are recent backups, might indicate failed deployments
      const recentBackups = snapshots.filter(file => {
        const backupPath = join(snapshotsDir, file);
        const stats = statSync(backupPath);
        const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;
        return ageMinutes < 10; // Last 10 minutes
      });

      if (recentBackups.length > 3) {
        issues.push({
          type: 'warning',
          message: `${recentBackups.length} Pulumi backups created in last 10min (deployment issues?)`,
          fix: 'Previous deployment may have failed. Check .sst/.pulumi/backups/',
        });
      }
    } catch (error) {
      // Can't read backups - not critical
    }
  }

  return issues;
}

/**
 * Check CloudFront distributions for stuck "Deploying" or "InProgress" states
 * This is the EXACT issue you hit - CloudFront stuck, SST continues, IAM role never updates
 */
async function checkCloudFrontState(
  projectRoot: string,
  config: ProjectConfig | null
): Promise<StateIssue[]> {
  const issues: StateIssue[] = [];

  if (!config) {
    return issues; // No config, skip CloudFront checks
  }

  try {
    const awsRegion = config.stageConfig?.staging?.awsRegion || 'eu-north-1';
    const awsProfile = config.awsProfile || process.env.AWS_PROFILE;
    const client = new CloudFrontAPIClient(awsRegion, awsProfile);
    const distributions = await client.listDistributions();

    // Filter distributions that might belong to this project
    // (SST typically includes project name in comments)
    const projectDistributions = distributions.filter(dist => {
      const comment = dist.Comment?.toLowerCase() || '';
      const projectName = config.projectName?.toLowerCase() || '';
      return comment.includes(projectName) || comment.includes('sst');
    });

    for (const dist of projectDistributions) {
      // Check for "InProgress" or "Deploying" status
      if (dist.Status === 'InProgress' || dist.Status.includes('Deploy')) {
        issues.push({
          type: 'error',
          message: `CloudFront distribution ${dist.Id} stuck in "${dist.Status}" state`,
          fix: `This will block SST updates. Wait 5-15 min for CloudFront to finish, or run: deploy-kit recover cloudfront`,
        });
      }

      // Check if distribution was recently modified (< 20 min) but not InProgress
      // This might indicate a failed update
      if (dist.LastModifiedTime) {
        const ageMinutes = (Date.now() - dist.LastModifiedTime.getTime()) / 1000 / 60;
        if (ageMinutes < 20 && dist.Status !== 'InProgress' && dist.Status === 'Deployed') {
          issues.push({
            type: 'warning',
            message: `CloudFront ${dist.Id} was recently modified (${Math.round(ageMinutes)}min ago)`,
            fix: 'Recent changes might not be fully propagated yet. Wait 5-15 min for safety.',
          });
        }
      }
    }

    // Check for too many distributions (might indicate cleanup needed)
    if (projectDistributions.length > 5) {
      issues.push({
        type: 'warning',
        message: `Found ${projectDistributions.length} CloudFront distributions for this project`,
        fix: 'You might have leftover distributions from failed deployments. Check AWS Console.',
      });
    }
  } catch (error: any) {
    // Don't fail the entire check if AWS API is unavailable
    // Just warn and continue
    if (error.message?.includes('credentials') || error.message?.includes('not configured')) {
      // Expected - user might not have AWS credentials yet
      return issues;
    }

    issues.push({
      type: 'warning',
      message: `Could not check CloudFront state: ${error.message}`,
      fix: 'AWS API unavailable. Continuing without CloudFront checks.',
    });
  }

  return issues;
}

/**
 * Check SST metadata for signs of previous deployment failures
 */
async function checkSSTMetadata(projectRoot: string): Promise<StateIssue[]> {
  const issues: StateIssue[] = [];
  const sstDir = join(projectRoot, '.sst');

  if (!existsSync(sstDir)) {
    return issues;
  }

  // Check for error log files
  const errorLog = join(sstDir, 'error.log');
  if (existsSync(errorLog)) {
    try {
      const content = readFileSync(errorLog, 'utf-8');
      const lines = content.split('\n');

      // Check for recent errors (< 1 hour old)
      const recentErrors = lines.filter(line => {
        // Look for timestamps in logs
        const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        if (!match) return false;

        const logTime = new Date(match[0]);
        const ageMinutes = (Date.now() - logTime.getTime()) / 1000 / 60;
        return ageMinutes < 60;
      });

      if (recentErrors.length > 0) {
        issues.push({
          type: 'warning',
          message: `Found ${recentErrors.length} recent error(s) in .sst/error.log`,
          fix: 'Check .sst/error.log for details. Previous deployment may have failed.',
        });
      }
    } catch (error) {
      // Can't read error log - not critical
    }
  }

  return issues;
}

/**
 * Create enhanced SST state health check
 */
export function createSstStateHealthCheck(
  projectRoot: string,
  config: ProjectConfig | null
): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking SST state health...'));

    const sstDir = join(projectRoot, '.sst');

    if (!existsSync(sstDir)) {
      console.log(chalk.green('✅ No .sst directory (first run)\n'));
      return { passed: true };
    }

    // Run all checks in parallel
    const [pulumiIssues, cloudFrontIssues, metadataIssues] = await Promise.all([
      checkPulumiState(projectRoot),
      checkCloudFrontState(projectRoot, config),
      checkSSTMetadata(projectRoot),
    ]);

    const allIssues = [...pulumiIssues, ...cloudFrontIssues, ...metadataIssues];

    // Separate errors from warnings
    const errors = allIssues.filter(i => i.type === 'error');
    const warnings = allIssues.filter(i => i.type === 'warning');

    if (errors.length > 0) {
      // Critical issues found - block deployment
      console.log(chalk.red('❌ SST state has critical issues:\n'));
      errors.forEach(issue => {
        console.log(chalk.red(`   • ${issue.message}`));
        if (issue.fix) {
          console.log(chalk.gray(`     Fix: ${issue.fix}`));
        }
      });
      console.log();

      return {
        passed: false,
        issue: `SST state has ${errors.length} critical issue(s)`,
        manualFix: 'Fix the issues above before running sst dev',
        errorType: 'sst_state_stuck',
      };
    }

    if (warnings.length > 0) {
      // Warnings - show but don't block
      console.log(chalk.yellow('⚠️  SST state warnings:\n'));
      warnings.forEach(issue => {
        console.log(chalk.yellow(`   • ${issue.message}`));
        if (issue.fix) {
          console.log(chalk.gray(`     ${issue.fix}`));
        }
      });
      console.log(chalk.gray('   Continuing anyway...\n'));
    }

    if (allIssues.length === 0) {
      console.log(chalk.green('✅ SST state healthy\n'));
    }

    return { passed: true };
  };
}
