/**
 * Release Command - TypeScript implementation
 *
 * Handles package versioning, testing, and publishing with full safety checks.
 * Replaces the bash release script with a type-safe, testable implementation.
 */

import chalk from 'chalk';
import { execa, type ExecaError } from 'execa';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type ReleaseType = 'patch' | 'minor' | 'major';

export interface ReleaseOptions {
  type: ReleaseType;
  dryRun?: boolean;
  skipTests?: boolean;
  cwd?: string;
}

interface WorktreeInfo {
  path: string;
  branch: string;
}

/**
 * Main release function
 */
export async function handleReleaseCommand(options: ReleaseOptions): Promise<void> {
  const startTime = Date.now();

  // Ensure booleans have defaults
  const dryRun = options.dryRun ?? false;
  const skipTests = options.skipTests ?? false;

  if (dryRun) {
    console.log(chalk.yellow('\n🔍 DRY RUN MODE - No changes will be made\n'));
  }

  console.log(chalk.blue('═══════════════════════════════════════════════════'));
  console.log(chalk.blue(`🚀 Starting ${options.type} release workflow`));
  console.log(chalk.blue('═══════════════════════════════════════════════════\n'));

  let currentStep = 0;
  let versionTag = '';
  let newVersion = '';
  let mainWorktree: string | null = null;
  let createdTempWorktree = false;

  try {
    // Step 0: Pre-flight checks
    console.log(chalk.blue('Step 0/9:'), 'Running pre-flight checks...');
    currentStep = 0;
    await preFlightChecks();
    console.log(chalk.green('✅ Pre-flight checks passed\n'));

    // Step 1: Find or create main worktree
    console.log(chalk.blue('Step 1/9:'), 'Finding main worktree...');
    currentStep = 1;
    const worktreeResult = await findOrCreateMainWorktree(options.cwd);
    mainWorktree = worktreeResult.path;
    createdTempWorktree = worktreeResult.created;
    console.log(chalk.green(`✅ Using worktree: ${mainWorktree}\n`));

    // Step 2: Verify clean working directory
    console.log(chalk.blue('Step 2/9:'), 'Verifying working directory is clean...');
    currentStep = 2;
    await verifyCleanWorkingDirectory(mainWorktree, dryRun);
    console.log(chalk.green('✅ Working directory is clean\n'));

    // Step 3: Run tests
    if (!skipTests) {
      console.log(chalk.blue('Step 3/9:'), 'Running tests...');
      currentStep = 3;
      await runTests(mainWorktree, dryRun);
      console.log(chalk.green('✅ All tests passed\n'));
    } else {
      console.log(chalk.yellow('Step 3/9: Skipping tests (--skip-tests flag)\n'));
      currentStep = 3;
    }

    // Step 4: Bump version
    console.log(chalk.blue('Step 4/9:'), `Bumping version (${options.type})...`);
    currentStep = 4;
    newVersion = await bumpVersion(mainWorktree, options.type, dryRun);
    versionTag = `v${newVersion}`;
    console.log(chalk.green(`✅ Version bumped to ${newVersion}\n`));

    // Step 5: Commit version bump
    console.log(chalk.blue('Step 5/9:'), 'Committing version bump...');
    currentStep = 5;
    await commitVersionBump(mainWorktree, newVersion, dryRun);
    console.log(chalk.green('✅ Version bump committed\n'));

    // Step 6: Create git tag
    console.log(chalk.blue('Step 6/9:'), `Creating git tag ${versionTag}...`);
    currentStep = 6;
    await createGitTag(mainWorktree, versionTag, dryRun);
    console.log(chalk.green('✅ Git tag created\n'));

    // Step 7: Push to GitHub
    console.log(chalk.blue('Step 7/9:'), 'Pushing to GitHub...');
    currentStep = 7;
    await pushToGitHub(mainWorktree, versionTag, dryRun);
    console.log(chalk.green('✅ Pushed to GitHub\n'));

    // Step 8: Wait for GitHub Actions to publish
    console.log(chalk.blue('Step 8/9:'), 'Triggering GitHub Actions workflow...');
    currentStep = 8;
    console.log(chalk.yellow('  ℹ️  GitHub Actions will automatically publish to npm via OIDC'));
    console.log(chalk.yellow(`  ℹ️  Monitor: https://github.com/duersjefen/deploy-kit/actions`));

    // Step 9: Create GitHub release
    console.log(chalk.blue('Step 9/9:'), 'Creating GitHub release...');
    currentStep = 9;
    await createGitHubRelease(mainWorktree, versionTag, newVersion, dryRun);
    console.log(chalk.green('✅ GitHub release created\n'));

    // Success!
    console.log(chalk.blue('═══════════════════════════════════════════════════'));
    console.log(chalk.green(`✅ Release ${versionTag} complete!`));
    console.log(chalk.blue('═══════════════════════════════════════════════════\n'));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!dryRun) {
      console.log(chalk.yellow('📦 Next steps:'));
      console.log(`1. Monitor GitHub Actions: https://github.com/duersjefen/deploy-kit/actions`);
      console.log(`2. Verify the release: https://github.com/duersjefen/deploy-kit/releases/tag/${versionTag}`);
      console.log(`3. After CI completes, verify package: https://www.npmjs.com/package/@duersjefen/deploy-kit`);
      console.log(`4. Update dependent projects to use @duersjefen/deploy-kit@${newVersion}`);
      console.log(chalk.gray(`\nCompleted in ${duration}s\n`));
    } else {
      console.log(chalk.yellow('🔍 Dry run complete - no changes were made'));
      console.log('Run without --dry-run to perform the actual release');
      console.log(chalk.gray(`\nCompleted in ${duration}s\n`));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Release failed at step ${currentStep}`));

    // Attempt rollback
    if (!dryRun && currentStep >= 4) {
      await rollback(mainWorktree!, currentStep, versionTag);
    }

    throw error;
  } finally {
    // Cleanup temp worktree if created
    if (createdTempWorktree && mainWorktree) {
      try {
        await execa('git', ['worktree', 'remove', '--force', mainWorktree]);
        console.log(chalk.gray('Cleaned up temporary worktree\n'));
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Step 0: Pre-flight checks
 */
async function preFlightChecks(): Promise<void> {
  const requiredCommands = ['git', 'pnpm', 'gh'];

  for (const cmd of requiredCommands) {
    try {
      await execa(cmd, ['--version'], { stdout: 'ignore' });
    } catch (error) {
      throw new Error(`Required command not found: ${cmd}`);
    }
  }

  // Check gh authentication
  try {
    await execa('gh', ['auth', 'status'], { stdout: 'ignore', stderr: 'ignore' });
  } catch (error) {
    throw new Error('Not authenticated with GitHub CLI. Run: gh auth login');
  }

  // Note: npm authentication not required - GitHub Actions handles publishing via OIDC
}

/**
 * Step 1: Find or create main worktree
 */
async function findOrCreateMainWorktree(cwd?: string): Promise<{ path: string; created: boolean }> {
  try {
    // List all worktrees
    const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd });

    // Parse worktrees
    const worktrees: WorktreeInfo[] = [];
    const lines = stdout.split('\n');
    let current: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        current.path = line.substring('worktree '.length);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring('branch refs/heads/'.length);
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = {};
      }
    }

    // Find main worktree
    const mainWorktree = worktrees.find(wt => wt.branch === 'main');

    if (mainWorktree) {
      return { path: mainWorktree.path, created: false };
    }

    // Create temporary worktree
    const tempPath = `/tmp/deploy-kit-release-${process.pid}`;
    await execa('git', ['worktree', 'add', tempPath, 'main'], { cwd });
    console.log(chalk.yellow('  ℹ️  Created temporary worktree for release'));

    return { path: tempPath, created: true };
  } catch (error) {
    throw new Error(`Failed to find or create main worktree: ${(error as Error).message}`);
  }
}

/**
 * Step 2: Verify clean working directory
 */
async function verifyCleanWorkingDirectory(worktree: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow('  [DRY RUN] Would verify clean working directory'));
    return;
  }

  const { stdout } = await execa('git', ['-C', worktree, 'status', '--porcelain']);

  if (stdout.trim()) {
    console.error(chalk.red('\nUncommitted changes:'));
    console.error(stdout);
    throw new Error('Working directory has uncommitted changes. Please commit or stash them first.');
  }
}

/**
 * Step 3: Run tests
 */
async function runTests(worktree: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow('  [DRY RUN] Would run: pnpm run build && pnpm run test:unit'));
    return;
  }

  console.log('  → Building...');
  await execa('pnpm', ['--dir', worktree, 'run', 'build'], {
    stdout: 'pipe',
    stderr: 'pipe'
  });

  console.log('  → Running unit tests...');
  try {
    await execa('pnpm', ['--dir', worktree, 'run', 'test:unit'], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
  } catch (error) {
    const execaError = error as ExecaError;
    console.error(chalk.red('\n  Tests failed:'));
    if (execaError.stdout) console.error(execaError.stdout);
    if (execaError.stderr) console.error(execaError.stderr);
    throw new Error('Tests failed - aborting release');
  }
}

/**
 * Step 4: Bump version
 */
async function bumpVersion(worktree: string, type: ReleaseType, dryRun: boolean): Promise<string> {
  if (dryRun) {
    // Read current version
    const packageJson = JSON.parse(readFileSync(join(worktree, 'package.json'), 'utf-8'));
    const current = packageJson.version;
    const [major, minor, patch] = current.split('.').map(Number);

    let newVersion: string;
    switch (type) {
      case 'major': newVersion = `${major + 1}.0.0`; break;
      case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
      case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break;
    }

    console.log(chalk.yellow(`  [DRY RUN] Would bump version from ${current} to ${newVersion}`));
    return newVersion;
  }

  await execa('pnpm', ['--dir', worktree, 'version', type, '--no-git-tag-version']);

  // Read new version
  const packageJson = JSON.parse(readFileSync(join(worktree, 'package.json'), 'utf-8'));
  return packageJson.version;
}

/**
 * Step 5: Commit version bump
 */
async function commitVersionBump(worktree: string, version: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow(`  [DRY RUN] Would commit: chore: Bump version to ${version}`));
    return;
  }

  await execa('git', ['-C', worktree, 'add', 'package.json', 'pnpm-lock.yaml']);
  await execa('git', ['-C', worktree, 'commit', '-m', `chore: Bump version to ${version}`]);
}

/**
 * Step 6: Create git tag
 */
async function createGitTag(worktree: string, tag: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow(`  [DRY RUN] Would create tag: ${tag}`));
    return;
  }

  const { stdout: lastCommitMsg } = await execa('git', ['-C', worktree, 'log', '-1', '--format=%s']);
  await execa('git', ['-C', worktree, 'tag', '-a', tag, '-m', `${tag}: ${lastCommitMsg}`]);
}

/**
 * Step 7: Push to GitHub
 */
async function pushToGitHub(worktree: string, tag: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow('  [DRY RUN] Would push:'));
    console.log('    → git push origin main');
    console.log(`    → git push origin ${tag}`);
    return;
  }

  console.log('  → Pushing commit...');
  await execa('git', ['-C', worktree, 'push', 'origin', 'main']);

  console.log('  → Pushing tag...');
  await execa('git', ['-C', worktree, 'push', 'origin', tag]);
}

/**
 * Step 9: Create GitHub release
 */
async function createGitHubRelease(worktree: string, tag: string, version: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(chalk.yellow(`  [DRY RUN] Would create GitHub release for ${tag}`));
    return;
  }

  const { stdout: commitMsg } = await execa('git', ['-C', worktree, 'log', '-1', '--pretty=%B']);
  const { stdout: lastCommitSubject } = await execa('git', ['-C', worktree, 'log', '-1', '--format=%s']);

  const releaseTitle = `${tag}: ${lastCommitSubject.replace(/^[^:]*: /, '')}`;

  // Get previous tag for changelog
  let prevTag = 'initial';
  try {
    const { stdout } = await execa('git', ['-C', worktree, 'describe', '--tags', '--abbrev=0', 'HEAD~1']);
    prevTag = stdout.trim();
  } catch (e) {
    // No previous tag
  }

  const releaseNotes = `## Changes

${commitMsg}

## Installation

\`\`\`bash
# Install globally (recommended)
npm install -g @duersjefen/deploy-kit@${version}

# Or install as dev dependency
npm install --save-dev @duersjefen/deploy-kit@${version}

# Or use directly with npx
npx @duersjefen/deploy-kit@${version} --version
\`\`\`

---

**Full Changelog**: https://github.com/duersjefen/deploy-kit/compare/${prevTag}...${tag}`;

  try {
    await execa('gh', ['release', 'create', tag, '--title', releaseTitle, '--notes', releaseNotes], {
      cwd: worktree
    });
  } catch (error) {
    console.log(chalk.yellow('  ⚠️  Failed to create GitHub release (non-fatal)'));
    console.log(chalk.gray('  You can manually create the release on GitHub'));
  }
}

/**
 * Rollback on failure
 */
async function rollback(worktree: string, step: number, tag: string): Promise<void> {
  console.log(chalk.yellow(`\n⚠️  Performing rollback from step ${step}...`));

  try {
    if (step >= 6 && tag) {
      console.log('  → Deleting git tag...');
      await execa('git', ['-C', worktree, 'tag', '-d', tag]).catch(() => {});
    }

    if (step >= 5) {
      console.log('  → Resetting version bump commit...');
      await execa('git', ['-C', worktree, 'reset', '--hard', 'HEAD~1']).catch(() => {});
    }

    console.log(chalk.green('✅ Rollback complete'));
  } catch (error) {
    console.log(chalk.red('⚠️  Rollback failed - manual cleanup may be required'));
  }
}
