#!/usr/bin/env node
/**
 * Deploy-Kit CLI Entry Point
 * Production deployment orchestration for SST + Next.js + DynamoDB
 */
import { DeploymentKit } from './deployer.js';
import { getStatusChecker } from './status/checker.js';
import { getRecoveryManager } from './recovery/manager.js';
import { runInit } from './cli/init/index.js';
import { handleCloudFrontCommand } from './cli/commands/cloudfront.js';
import { handleValidateCommand } from './cli/commands/validate.js';
import { handleDoctorCommand } from './cli/commands/doctor.js';
import { handleDevCommand } from './cli/commands/dev.js';
import { recover } from './cli/commands/recover.js';
import { handleReleaseCommand } from './cli/commands/release.js';
import { setupCCW } from './cli/commands/ccw.js';
import { setupRemoteDeploy } from './cli/commands/remote-deploy.js';
import { resolveAwsProfile } from './cli/utils/aws-profile-detector.js';
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
const stage = args[1];
// Main async function to handle all commands
async function cli() {
    // Handle early commands that don't require config file
    if (command === 'init') {
        // Parse init flags
        const flags = {
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
        }
        catch (error) {
            console.error(chalk.red('\n❌ Init error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'validate') {
        try {
            await handleValidateCommand(process.cwd());
            process.exit(0);
        }
        catch (error) {
            console.error(chalk.red('\n❌ Validation error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'doctor') {
        try {
            await handleDoctorCommand(process.cwd());
            process.exit(0);
        }
        catch (error) {
            console.error(chalk.red('\n❌ Doctor error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'ccw') {
        try {
            await setupCCW(process.cwd());
            process.exit(0);
        }
        catch (error) {
            console.error(chalk.red('\n❌ CCW setup error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'remote-deploy') {
        try {
            await setupRemoteDeploy(process.cwd());
            process.exit(0);
        }
        catch (error) {
            console.error(chalk.red('\n❌ Remote deploy setup error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'release') {
        const releaseType = args[1];
        const validTypes = ['patch', 'minor', 'major'];
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
        }
        catch (error) {
            console.error(chalk.red('\n❌ Release error:'));
            console.error(chalk.red(error.message));
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
        }
        catch (error) {
            console.error(chalk.red('\n❌ Recovery error:'));
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    }
    if (command === 'dev') {
        // Parse dev flags
        const portArg = args.find(a => a.startsWith('--port='))?.split('=')[1];
        const options = {
            skipChecks: args.includes('--skip-checks'),
            port: portArg ? parseInt(portArg, 10) : undefined,
            interactive: args.includes('--interactive'),
        };
        try {
            await handleDevCommand(process.cwd(), options);
            process.exit(0);
        }
        catch (error) {
            console.error(chalk.red('\n❌ Dev error:'));
            console.error(chalk.red(error.message));
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
        }
        catch (error) {
            console.log('deploy-kit (version unknown)');
        }
        process.exit(0);
    }
    // Load config from current directory for config-dependent commands
    let config;
    let projectRoot;
    try {
        const configPath = resolve(process.cwd(), '.deploy-config.json');
        projectRoot = dirname(configPath);
        const configContent = readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
    }
    catch (error) {
        console.error(chalk.red('❌ Error: .deploy-config.json not found in current directory'));
        process.exit(1);
    }
    // Auto-detect AWS profile from sst.config.ts if not explicitly specified (for SST projects)
    const resolvedProfile = resolveAwsProfile(config, projectRoot);
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
                    const sstChecksSummary = await runSstEnvironmentChecks(projectRoot, config, stage, verbose);
                    if (!sstChecksSummary.allPassed) {
                        progress.completeStage(1, false);
                        console.log(chalk.red(`\n❌ ${progress.getFailureSummary(1)}`));
                        console.log(chalk.gray('   Fix the SST environment issues above and try again'));
                        console.log(chalk.gray('   Or use --skip-checks to bypass (not recommended)\n'));
                        process.exit(1);
                    }
                    progress.completeStage(1, true);
                }
                else {
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
                }
                else {
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
                const logLevelArg = args.find(a => a.startsWith('--log-level='))?.split('=')[1];
                const metricsBackendArg = args.find(a => a.startsWith('--metrics-backend='))?.split('=')[1];
                // Parse canary deployment flags
                const enableCanary = args.includes('--canary');
                const initialArg = args.find(a => a.startsWith('--initial='))?.split('=')[1];
                const incrementArg = args.find(a => a.startsWith('--increment='))?.split('=')[1];
                const intervalArg = args.find(a => a.startsWith('--interval='))?.split('=')[1];
                const canaryOptions = enableCanary ? {
                    initial: initialArg ? parseInt(initialArg) : 10,
                    increment: incrementArg ? parseInt(incrementArg) : 10,
                    interval: intervalArg ? parseInt(intervalArg) : 300,
                } : undefined;
                // Parse maintenance mode flags
                const withMaintenanceMode = args.includes('--with-maintenance-mode');
                const maintenancePagePath = args.find(a => a.startsWith('--maintenance-page='))?.split('=')[1];
                const maintenanceOptions = withMaintenanceMode ? {
                    customPagePath: maintenancePagePath,
                } : undefined;
                // Initialize kit with observability options
                const kit = new DeploymentKit(config, projectRoot, {
                    logLevel: logLevelArg || (verbose ? 'debug' : 'info'),
                    metricsBackend: metricsBackendArg || 'memory',
                    verbose,
                });
                const result = await kit.deploy(stage, { isDryRun, showDiff, benchmark, skipPreChecks: true, canary: canaryOptions, maintenance: maintenanceOptions });
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
                }
                else {
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
                    const statusChecker = getStatusChecker(config, process.cwd());
                    await statusChecker.checkAllStages();
                }
                else {
                    console.log(chalk.bold.cyan(`\n📊 Checking ${stage} deployment status...`));
                    console.log(chalk.gray('Analyzing current deployment state\n'));
                    const statusChecker = getStatusChecker(config, process.cwd());
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
                const recovery = getRecoveryManager(config, projectRoot);
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
                const kitHealth = new DeploymentKit(config, projectRoot);
                const healthy = await kitHealth.validateHealth(stage);
                if (healthy) {
                    console.log(chalk.green('\n✅ All health checks passed\n'));
                    process.exit(0);
                }
                else {
                    console.log(chalk.red('\n❌ Some health checks failed\n'));
                    process.exit(1);
                }
                break;
            case 'canary':
                const canarySubcommand = stage; // For canary, second arg is subcommand
                const canaryDeploymentId = args[2];
                if (!canarySubcommand) {
                    console.error(chalk.red('\n❌ Usage: deploy-kit canary <status|rollback|complete> <deployment-id>'));
                    console.error(chalk.gray('   Example: deploy-kit canary status my-deployment-123'));
                    process.exit(1);
                }
                switch (canarySubcommand) {
                    case 'status':
                        if (!canaryDeploymentId) {
                            console.error(chalk.red('\n❌ Usage: deploy-kit canary status <deployment-id>'));
                            process.exit(1);
                        }
                        console.log(chalk.cyan(`\n📊 Canary Deployment Status: ${canaryDeploymentId}`));
                        console.log(chalk.yellow('\n⚠️  Canary status check not yet implemented'));
                        console.log(chalk.gray('This feature requires CloudFront weighted routing integration.\n'));
                        break;
                    case 'rollback':
                        if (!canaryDeploymentId) {
                            console.error(chalk.red('\n❌ Usage: deploy-kit canary rollback <deployment-id>'));
                            process.exit(1);
                        }
                        console.log(chalk.yellow(`\n🔄 Rolling back canary deployment: ${canaryDeploymentId}`));
                        console.log(chalk.yellow('\n⚠️  Canary rollback not yet implemented'));
                        console.log(chalk.gray('This feature requires CloudFront weighted routing integration.\n'));
                        break;
                    case 'complete':
                        if (!canaryDeploymentId) {
                            console.error(chalk.red('\n❌ Usage: deploy-kit canary complete <deployment-id>'));
                            process.exit(1);
                        }
                        console.log(chalk.green(`\n✅ Completing canary deployment: ${canaryDeploymentId}`));
                        console.log(chalk.yellow('\n⚠️  Canary complete not yet implemented'));
                        console.log(chalk.gray('This feature requires CloudFront weighted routing integration.\n'));
                        break;
                    default:
                        console.error(chalk.red(`\n❌ Unknown canary subcommand: ${canarySubcommand}`));
                        console.error(chalk.gray('Valid subcommands: status, rollback, complete\n'));
                        process.exit(1);
                }
                process.exit(0);
                break;
            case 'cloudfront':
                const cfSubcommand = stage; // For cloudfront, second arg is subcommand
                const cfArgs = args.slice(2);
                await handleCloudFrontCommand(cfSubcommand, cfArgs, config, projectRoot);
                process.exit(0);
                break;
            default:
                if (command) {
                    console.error(chalk.red(`\n❌ Unknown command: ${command}`));
                }
                else {
                    console.error(chalk.red('\n❌ No command specified'));
                }
                console.error(chalk.gray('Run: deploy-kit --help\n'));
                process.exit(1);
        }
    }
    // Call main() for config-dependent commands
    try {
        await main();
    }
    catch (error) {
        console.error(chalk.red('\n❌ Command error:'));
        console.error(chalk.red(error.message));
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
function printDeploymentHeader(stage) {
    const version = getFormattedVersion();
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan(`║       🚀 Deploying to ${stage.toUpperCase().padEnd(42)} ║`));
    console.log(chalk.bold.cyan(`║       Deploy-Kit ${version.padEnd(43)} ║`));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
}
function printHelpMessage() {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║       🚀 Deploy-Kit: Sophisticated Deployment Toolkit     ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));
    console.log(chalk.bold('USAGE'));
    console.log(chalk.gray('  deploy-kit <command> [stage]\n'));
    console.log(chalk.bold('COMMANDS'));
    console.log(chalk.green('  init [flags]'));
    console.log(chalk.gray('    Interactive setup wizard for new projects'));
    console.log(chalk.gray('    Creates .deploy-config.json and npm scripts'));
    console.log(chalk.gray('    Flags:'));
    console.log(chalk.gray('      --config-only           Only create .deploy-config.json'));
    console.log(chalk.gray('      --scripts-only          Only update npm scripts (requires existing config)'));
    console.log(chalk.gray('      --non-interactive       Non-interactive mode (for automation/Claude Code)'));
    console.log(chalk.gray('      --with-quality-tools    Setup Husky + lint-staged + tsc-files'));
    console.log(chalk.gray('      --project-name=<name>   Project name (kebab-case, overrides auto-detect)'));
    console.log(chalk.gray('      --domain=<domain>       Main domain (overrides default)'));
    console.log(chalk.gray('      --aws-profile=<name>    AWS profile name (overrides default)'));
    console.log(chalk.gray('      --aws-region=<region>   AWS region (default: eu-north-1)'));
    console.log(chalk.gray('    Examples:'));
    console.log(chalk.gray('      deploy-kit init'));
    console.log(chalk.gray('      deploy-kit init --config-only'));
    console.log(chalk.gray('      deploy-kit init --non-interactive --with-quality-tools'));
    console.log(chalk.gray('      deploy-kit init --non-interactive --project-name=my-app --domain=myapp.com\n'));
    console.log(chalk.green('  validate'));
    console.log(chalk.gray('    Validate .deploy-config.json configuration'));
    console.log(chalk.gray('    Checks: syntax, required fields, domains, health checks'));
    console.log(chalk.gray('    Example: deploy-kit validate\n'));
    console.log(chalk.green('  doctor'));
    console.log(chalk.gray('    Comprehensive pre-deployment health check'));
    console.log(chalk.gray('    Checks: config, git, AWS, SST, Node.js, tests'));
    console.log(chalk.gray('    Example: deploy-kit doctor\n'));
    console.log(chalk.green('  dev [flags]'));
    console.log(chalk.gray('    Start SST development server with enhanced output and pre-flight checks'));
    console.log(chalk.gray('    Checks: AWS credentials, locks, ports, Pulumi Output misuse'));
    console.log(chalk.gray('    Flags:'));
    console.log(chalk.gray('      --skip-checks          Skip all pre-flight checks'));
    console.log(chalk.gray('      --port=<number>        Custom port (default: 3000)'));
    console.log(chalk.gray('      --interactive          Run interactive setup wizard'));
    console.log(chalk.gray('      --profile=<profile>    Output profile: silent, normal, verbose, debug'));
    console.log(chalk.gray('      --hide-info            Suppress info/debug logs'));
    console.log(chalk.gray('      --no-group             Disable message grouping'));
    console.log(chalk.gray('      --verbose              Verbose output (alias for --profile=verbose)'));
    console.log(chalk.gray('      --quiet                Minimal output (DEPRECATED, use --profile=silent)'));
    console.log(chalk.gray('      --native               Use native SST output (bypass all filtering)'));
    console.log(chalk.gray('    Output Profiles:'));
    console.log(chalk.gray('      • silent:  Errors and ready state only'));
    console.log(chalk.gray('      • normal:  Balanced with smart grouping (default)'));
    console.log(chalk.gray('      • verbose: All messages with grouping'));
    console.log(chalk.gray('      • debug:   Include debug logs and traces'));
    console.log(chalk.gray('    Examples:'));
    console.log(chalk.gray('      deploy-kit dev                        # Normal mode with grouping'));
    console.log(chalk.gray('      deploy-kit dev --interactive          # Interactive wizard'));
    console.log(chalk.gray('      deploy-kit dev --profile=silent       # Minimal output'));
    console.log(chalk.gray('      deploy-kit dev --profile=verbose      # Detailed output'));
    console.log(chalk.gray('      deploy-kit dev --hide-info            # Suppress info logs'));
    console.log(chalk.gray('      deploy-kit dev --no-group             # Disable grouping'));
    console.log(chalk.gray('      deploy-kit dev --port=4000 --verbose  # Custom port + verbose\n'));
    console.log(chalk.green('  deploy <stage> [flags]'));
    console.log(chalk.gray('    Deploy to specified stage with full safety checks'));
    console.log(chalk.gray('    Stages: staging, production'));
    console.log(chalk.gray('    Flags:'));
    console.log(chalk.gray('      --skip-checks            Skip pre-deployment checks (tests, build, typecheck)'));
    console.log(chalk.gray('      --dry-run                Preview deployment without executing'));
    console.log(chalk.gray('      --show-diff              Show AWS resource diffs (CloudFront, SSL, DNS) before deployment'));
    console.log(chalk.gray('      --benchmark              Display detailed performance report after deployment'));
    console.log(chalk.gray('      --verbose                Enable detailed logging and debug output'));
    console.log(chalk.gray('      --log-level=<level>      Set log level: debug, info, warn, error (default: info)'));
    console.log(chalk.gray('      --metrics-backend=<type> Metrics backend: memory, datadog, cloudwatch, prometheus'));
    console.log(chalk.gray('      --canary                 Enable canary deployment with gradual traffic shifting'));
    console.log(chalk.gray('      --initial=<percentage>   Initial canary traffic percentage (default: 10)'));
    console.log(chalk.gray('      --increment=<percentage> Traffic increment per interval (default: 10)'));
    console.log(chalk.gray('      --interval=<seconds>     Seconds between traffic shifts (default: 300)'));
    console.log(chalk.gray('      --with-maintenance-mode  Show maintenance page during deployment (30-60s downtime)'));
    console.log(chalk.gray('      --maintenance-page=<path> Custom HTML maintenance page (optional)'));
    console.log(chalk.gray('    Examples:'));
    console.log(chalk.gray('      deploy-kit deploy staging'));
    console.log(chalk.gray('      deploy-kit deploy staging --dry-run'));
    console.log(chalk.gray('      deploy-kit deploy staging --dry-run --show-diff'));
    console.log(chalk.gray('      deploy-kit deploy staging --verbose'));
    console.log(chalk.gray('      deploy-kit deploy staging --benchmark'));
    console.log(chalk.gray('      deploy-kit deploy staging --log-level=debug --metrics-backend=datadog'));
    console.log(chalk.gray('      deploy-kit deploy staging --canary --initial=10 --increment=10 --interval=300'));
    console.log(chalk.gray('      deploy-kit deploy production --with-maintenance-mode\n'));
    console.log(chalk.green('  canary <subcommand> <deployment-id>'));
    console.log(chalk.gray('    Manage canary deployments with gradual traffic shifting'));
    console.log(chalk.gray('    Subcommands:'));
    console.log(chalk.gray('      status <id>     Check canary deployment status and traffic distribution'));
    console.log(chalk.gray('      rollback <id>   Rollback canary and restore 100% traffic to old version'));
    console.log(chalk.gray('      complete <id>   Complete canary and finalize 100% traffic to new version'));
    console.log(chalk.gray('    Example: deploy-kit canary status my-deployment-123\n'));
    console.log(chalk.green('  status [stage]'));
    console.log(chalk.gray('    Check deployment status for all stages or specific stage'));
    console.log(chalk.gray('    Detects: active locks, Pulumi state, previous failures'));
    console.log(chalk.gray('    Example: deploy-kit status\n'));
    console.log(chalk.green('  recover <stage>'));
    console.log(chalk.gray('    Recover from failed deployment'));
    console.log(chalk.gray('    Clears locks and prepares for retry'));
    console.log(chalk.gray('    Example: deploy-kit recover staging\n'));
    console.log(chalk.green('  health <stage>'));
    console.log(chalk.gray('    Run health checks for deployed application'));
    console.log(chalk.gray('    Tests: connectivity, database, API endpoints'));
    console.log(chalk.gray('    Example: deploy-kit health production\n'));
    console.log(chalk.green('  cloudfront <subcommand>'));
    console.log(chalk.gray('    Manage and audit CloudFront distributions'));
    console.log(chalk.gray('    Subcommands: audit, cleanup, report'));
    console.log(chalk.gray('    Example: deploy-kit cloudfront audit\n'));
    console.log(chalk.green('  release <type> [flags]'));
    console.log(chalk.gray('    Version, test, and publish the package'));
    console.log(chalk.gray('    Types: patch (bug fixes), minor (features), major (breaking)'));
    console.log(chalk.gray('    Flags:'));
    console.log(chalk.gray('      --dry-run      Preview release without making changes'));
    console.log(chalk.gray('      --skip-tests   Skip test validation (use with caution)'));
    console.log(chalk.gray('    Examples:'));
    console.log(chalk.gray('      deploy-kit release minor --dry-run'));
    console.log(chalk.gray('      deploy-kit release patch\n'));
    console.log(chalk.green('  --help, -h'));
    console.log(chalk.gray('    Show this help message\n'));
    console.log(chalk.green('  --version, -v'));
    console.log(chalk.gray('    Show version\n'));
    console.log(chalk.bold('FEATURES'));
    console.log(chalk.gray('  ✅ 5-stage automated deployment pipeline'));
    console.log(chalk.gray('  ✅ Integrated SSL certificate management'));
    console.log(chalk.gray('  ✅ Pre-deployment safety checks (git, tests, AWS)'));
    console.log(chalk.gray('  ✅ Post-deployment health validation'));
    console.log(chalk.gray('  ✅ Dual-lock deployment safety system'));
    console.log(chalk.gray('  ✅ CloudFront cache invalidation'));
    console.log(chalk.gray('  ✅ Comprehensive error recovery\n'));
    console.log(chalk.bold('EXAMPLES'));
    console.log(chalk.cyan('  # Initialize a new project'));
    console.log(chalk.gray('  $ deploy-kit init\n'));
    console.log(chalk.cyan('  # Validate configuration'));
    console.log(chalk.gray('  $ deploy-kit validate\n'));
    console.log(chalk.cyan('  # Run pre-deployment checks'));
    console.log(chalk.gray('  $ deploy-kit doctor\n'));
    console.log(chalk.cyan('  # Start SST development server'));
    console.log(chalk.gray('  $ deploy-kit dev\n'));
    console.log(chalk.cyan('  # Deploy to staging with full checks'));
    console.log(chalk.gray('  $ deploy-kit deploy staging\n'));
    console.log(chalk.cyan('  # Check deployment status'));
    console.log(chalk.gray('  $ deploy-kit status\n'));
    console.log(chalk.cyan('  # Recover from failure'));
    console.log(chalk.gray('  $ deploy-kit recover staging\n'));
    console.log(chalk.cyan('  # Validate health'));
    console.log(chalk.gray('  $ deploy-kit health production\n'));
    console.log(chalk.bold('DOCUMENTATION'));
    console.log(chalk.gray('  GitHub: https://github.com/duersjefen/deploy-kit'));
    console.log(chalk.gray('  Issues: https://github.com/duersjefen/deploy-kit/issues\n'));
}
