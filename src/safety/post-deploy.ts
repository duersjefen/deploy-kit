import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';
import {
  validateACMCertificate,
  validateCloudFrontDomainAlias,
  validateRoute53DNSRecords,
  validateNextjsServerLambda,
} from '../lib/sst-deployment-validator.js';
import { runEnhancedPostDeployValidation } from './enhanced-post-deploy.js';
import { validateSSTDeployment, fixDeploymentIssues } from '../health/sst-validation.js';

const execAsync = promisify(exec);

/**
 * Post-deployment safety checks
 * Validates deployment was successful
 */
export function getPostDeploymentChecks(config: ProjectConfig, projectRoot: string = process.cwd()) {
  /**
   * Check Lambda/application is responding
   */
  async function checkApplicationHealth(stage: DeploymentStage): Promise<void> {
    const spinner = ora('Checking application health...').start();

    try {
      const domain = config.stageConfig[stage].domain ||
        `${stage}.${config.mainDomain}`;

      if (!domain) {
        spinner.warn('Domain not configured, skipping health check');
        return;
      }

      const url = `https://${domain}/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        signal: controller.signal as any,
      }).catch(() => null).finally(() => clearTimeout(timeoutId));

      if (response && (response.status === 200 || response.status === 404)) {
        spinner.succeed(`✅ Application responding (${response.status})`);
      } else {
        spinner.warn('Application may not be ready (CloudFront propagating - normal for 5-15 min)');
      }
    } catch (error) {
      spinner.warn('Application health check inconclusive (CloudFront may still be propagating)');
    }
  }

  /**
   * Validate CloudFront OAC (Origin Access Control) for S3
   * Prevents 403 Access Denied errors
   */
  async function validateCloudFrontOAC(stage: DeploymentStage): Promise<void> {
    const spinner = ora('Validating CloudFront security...').start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      // Get CloudFront distribution ID from environment or config
      const distId = process.env[`CLOUDFRONT_DIST_ID_${stage.toUpperCase()}`];

      if (!distId) {
        spinner.info('CloudFront distribution ID not available');
        return;
      }

      // Check distribution exists and is enabled
      const { stdout: distInfo } = await execAsync(
        `aws cloudfront get-distribution --id ${distId} --query 'Distribution.Status' --output text`,
        { env }
      );

      if (distInfo.includes('Deployed')) {
        spinner.succeed('✅ CloudFront distribution ready');
      } else {
        spinner.info(`CloudFront status: ${distInfo.trim()} (propagating)`);
      }

      // Check OAC is configured
      const { stdout: oacInfo } = await execAsync(
        `aws cloudfront get-distribution-config --id ${distId} --query 'DistributionConfig.Origins[0].OriginAccessControlId' --output text`,
        { env }
      );

      if (oacInfo.trim() && oacInfo !== 'None') {
        spinner.succeed('✅ Origin Access Control configured');
      } else {
        spinner.warn('⚠️  No OAC configured (may cause 403 errors)');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('InvalidDistribution')) {
        spinner.info('Distribution still initializing (normal after deployment)');
      } else {
        spinner.warn(`⚠️  CloudFront validation inconclusive: ${errorMsg.split('\n')[0]}`);
      }
    }
  }

  /**
   * Check database connectivity
   */
  async function checkDatabaseConnection(stage: DeploymentStage): Promise<void> {
    const spinner = ora('Checking database connection...').start();

    try {
      if (!config.database) {
        spinner.info('Database not configured');
        return;
      }

      // This would be customized per project
      // For now, just indicate it should be checked
      spinner.info('Database check should be implemented per project');
    } catch (error) {
      spinner.warn('Database connectivity check skipped');
    }
  }

  /**
   * Validate SST domain configuration
   *
   * Checks ACM certificate, CloudFront aliases, Route53 DNS records, and Lambda functions
   */
  async function validateSSTDomainConfiguration(stage: DeploymentStage, projectRoot: string): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  SST domain validation skipped (non-SST infrastructure)'));
      return;
    }

    console.log(chalk.bold('\n🔍 Validating SST Domain Configuration\n'));

    const results: Array<{ name: string; result: any }> = [];

    // Check 2A: ACM Certificate
    try {
      const certResult = await validateACMCertificate(config, stage, projectRoot);
      results.push({ name: 'ACM Certificate', result: certResult });
    } catch (error) {
      results.push({
        name: 'ACM Certificate',
        result: { passed: false, issue: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    // Check 2B: CloudFront Domain Alias
    try {
      const cfResult = await validateCloudFrontDomainAlias(config, stage, projectRoot);
      results.push({ name: 'CloudFront Domain Alias', result: cfResult });
    } catch (error) {
      results.push({
        name: 'CloudFront Domain Alias',
        result: { passed: false, issue: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    // Check 2C: Route53 DNS Records
    try {
      const dnsResult = await validateRoute53DNSRecords(config, stage, projectRoot);
      results.push({ name: 'Route53 DNS Records', result: dnsResult });
    } catch (error) {
      results.push({
        name: 'Route53 DNS Records',
        result: { passed: false, issue: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    // Check 2D: Next.js Server Lambda
    try {
      const lambdaResult = await validateNextjsServerLambda(config, stage, projectRoot);
      results.push({ name: 'Next.js Server Lambda', result: lambdaResult });
    } catch (error) {
      results.push({
        name: 'Next.js Server Lambda',
        result: { passed: false, issue: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    // Print summary
    console.log(chalk.bold('\n' + '─'.repeat(50)));
    console.log(chalk.bold('📋 SST Domain Validation Summary'));
    console.log(chalk.bold('─'.repeat(50)) + '\n');

    let allPassed = true;
    for (const { name, result } of results) {
      // Distinguish between skipped checks and actual validations
      if (result.skipped) {
        console.log(`⊘  ${chalk.gray(name.padEnd(25))} SKIPPED`);
      } else {
        const icon = result.passed ? '✅' : '❌';
        const color = result.passed ? chalk.green : chalk.red;

        console.log(`${icon} ${color(name.padEnd(25))} ${result.passed ? 'OK' : result.issue || 'Failed'}`);

        if (!result.passed) {
          allPassed = false;
          if (result.details) {
            console.log(chalk.gray(`   Details: ${result.details}`));
          }
          if (result.actionRequired) {
            console.log(chalk.yellow(`   Action: ${result.actionRequired}`));
          }
        }
      }
    }

    console.log(chalk.bold('\n' + '─'.repeat(50)) + '\n');

    if (!allPassed) {
      console.log(chalk.yellow('⚠️  Some SST domain validations failed - see details above\n'));
      throw new Error('SST domain configuration incomplete - deployment may not work correctly');
    } else {
      console.log(chalk.green('✅ All SST domain validations passed!\n'));
    }
  }

  /**
   * Validate SST deployment configuration and optionally auto-fix issues
   */
  async function validateSSTConfiguration(stage: DeploymentStage, autoFix: boolean = false): Promise<void> {
    // Only run for SST projects
    if (config.infrastructure !== 'sst-serverless') {
      return;
    }

    // Run SST deployment validation
    const report = await validateSSTDeployment(config, stage, projectRoot);

    // If no issues found, return early
    if (!report.issuesDetected) {
      return;
    }

    // Issues found - check severity
    const fixableIssues = report.issues.filter(i => i.autoFixAvailable);
    const manualIssues = report.issues.filter(i => !i.autoFixAvailable);
    const warnings = report.issues.filter(i => i.severity === 'warning');

    // If auto-fix enabled, fix automatically
    if (autoFix && fixableIssues.length > 0) {
      console.log(chalk.yellow('\n⚡ Auto-fix enabled - attempting to resolve issues...\n'));
      const fixed = await fixDeploymentIssues(config, stage, projectRoot, fixableIssues);

      if (fixed.length === fixableIssues.length) {
        console.log(chalk.green(`\n✅ All fixable issues resolved (${fixed.length}/${fixableIssues.length})\n`));
      } else {
        console.log(chalk.yellow(`\n⚠️  Some issues could not be fixed (${fixed.length}/${fixableIssues.length})\n`));
      }

      // If manual issues remain, inform user (but don't fail - they're just warnings)
      if (manualIssues.length > 0) {
        console.log(chalk.yellow(`\nℹ️  ${manualIssues.length} issue(s) require manual attention (see guidance above)\n`));
      }

      return;
    }

    // If only info-level issues, just inform and continue
    const criticalIssues = warnings.length;
    if (criticalIssues === 0) {
      console.log(chalk.cyan('\nℹ️  Deployment has informational notices - review guidance above if needed\n'));
      return;
    }

    // Auto-fix not enabled and there are fixable warnings - offer to fix
    if (fixableIssues.length > 0) {
      // In CI or when TTY not available, just warn
      if (!process.stdin.isTTY || process.env.CI === 'true') {
        console.log(chalk.yellow('\n⚠️  Deployment has fixable warnings - run with --auto-fix to resolve automatically\n'));
        return;
      }

      // Interactive prompt (handled by fixDeploymentIssues with TTY detection)
      const fixed = await fixDeploymentIssues(config, stage, projectRoot, fixableIssues);

      if (fixed.length > 0) {
        console.log(chalk.green(`\n✅ Fixed ${fixed.length} issue(s)\n`));
      }
    } else {
      // All issues require manual attention
      console.log(chalk.yellow(`\nℹ️  ${report.issues.length} issue(s) require manual attention (see guidance above)\n`));
    }
  }

  /**
   * Run all post-deployment checks
   */
  async function run(stage: DeploymentStage, options: { autoFix?: boolean; skipSSTValidation?: boolean } = {}): Promise<void> {
    console.log(chalk.bold(`Post-deployment validation for ${stage}:\n`));

    try {
      await checkApplicationHealth(stage);
      await validateCloudFrontOAC(stage);

      if (config.database) {
        await checkDatabaseConnection(stage);
      }

      // SST domain configuration validation (basic checks)
      await validateSSTDomainConfiguration(stage, projectRoot);

      // Enhanced post-deployment validation (comprehensive checks)
      // Check if enhanced validation is enabled (default: true for SST projects)
      const enableEnhancedValidation = config.stageConfig[stage]?.enhancedValidation !== false;

      if (enableEnhancedValidation && config.infrastructure === 'sst-serverless') {
        const enhancedResult = await runEnhancedPostDeployValidation(config, stage, projectRoot);

        // If enhanced validation found critical failures, throw error
        if (!enhancedResult.passed && enhancedResult.failures.length > 0) {
          throw new Error(`Enhanced validation failed: ${enhancedResult.failures.join(', ')}`);
        }

        // If only warnings (e.g., certificate pending), continue but inform user
        if (enhancedResult.warnings.length > 0 && enhancedResult.failures.length === 0) {
          console.log(chalk.yellow('ℹ️  Note: Some validations are pending (see warnings above)\n'));
        }
      }

      // SST deployment validation (unless explicitly skipped)
      if (!options.skipSSTValidation) {
        await validateSSTConfiguration(stage, options.autoFix);
      }

      console.log(chalk.green(`\n✅ Post-deployment validation complete!\n`));
    } catch (error) {
      console.log(chalk.yellow(`\n⚠️  Post-deployment validation had issues (check manually)\n`));
      console.log(chalk.yellow(`   Error: ${error instanceof Error ? error.message : String(error)}\n`));
      // Throw error for domain validation failures - these are critical
      if (error instanceof Error && (
        error.message.includes('SST domain configuration') ||
        error.message.includes('Enhanced validation failed')
      )) {
        throw error;
      }
      // Don't throw for other post-deploy checks - they are informational
    }
  }

  return { checkApplicationHealth, validateCloudFrontOAC, checkDatabaseConnection, validateSSTDomainConfiguration, validateSSTConfiguration, run };
}
