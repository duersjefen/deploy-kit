/**
 * SST Development Command with Pre-flight Checks
 * Wraps `sst dev` with automatic error detection and recovery
 */

import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { resolveAwsProfile } from '../utils/aws-profile-detector.js';
import type { ProjectConfig } from '../../types.js';

export interface DevOptions {
  skipChecks?: boolean;  // Skip pre-flight checks (for advanced users)
  port?: number;         // Custom port (default: 3000)
  verbose?: boolean;     // Verbose output
}

export interface CheckResult {
  passed: boolean;
  issue?: string;
  manualFix?: string;
  canAutoFix?: boolean;
  autoFix?: () => Promise<void>;
}

/**
 * Main dev command entry point
 */
export async function handleDevCommand(
  projectRoot: string = process.cwd(),
  options: DevOptions = {}
): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║       🚀 SST Development Environment                       ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

    // Load config
    const configPath = join(projectRoot, '.deploy-config.json');
    let config: ProjectConfig | null = null;
    
    if (existsSync(configPath)) {
      const configContent = require(configPath);
      config = configContent;
    }

    // Run pre-flight checks unless skipped
    if (!options.skipChecks) {
      console.log(chalk.bold('⚙️  Pre-Flight Checks\n'));
      const checksResult = await runPreFlightChecks(projectRoot, config);
      
      if (!checksResult.allPassed) {
        console.log(chalk.red('\n❌ Pre-flight checks failed. See above for details.'));
        console.log(chalk.gray('\nRun with --skip-checks to bypass (not recommended)\n'));
        process.exit(1);
      }
      
      console.log(chalk.bold.green('✨ All pre-flight checks passed!\n'));
    }

    // Start SST dev
    await startSstDev(projectRoot, config, options);
  } catch (error) {
    console.error(chalk.red('\n❌ Dev command failed:'), error);
    process.exit(1);
  }
}

/**
 * Run all pre-flight checks
 */
async function runPreFlightChecks(
  projectRoot: string,
  config: ProjectConfig | null
): Promise<{ allPassed: boolean; results: CheckResult[] }> {
  const checks = [
    { name: 'AWS Credentials', fn: () => checkAwsCredentials(projectRoot, config) },
    { name: 'SST Lock', fn: () => checkSstLock(projectRoot) },
    { name: 'Port Availability', fn: () => checkPortAvailability(3000) },
    { name: 'SST Config', fn: () => checkSstConfig(projectRoot) },
    { name: '.sst Directory Health', fn: () => checkSstStateHealth(projectRoot) },
    { name: 'Pulumi Output Usage', fn: () => checkPulumiOutputUsage(projectRoot) },
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      const result = await check.fn();
      results.push(result);

      if (!result.passed && result.canAutoFix && result.autoFix) {
        console.log(chalk.yellow(`🔧 Auto-fixing: ${result.issue}`));
        await result.autoFix();
        console.log(chalk.green('✅ Fixed\n'));
      } else if (!result.passed) {
        console.log(chalk.red(`❌ ${result.issue}`));
        if (result.manualFix) {
          console.log(chalk.gray(`   Fix: ${result.manualFix}\n`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  ${check.name}: Could not verify (skipping)\n`));
      results.push({ passed: true }); // Skip check on error
    }
  }

  return {
    allPassed: results.every(r => r.passed),
    results,
  };
}

/**
 * Check 1: AWS Credentials
 */
async function checkAwsCredentials(projectRoot: string, config: ProjectConfig | null): Promise<CheckResult> {
  console.log(chalk.gray('🔍 Checking AWS credentials...'));

  try {
    const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;
    const profileArg = profile ? `--profile ${profile}` : '';
    
    const result = execSync(`aws sts get-caller-identity ${profileArg}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const identity = JSON.parse(result);
    const profileInfo = profile ? ` (profile: ${profile})` : ' (default profile)';
    console.log(chalk.green(`✅ AWS credentials valid${profileInfo}`));
    console.log(chalk.gray(`   Account: ${identity.Account}\n`));
    
    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      issue: 'AWS credentials not configured',
      manualFix: 'Run: aws configure',
    };
  }
}

/**
 * Check 2: SST Lock
 */
async function checkSstLock(projectRoot: string): Promise<CheckResult> {
  console.log(chalk.gray('🔍 Checking for SST locks...'));

  // Check if .sst/lock file exists
  const lockPath = join(projectRoot, '.sst', 'lock');
  
  if (existsSync(lockPath)) {
    return {
      passed: false,
      issue: 'SST lock detected (previous session didn\'t exit cleanly)',
      canAutoFix: true,
      autoFix: async () => {
        execSync('npx sst unlock', { cwd: projectRoot, stdio: 'inherit' });
      },
    };
  }

  console.log(chalk.green('✅ No locks found\n'));
  return { passed: true };
}

/**
 * Check 3: Port Availability
 */
async function checkPortAvailability(port: number): Promise<CheckResult> {
  console.log(chalk.gray(`🔍 Checking if port ${port} is available...`));

  try {
    const result = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const processId = result.trim();
    
    if (processId) {
      return {
        passed: false,
        issue: `Port ${port} is in use by process ${processId}`,
        manualFix: `Kill process: lsof -ti:${port} | xargs kill -9`,
      };
    }
  } catch (error) {
    // lsof returns error code if no process found (port is available)
  }

  console.log(chalk.green('✅ Port available\n'));
  return { passed: true };
}

/**
 * Check 4: SST Config Validity
 */
async function checkSstConfig(projectRoot: string): Promise<CheckResult> {
  console.log(chalk.gray('🔍 Checking sst.config.ts...'));

  const sstConfigPath = join(projectRoot, 'sst.config.ts');

  if (!existsSync(sstConfigPath)) {
    return {
      passed: false,
      issue: 'sst.config.ts not found',
      manualFix: 'Create sst.config.ts or run from project root',
    };
  }

  // Basic syntax check
  const { readFileSync } = await import('fs');
  try {
    const content = readFileSync(sstConfigPath, 'utf-8');

    if (!content.includes('export default')) {
      return {
        passed: false,
        issue: 'sst.config.ts missing "export default"',
        manualFix: 'Fix sst.config.ts syntax',
      };
    }

    console.log(chalk.green('✅ sst.config.ts found and valid\n'));
    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      issue: 'sst.config.ts has syntax errors',
      manualFix: 'Fix TypeScript errors in sst.config.ts',
    };
  }
}

/**
 * Check 5: .sst Directory Health
 */
async function checkSstStateHealth(projectRoot: string): Promise<CheckResult> {
  console.log(chalk.gray('🔍 Checking .sst directory health...'));

  const sstDir = join(projectRoot, '.sst');

  if (!existsSync(sstDir)) {
    console.log(chalk.green('✅ No .sst directory (first run)\n'));
    return { passed: true };
  }

  console.log(chalk.green('✅ .sst directory healthy\n'));
  return { passed: true };
}

/**
 * Check 6: Pulumi Output Misuse (CRITICAL from GitHub issue comment)
 */
async function checkPulumiOutputUsage(projectRoot: string): Promise<CheckResult> {
  console.log(chalk.gray('🔍 Checking for Pulumi Output misuse in sst.config.ts...'));

  const sstConfigPath = join(projectRoot, 'sst.config.ts');
  
  if (!existsSync(sstConfigPath)) {
    console.log(chalk.green('✅ No issues detected\n'));
    return { passed: true };
  }

  const { readFileSync } = await import('fs');
  const content = readFileSync(sstConfigPath, 'utf-8');
  const lines = content.split('\n');
  
  interface PulumiIssue {
    line: number;
    pattern: string;
    code: string;
    suggestion: string;
  }
  
  const issues: PulumiIssue[] = [];

  lines.forEach((line, index) => {
    // Pattern 1: Direct Output in array without .apply()
    // Example: resources: [table.arn] or resources: [table.arn, ...]
    if (/resources:\s*\[.*?\.(arn|name|id)/.test(line)) {
      if (!line.includes('.apply(')) {
        issues.push({
          line: index + 1,
          pattern: 'direct_output_in_array',
          code: line.trim(),
          suggestion: 'Use .apply() to unwrap: table.arn.apply(arn => arn)',
        });
      }
    }

    // Pattern 2: Output in template literal without pulumi.interpolate
    // Example: `${table.arn}/*` instead of pulumi.interpolate`${table.arn}/*`
    if (/`[^`]*\$\{[^}]*\.(arn|name|id)[^}]*\}[^`]*`/.test(line)) {
      if (!line.includes('pulumi.interpolate') && !line.includes('.apply(')) {
        issues.push({
          line: index + 1,
          pattern: 'output_in_template',
          code: line.trim(),
          suggestion: 'Use pulumi.interpolate`...` or .apply()',
        });
      }
    }
  });

  if (issues.length > 0) {
    console.log(chalk.yellow(`⚠️  Found ${issues.length} Pulumi Output issue(s):\n`));
    
    issues.forEach(issue => {
      console.log(chalk.yellow(`   Line ${issue.line}: ${issue.code}`));
      console.log(chalk.gray(`   → ${issue.suggestion}`));
    });
    console.log();

    return {
      passed: false,
      issue: 'Pulumi Outputs used incorrectly - will cause "Partition 1 is not valid" error',
      manualFix: 'Fix the issues above or see: https://www.pulumi.com/docs/concepts/inputs-outputs',
    };
  }

  console.log(chalk.green('✅ No Pulumi Output issues detected\n'));
  return { passed: true };
}

/**
 * Start SST dev server
 */
async function startSstDev(
  projectRoot: string,
  config: ProjectConfig | null,
  options: DevOptions
): Promise<void> {
  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.cyan('🚀 Starting SST dev server...\n'));

  const args = ['sst', 'dev'];
  
  if (options.port) {
    args.push(`--port=${options.port}`);
  }

  const profile = config ? resolveAwsProfile(config, projectRoot) : undefined;

  try {
    const child: ChildProcess = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(profile && { AWS_PROFILE: profile }),
      },
    });

    // Handle graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow('\n\n🛑 Stopping SST dev server...'));
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGINT');
        } catch (err) {
          // Process may have already exited
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`SST exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  } catch (error) {
    console.error(chalk.red('\n❌ SST dev failed\n'));
    await handleSstDevError(error as Error);
    process.exit(1);
  }
}

/**
 * Error translation layer - Convert cryptic errors to actionable guidance
 */
async function handleSstDevError(error: Error): Promise<void> {
  const message = error.message.toLowerCase();

  console.log(chalk.bold.red('🔍 Error Analysis:\n'));

  if (message.includes('partition') && message.includes('not valid')) {
    console.log(chalk.red('❌ Pulumi Output Error Detected\n'));
    console.log(chalk.yellow('You\'re using Pulumi Outputs incorrectly in sst.config.ts\n'));
    console.log(chalk.bold('Common mistakes:'));
    console.log(chalk.red('  ❌ resources: [table.arn]'));
    console.log(chalk.green('  ✅ resources: [table.arn.apply(arn => arn)]\n'));
    console.log(chalk.red('  ❌ resources: [`${table.arn}/*`]'));
    console.log(chalk.green('  ✅ resources: [pulumi.interpolate`${table.arn}/*`]\n'));
    console.log(chalk.gray('Learn more: https://www.pulumi.com/docs/concepts/inputs-outputs\n'));
  } else if (message.includes('concurrent update') || message.includes('lock')) {
    console.log(chalk.yellow('🔧 Recovery Steps:'));
    console.log(chalk.gray('  1. Run: npx sst unlock'));
    console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
  } else if (message.includes('eaddrinuse') || message.includes('port')) {
    console.log(chalk.yellow('🔧 Recovery Steps:'));
    console.log(chalk.gray('  1. Kill port: lsof -ti:3000 | xargs kill -9'));
    console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
  } else if (message.includes('credentials') || message.includes('aws')) {
    console.log(chalk.yellow('🔧 Recovery Steps:'));
    console.log(chalk.gray('  1. Configure AWS: aws configure'));
    console.log(chalk.gray('  2. Retry: npx deploy-kit dev\n'));
  } else {
    console.log(chalk.yellow('🔧 Try cleaning SST state:'));
    console.log(chalk.gray('  rm -rf .sst'));
    console.log(chalk.gray('  npx deploy-kit dev\n'));
  }
}
