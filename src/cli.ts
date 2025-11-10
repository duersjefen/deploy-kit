#!/usr/bin/env node
/**
 * Deploy-Kit CLI Entry Point
 * Production deployment orchestration for SST + Next.js + DynamoDB
 */

// CRITICAL: Install global error handler FIRST (before any other imports)
// This prevents Pulumi's error formatter from masking errors with RangeError (DEP-39)
import { installGlobalErrorHandler } from './lib/safe-error-handler.js';
installGlobalErrorHandler({
  exitOnError: true,
  verbose: process.env.DEBUG === 'true' || process.argv.includes('--verbose'),
});

import { DeploymentKit } from './deployer.js';
import { getStatusChecker } from './status/checker.js';
import { getRecoveryManager } from './recovery/manager.js';
import { runInit, type InitFlags } from './cli/init/index.js';
import { handleCloudFrontCommand } from './cli/commands/cloudfront.js';
import { handleValidateCommand } from './cli/commands/validate.js';
import { handleDoctorCommand } from './cli/commands/doctor.js';
import { handleDevCommand, type DevOptions } from './cli/commands/dev.js';
import { recover } from './cli/commands/recover.js';
import { handleReleaseCommand, type ReleaseType } from './cli/commands/release.js';
import { setupCCW } from './cli/commands/ccw.js';
import { setupRemoteDeploy } from './cli/commands/remote-deploy.js';
import { handleSecretsCommand } from './cli/commands/secrets.js';
import { resolveAwsProfile, logAwsProfile } from './cli/utils/aws-profile-detector.js';
import { validateConfig } from './cli/utils/config-validator.js';
import type { DeploymentStage } from './types.js';
import type { UnvalidatedConfig } from './cli/utils/config-validator.js';
import { getFormattedVersion } from './cli/utils/version.js';
import { runPreDeploymentChecks } from './pre-deployment/index.js';
import { runSstEnvironmentChecks } from './shared/sst-checks/index.js';
import { DeploymentProgress } from './lib/deployment-progress.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const stage = args[1] as DeploymentStage;

// Main async function to handle all commands
async function cli() {
  // ============================================================================
  // NEW: Terminal UI Mode
  // ============================================================================

  // Launch terminal UI if no command specified (just `dk`)
  if (!command || command === '--tui') {
    const { launchTerminalUI } = await import('./cli/tui/index.js');
    launchTerminalUI();
    return;
  }

  // Launch web dashboard mode (dk --web)
  if (command === '--web' || command === 'dashboard') {
    console.log(chalk.bold.cyan('\n🚀 Deploy-Kit Command Center'));
    console.log(chalk.gray('Opening web dashboard...\n'));

    // Start dashboard server (similar to dev command but without SST)
    const { DashboardServer } = await import('./dashboard/server.js');
    const dashboardServer = new DashboardServer();

    try {
      const url = await dashboardServer.start();
      console.log(chalk.green(`✅ Dashboard running at: ${chalk.bold(url)}`));
      console.log(chalk.gray('\nPress Ctrl+C to stop the server\n'));

      // Keep process alive
      await new Promise(() => {});
    } catch (error) {
      console.error(chalk.red('❌ Failed to start dashboard:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
    return;
  }

  // ============================================================================
  // Existing command handling
  // ============================================================================

  // Handle early commands that don't require config file
  if (command === 'init') {
    // Parse init flags
    const flags: InitFlags = {
      configOnly: args.includes('--config-only'),
      scriptsOnly: args.includes('--scripts-only'),
      nonInteractive: args.includes('--non-interactive'),
      withQualityTools: args.includes('--with-quality-tools'),
      projectName: args.find(a => a.startsWith('--project-name='))?.split('=')[1],
      domain: args.find(a => a.startsWith('--domain='))?.split('=')[1],
      awsProfile: args.find(a => a.startsWith('--aws-profile='))?.split('=')[1],
      awsRegion: args.find(a => a.startsWith('--aws-region='))?.split('=')[1],
    };

    try {
      await runInit(process.cwd(), flags);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Init error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'validate') {
    try {
      await handleValidateCommand(process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Validation error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'doctor') {
    try {
      await handleDoctorCommand(process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Doctor error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'secrets') {
    try {
      await handleSecretsCommand(process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Secrets wizard error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'ccw') {
    try {
      await setupCCW(process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ CCW setup error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'remote-deploy') {
    try {
      await setupRemoteDeploy(process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Remote deploy setup error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'release') {
    const releaseType = args[1] as ReleaseType;
    const validTypes: ReleaseType[] = ['patch', 'minor', 'major'];

    if (!releaseType || !validTypes.includes(releaseType)) {
      console.log(chalk.red('\n❌ Invalid or missing release type'));
      console.log(chalk.gray('\nUsage: deploy-kit release <type> [flags]'));
      console.log(chalk.gray('\nRelease types:'));
      console.log(chalk.cyan('  patch  ') + '- Bug fixes (2.8.0 → 2.8.1)');
      console.log(chalk.cyan('  minor  ') + '- New features (2.8.0 → 2.9.0)');
      console.log(chalk.cyan('  major  ') + '- Breaking changes (2.8.0 → 3.0.0)');
      console.log(chalk.gray('\nFlags:'));
      console.log(chalk.cyan('  --dry-run     ') + '- Preview release without making changes');
      console.log(chalk.cyan('  --skip-tests  ') + '- Skip test validation (use with caution)');
      console.log(chalk.gray('\nExamples:'));
      console.log(chalk.gray('  deploy-kit release minor --dry-run'));
      console.log(chalk.gray('  deploy-kit release patch\n'));
      process.exit(1);
    }

    try {
      await handleReleaseCommand({
        type: releaseType,
        dryRun: args.includes('--dry-run'),
        skipTests: args.includes('--skip-tests'),
        cwd: process.cwd()
      });
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Release error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'recover') {
    const target = args[1];
    if (!target) {
      console.log(chalk.red('\n❌ Missing recovery target'));
      console.log(chalk.gray('\nAvailable targets:'));
      console.log(chalk.cyan('  deploy-kit recover cloudfront  ') + '- Fix stuck CloudFront distributions');
      console.log(chalk.cyan('  deploy-kit recover state       ') + '- Fix corrupted Pulumi state');
      console.log(chalk.cyan('  deploy-kit recover dev         ') + '- General dev environment recovery\n');
      process.exit(1);
    }

    try {
      await recover(target, process.cwd());
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Recovery error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === 'dev') {
    // Parse dev flags
    const portArg = args.find(a => a.startsWith('--port='))?.split('=')[1];

    const options: DevOptions = {
      skipChecks: args.includes('--skip-checks'),
      port: portArg ? parseInt(portArg, 10) : undefined,
      interactive: args.includes('--interactive'),
    };

    try {
      await handleDevCommand(process.cwd(), options);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('\n❌ Dev error:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelpMessage();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    // Read version dynamically from package.json (one level up from dist/)
    try {
      const packageJsonPath = resolve(dirname(new URL(import.meta.url).pathname), '../package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      console.log(`deploy-kit ${packageJson.version}`);
    } catch (error) {
      console.log('deploy-kit (version unknown)');
    }
    process.exit(0);
  }

  // Load config from current directory for config-dependent commands
  let config: UnvalidatedConfig;
  let projectRoot: string;
  try {
    const configPath = resolve(process.cwd(), '.deploy-config.json');
    projectRoot = dirname(configPath);
    const configContent = readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    console.error(chalk.red('❌ Error: .deploy-config.json not found in current directory'));
    process.exit(1);
  }

  // Validate configuration before use
  const validationResult = validateConfig(config);
  if (!validationResult.valid) {
    console.error(chalk.red('\n❌ Invalid configuration in .deploy-config.json:\n'));
    validationResult.errors.forEach(err => console.error(chalk.red(`   • ${err}`)));

    if (validationResult.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:\n'));
      validationResult.warnings.forEach(warn => console.log(chalk.yellow(`   • ${warn}`)));
    }

    console.log(chalk.gray('\n   Run: dk validate\n'));
    process.exit(1);
  }

  // Show warnings if any
  if (validationResult.warnings.length > 0) {
    validationResult.warnings.forEach(warn => console.log(chalk.yellow(`⚠️  ${warn}`)));
  }

  // Auto-detect AWS profile from sst.config.ts if not explicitly specified (for SST projects)
  const resolvedProfile = resolveAwsProfile(config as any, projectRoot);
  if (resolvedProfile && !config.awsProfile) {
    config.awsProfile = resolvedProfile;
  }

  // Handle config-dependent commands
  async function main() {
    switch (command) {
    case 'deploy':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit deploy <stage>'));
        console.error(chalk.gray('   Example: deploy-kit deploy staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\n❌ Invalid stage: ${stage}`));
        console.error(chalk.gray('   Valid stages: staging, production'));
        process.exit(1);
      }

      // Print deployment header with version
      printDeploymentHeader(stage);

      // Parse pre-deployment flags
      const skipChecks = args.includes('--skip-checks');
      const verbose = args.includes('--verbose');

      // Initialize deployment progress tracker
      const progress = new DeploymentProgress([
        'SST Environment Checks',
        'Quality Checks',
        'SST Deployment',
        'Post-Deployment Validation',
        'Health Verification'
      ]);

      // STAGE 1: Run SST environment checks (BEFORE quality checks for fast feedback)
      progress.startStage(1);
      console.log(chalk.bold.cyan(`\n${progress.getStageHeader(1)}`));
      console.log(chalk.gray('Fast feedback on SST environment issues before running expensive checks\n'));

      if (!skipChecks) {
        const sstChecksSummary = await runSstEnvironmentChecks(projectRoot, config as any, stage, verbose);
        if (!sstChecksSummary.allPassed) {
          progress.completeStage(1, false);
          console.log(chalk.red(`\n❌ ${progress.getFailureSummary(1)}`));
          console.log(chalk.gray('   Fix the SST environment issues above and try again'));
          console.log(chalk.gray('   Or use --skip-checks to bypass (not recommended)\n'));
          process.exit(1);
        }
        progress.completeStage(1, true);
      } else {
        progress.skipStage(1);
      }

      // Show progress bar after stage 1
      progress.printProgressBar();

      // STAGE 2: Run quality checks (TypeCheck, Tests, Build, Lint, E2E)
      progress.startStage(2);
      console.log(chalk.bold.cyan(`${progress.getStageHeader(2)}`));
      console.log(chalk.gray('Comprehensive code quality validation before deployment\n'));

      if (!skipChecks) {
        const checksSummary = await runPreDeploymentChecks(projectRoot, stage);
        if (!checksSummary.allPassed) {
          progress.completeStage(2, false);
          console.log(chalk.red(`\n❌ ${progress.getFailureSummary(2)}`));
          console.log(chalk.gray('   Fix the issues above and try again'));
          console.log(chalk.gray('   Or use --skip-checks to bypass (not recommended)\n'));
          process.exit(1);
        }
        progress.completeStage(2, true);
      } else {
        progress.skipStage(2);
        console.log(chalk.yellow('\n⚠️  WARNING: Skipping all deployment checks!'));
        console.log(chalk.yellow('   This should only be used for emergency hotfixes.'));
        console.log(chalk.yellow('   Deploy at your own risk.\n'));
      }

      // Show progress bar after stage 2
      progress.printProgressBar();

      // STAGE 3: SST Deployment
      progress.startStage(3);
      console.log(chalk.bold.cyan(`${progress.getStageHeader(3)}`));
      console.log(chalk.gray('Executing infrastructure deployment via SST\n'));

      // Parse observability flags
      const isDryRun = args.includes('--dry-run');
      const showDiff = args.includes('--show-diff');
      const benchmark = args.includes('--benchmark');
      const logLevelArg = args.find(a => a.startsWith('--log-level='))?.split('=')[1] as 'debug' | 'info' | 'warn' | 'error' | undefined;
      const metricsBackendArg = args.find(a => a.startsWith('--metrics-backend='))?.split('=')[1] as 'memory' | 'datadog' | 'cloudwatch' | 'prometheus' | undefined;

      // Parse maintenance mode flags
      const withMaintenanceMode = args.includes('--with-maintenance-mode');
      const maintenancePagePath = args.find(a => a.startsWith('--maintenance-page='))?.split('=')[1];

      // Parse SST health check flags
      const autoFix = args.includes('--auto-fix');
      const skipSSTBugChecks = args.includes('--skip-sst-bug-checks');

      const maintenanceOptions = withMaintenanceMode ? {
        customPagePath: maintenancePagePath,
      } : undefined;

      // Initialize kit with observability options
      const kit = new DeploymentKit(config as any, projectRoot, {
        logLevel: logLevelArg || (verbose ? 'debug' : 'info'),
        metricsBackend: metricsBackendArg || 'memory',
        verbose,
      });

      const result = await kit.deploy(stage, { isDryRun, showDiff, benchmark, skipPreChecks: true, autoFix, skipSSTBugChecks, maintenance: maintenanceOptions });

      // Complete stage 3 (SST Deployment)
      progress.completeStage(3, result.success);

      if (result.success) {
        // STAGE 4: Post-Deployment Validation (handled by DeploymentKit)
        progress.completeStage(4, true);

        // STAGE 5: Health Verification (handled by DeploymentKit)
        progress.completeStage(5, true);

        // Show final progress bar
        progress.printProgressBar();

        console.log(chalk.bold.green('\n✅ Deployment completed successfully!'));
        console.log(chalk.gray('   All stages passed\n'));
      } else {
        // Show progress bar on failure
        progress.printProgressBar();

        console.log(chalk.red(`\n❌ ${progress.getFailureSummary(3)}`));
        console.log(chalk.gray('   Check deployment logs above for details\n'));
      }

      // Deployment result is now printed by the deployer itself
      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
      break;

    case 'status':
      if (!stage) {
        console.log(chalk.bold.cyan('\n📊 Checking all deployment statuses...'));
        console.log(chalk.gray('Analyzing deployment state across all stages\n'));
        const statusChecker = getStatusChecker(config as any, process.cwd());
        await statusChecker.checkAllStages();
      } else {
        console.log(chalk.bold.cyan(`\n📊 Checking ${stage} deployment status...`));
        console.log(chalk.gray('Analyzing current deployment state\n'));
        const statusChecker = getStatusChecker(config as any, process.cwd());
        await statusChecker.checkStage(stage);
      }
      break;

    case 'recover':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit recover <stage>'));
        console.error(chalk.gray('   Example: deploy-kit recover staging'));
        process.exit(1);
      }

      if (stage !== 'staging' && stage !== 'production') {
        console.error(chalk.red(`\n❌ Invalid stage: ${stage}`));
        console.error(chalk.gray('   Valid stages: staging, production'));
        process.exit(1);
      }

      console.log(chalk.bold.yellow(`\n🔧 Recovering ${stage} deployment...`));
      console.log(chalk.gray('Clearing locks and preparing for retry\n'));
      const recovery = getRecoveryManager(config as any, projectRoot);
      await recovery.performFullRecovery(stage);
      console.log(chalk.green('\n✅ Recovery complete - ready to redeploy\n'));
      break;

    case 'health':
      if (!stage) {
        console.error(chalk.red('\n❌ Usage: deploy-kit health <stage>'));
        console.error(chalk.gray('   Example: deploy-kit health staging'));
        process.exit(1);
      }

      console.log(chalk.bold.cyan(`\n🏥 Running health checks for ${stage}...`));
      console.log(chalk.gray('Testing deployed application health\n'));
      const kitHealth = new DeploymentKit(config as any, projectRoot);
      const healthy = await kitHealth.validateHealth(stage);

      if (healthy) {
        console.log(chalk.green('\n✅ All health checks passed\n'));
        process.exit(0);
      } else {
        console.log(chalk.red('\n❌ Some health checks failed\n'));
        process.exit(1);
      }
      break;

    case 'cloudfront':
      const cfSubcommand = stage; // For cloudfront, second arg is subcommand
      const cfArgs = args.slice(2);
      await handleCloudFrontCommand(cfSubcommand, cfArgs, config as any, projectRoot);
      process.exit(0);
      break;

    default:
      if (command) {
        console.error(chalk.red(`\n❌ Unknown command: ${command}`));
      } else {
        console.error(chalk.red('\n❌ No command specified'));
      }
      console.error(chalk.gray('Run: deploy-kit --help\n'));
      process.exit(1);
  }
  }

  // Call main() for config-dependent commands
  try {
    await main();
  } catch (error) {
    console.error(chalk.red('\n❌ Command error:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

// Start the CLI
cli().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'));
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

/**
 * Print deployment header with version
 *
 * @param stage - Deployment stage (staging, production)
 */
function printDeploymentHeader(stage: string): void {
  const version = getFormattedVersion();
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan(`║       🚀 Deploying to ${stage.toUpperCase().padEnd(42)} ║`));
  console.log(chalk.bold.cyan(`║       Deploy-Kit ${version.padEnd(43)} ║`));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
}

function printHelpMessage(): void {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║       🚀 Deploy-Kit: Production Deployment Toolkit        ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.bold('USAGE'));
  console.log('  dk <command> [options]\n');

  console.log(chalk.bold('COMMAND CENTER'));
  console.log(chalk.green('  dk') + '              Launch interactive command palette (terminal UI)');
  console.log(chalk.green('  dk --web') + '        Launch web dashboard command center');
  console.log(chalk.green('  dk dashboard') + '    Same as --web\n');

  console.log(chalk.bold('SETUP COMMANDS'));
  console.log(chalk.green('  init') + '            Initialize new project');
  console.log('                  --non-interactive    Run without prompts');
  console.log('                  --with-quality-tools Setup Husky + lint-staged');
  console.log('                  --project-name=NAME  Override project name');
  console.log('                  --domain=DOMAIN      Set main domain');
  console.log('                  --aws-profile=NAME   Set AWS profile');
  console.log('                  --aws-region=REGION  Set AWS region (default: eu-north-1)');
  console.log(chalk.green('  validate') + '        Validate .deploy-config.json');
  console.log(chalk.green('  doctor') + '          Run comprehensive health checks');
  console.log(chalk.green('  secrets') + '         Interactive SST secrets setup wizard');
  console.log(chalk.green('  ccw') + '             Setup Claude Code for the Web');
  console.log(chalk.green('  remote-deploy') + '   Setup GitHub Actions workflow\n');

  console.log(chalk.bold('DEVELOPMENT'));
  console.log(chalk.green('  dev') + '             Start SST dev server with enhanced output');
  console.log('                  --skip-checks        Skip pre-flight checks');
  console.log('                  --port=PORT          Custom port (default: 3000)');
  console.log('                  --interactive        Run setup wizard');
  console.log('                  --profile=PROFILE    Output: silent, normal, verbose, debug');
  console.log('                  --hide-info          Suppress info logs');
  console.log('                  --no-group           Disable message grouping');
  console.log('                  --native             Use raw SST output\n');

  console.log(chalk.bold('DEPLOYMENT'));
  console.log(chalk.green('  deploy <stage>') + '  Deploy to staging/production');
  console.log('                  --skip-checks        Skip quality checks');
  console.log('                  --dry-run            Preview without deploying');
  console.log('                  --show-diff          Show AWS resource changes');
  console.log('                  --auto-fix           Auto-fix SST 3.17 bugs');
  console.log('                  --skip-sst-bug-checks Skip SST bug detection');
  console.log('                  --verbose            Detailed logging');
  console.log('                  --benchmark          Show performance report');
  console.log('                  --log-level=LEVEL    debug, info, warn, error');
  console.log('                  --with-maintenance-mode  Show maintenance page during deploy\n');

  console.log(chalk.bold('MANAGEMENT'));
  console.log(chalk.green('  status [stage]') + '  Check deployment status');
  console.log(chalk.green('  health <stage>') + '  Run health checks');
  console.log(chalk.green('  recover <target>') + ' Recover from failures');
  console.log('                  Targets: cloudfront, state, dev');
  console.log(chalk.green('  cloudfront <cmd>') + '  Manage CloudFront distributions');
  console.log('                  Commands: audit, cleanup, report\n');

  console.log(chalk.bold('PACKAGE MANAGEMENT'));
  console.log(chalk.green('  release <type>') + '  Version, test, and publish');
  console.log('                  Types: patch, minor, major');
  console.log('                  --dry-run            Preview without publishing');
  console.log('                  --skip-tests         Skip test validation\n');

  console.log(chalk.bold('COMMON WORKFLOWS'));
  console.log(chalk.cyan('  dk init && dk dev') + '              Quick start new project');
  console.log(chalk.cyan('  dk doctor && dk deploy staging') + ' Deploy with checks');
  console.log(chalk.cyan('  dk deploy staging --dry-run') + '    Preview deployment');
  console.log(chalk.cyan('  dk status && dk health staging') + ' Check deployment health');
  console.log(chalk.cyan('  dk recover dev') + '                  Fix dev environment\n');

  console.log(chalk.bold('QUICK REFERENCE'));
  console.log(chalk.gray('  -h, --help        Show this help'));
  console.log(chalk.gray('  -v, --version     Show version\n'));

  console.log(chalk.bold('DOCUMENTATION'));
  console.log('  https://github.com/duersjefen/deploy-kit\n');
}
