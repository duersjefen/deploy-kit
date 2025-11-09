import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ProjectConfig, DeploymentStage } from '../types.js';
import { ensureCertificateExists } from '../certificates/manager.js';
import {
  findReservedVarsInSstConfig,
  formatReservedVarError,
} from '../lib/lambda-reserved-vars.js';
import {
  ensureRoute53Zone,
  validateRoute53ZoneExistence,
  validateRoute53ZoneReadiness,
  validateOverrideRequirement,
  parseSSTDomainConfig,
  checkACMCertificate,
} from '../lib/sst-deployment-validator.js';
import { CloudFrontOperations } from '../lib/cloudfront/operations.js';
import prompts from 'prompts';
import { validateSstSecrets, projectUsesSecrets } from './sst-secret-validator.js';

const execAsync = promisify(exec);

/**
 * Pre-deployment safety checks
 * Ensures the project is ready for deployment
 */
export function getPreDeploymentChecks(config: ProjectConfig, projectRoot: string = process.cwd()) {
  // Track check results for summary
  const checks: Array<{
    name: string;
    status: 'success' | 'warning' | 'failed';
    message: string;
  }> = [];

  let checkCount = 0;
  const totalChecks = config.requireCleanGit !== false ? 1 : 0 + 1 + (config.runTestsBeforeDeploy !== false ? 1 : 0) + 1;

  /**
   * Check git status is clean
   */
  async function checkGitStatus(): Promise<void> {
    const spinner = ora('Checking git status...').start();
    const startTime = Date.now();

    try {
      if (config.requireCleanGit === false) {
        spinner.succeed('✅ Git check skipped');
        checks.push({ name: 'Git Status', status: 'warning', message: 'Skipped (requireCleanGit: false)' });
        return;
      }

      const { stdout: status } = await execAsync('git status --short', {
        cwd: projectRoot,
      });

      if (status.trim()) {
        spinner.fail('❌ Uncommitted changes found');
        console.log(chalk.red('\nUncommitted changes:'));
        console.log(status);
        checks.push({ name: 'Git Status', status: 'failed', message: 'Uncommitted changes found' });
        throw new Error('Commit all changes before deploying');
      }

      checkCount++;
      spinner.succeed(`✅ Git status clean (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ name: 'Git Status', status: 'success', message: 'Clean working directory' });
    } catch (error) {
      spinner.fail(`❌ Git check failed`);
      throw error;
    }
  }

  /**
   * Check AWS credentials
   */
  async function checkAwsCredentials(): Promise<void> {
    const spinner = ora('Checking AWS credentials...').start();
    const startTime = Date.now();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      const { stdout } = await execAsync('aws sts get-caller-identity', {
        env,
      });

      const identity = JSON.parse(stdout);
      checkCount++;
      spinner.succeed(`✅ AWS credentials valid (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ 
        name: 'AWS Credentials', 
        status: 'success', 
        message: `Account: ${identity.Account}` 
      });
    } catch (error) {
      spinner.fail('❌ AWS credentials not found or invalid');
      checks.push({ name: 'AWS Credentials', status: 'failed', message: 'Authentication failed' });
      throw error;
    }
  }

  /**\n * Run tests if configured\n   */
  async function runTests(): Promise<void> {
    if (config.runTestsBeforeDeploy === false) {
      console.log(chalk.gray('ℹ️  Tests skipped (runTestsBeforeDeploy: false)'));
      checks.push({ name: 'Tests', status: 'warning', message: 'Skipped by configuration' });
      return;
    }

    const spinner = ora('Running tests...').start();
    const startTime = Date.now();

    try {
      const { stdout } = await execAsync('npm test 2>&1', {
        cwd: projectRoot,
      });

      checkCount++;
      spinner.succeed(`✅ Tests passed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
      checks.push({ name: 'Tests', status: 'success', message: 'All tests passing' });
    } catch (error) {
      spinner.fail('❌ Tests failed');
      checks.push({ name: 'Tests', status: 'failed', message: 'Test suite failed' });
      throw error;
    }
  }

  /**
   * Check for reserved Lambda environment variables in SST config
   */
  async function checkLambdaReservedVars(): Promise<void> {
    const spinner = ora('Checking for reserved Lambda environment variables...').start();
    const startTime = Date.now();

    try {
      // Look for sst.config.ts or sst.config.js
      const configPaths = [
        join(projectRoot, 'sst.config.ts'),
        join(projectRoot, 'sst.config.js'),
      ];

      let configPath: string | null = null;
      let configContent: string | null = null;

      for (const path of configPaths) {
        if (existsSync(path)) {
          configPath = path;
          try {
            configContent = readFileSync(path, 'utf-8');
            break;
          } catch (error) {
            // Skip if cannot read
          }
        }
      }

      if (!configPath || !configContent) {
        spinner.succeed('✅ Reserved vars check skipped (no SST config found)');
        checks.push({ name: 'Lambda Reserved Vars', status: 'warning', message: 'No SST config found' });
        return;
      }

      // Find reserved variables in the config
      const violations = findReservedVarsInSstConfig(configContent);

      if (violations.length === 0) {
        checkCount++;
        spinner.succeed(`✅ No reserved Lambda variables detected (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        checks.push({ name: 'Lambda Reserved Vars', status: 'success', message: 'No violations' });
        return;
      }

      // Found reserved variables - fail check
      spinner.fail('❌ Reserved Lambda environment variables detected');
      console.log('\n' + chalk.red(formatReservedVarError(violations)) + '\n');
      checks.push({
        name: 'Lambda Reserved Vars',
        status: 'failed',
        message: `${violations.length} reserved variable(s) detected`
      });
      throw new Error('Reserved Lambda environment variables detected in SST config');
    } catch (error) {
      if ((error as Error).message.includes('Reserved Lambda')) {
        throw error; // Re-throw our error
      }
      // Other errors - warn but don't block
      spinner.warn('⚠️  Could not check for reserved Lambda variables');
      checks.push({ name: 'Lambda Reserved Vars', status: 'warning', message: 'Check failed' });
    }
  }

  /**
   * Ensure SSL certificate exists and is configured
   */
  async function checkSslCertificate(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  SSL certificate check skipped (non-SST infrastructure)'));
      checks.push({ name: 'SSL Certificate', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    try {
      const domain = config.stageConfig?.[stage]?.domain || config.mainDomain;
      if (!domain) {
        console.log(chalk.gray('ℹ️  SSL certificate check skipped (no domain configured)'));
        checks.push({ name: 'SSL Certificate', status: 'warning', message: 'Skipped (no domain)' });
        return;
      }

      const spinner = ora(`Checking SSL certificate for ${domain}...`).start();
      const startTime = Date.now();

      try {
        const arn = await ensureCertificateExists(domain, stage, projectRoot, config.awsProfile);
        checkCount++;
        const certId = arn.split('/').pop();
        spinner.succeed(`✅ SSL certificate ready (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        checks.push({ name: 'SSL Certificate', status: 'success', message: `Ready: ${certId}` });
      } catch (certError) {
        spinner.fail('❌ SSL certificate check failed');
        checks.push({ name: 'SSL Certificate', status: 'failed', message: 'Certificate setup failed' });
        throw certError;
      }
    } catch (error) {
      // If certificate setup fails, warn but don't block deployment
      console.log(chalk.yellow(`⚠️  SSL certificate check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.yellow('   You may need to set up the certificate manually.'));
      checks.push({
        name: 'SSL Certificate',
        status: 'warning',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check ACM certificate before deployment (DEP-22 Phase 3)
   *
   * Informational check - warns if certificate doesn't exist.
   * SST will create cert automatically, but first deploy will be slower.
   */
  async function checkACMCertificatePreDeploy(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  ACM certificate check skipped (non-SST infrastructure)'));
      checks.push({ name: 'ACM Certificate (Pre)', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    try {
      // Parse SST config to get domain
      const sstConfig = parseSSTDomainConfig(projectRoot, stage);

      if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
        console.log(chalk.gray('ℹ️  ACM certificate check skipped (no domain configured)'));
        checks.push({ name: 'ACM Certificate (Pre)', status: 'warning', message: 'Skipped (no domain)' });
        return;
      }

      const spinner = ora(`Checking ACM certificate for ${sstConfig.domainName}...`).start();
      const startTime = Date.now();

      try {
        const cert = await checkACMCertificate(sstConfig.domainName, config.awsProfile);

        if (!cert) {
          spinner.warn(`⚠️  No ACM certificate found for ${sstConfig.domainName}`);
          console.log(chalk.yellow('   SST will create one during deployment (takes 5-15 minutes)'));
          console.log(chalk.yellow('   First deployment will be slower than usual\n'));
          checks.push({
            name: 'ACM Certificate (Pre)',
            status: 'warning',
            message: 'Will be created by SST'
          });
          return;
        }

        if (cert.status !== 'ISSUED') {
          spinner.warn(`⚠️  ACM certificate status: ${cert.status}`);
          console.log(chalk.yellow(`   Certificate exists but not yet issued (${cert.status})`));
          console.log(chalk.yellow('   Deployment may wait for certificate validation\n'));
          checks.push({
            name: 'ACM Certificate (Pre)',
            status: 'warning',
            message: `Status: ${cert.status}`
          });
          return;
        }

        spinner.succeed(`✅ ACM certificate ready (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        checks.push({
          name: 'ACM Certificate (Pre)',
          status: 'success',
          message: 'Certificate issued and ready'
        });
      } catch (certError) {
        spinner.warn('⚠️  Could not check ACM certificate');
        checks.push({
          name: 'ACM Certificate (Pre)',
          status: 'warning',
          message: 'Check failed (non-blocking)'
        });
      }
    } catch (error) {
      console.log(chalk.gray(`ℹ️  ACM certificate check skipped: ${error instanceof Error ? error.message : 'Unknown error'}`));
      checks.push({
        name: 'ACM Certificate (Pre)',
        status: 'warning',
        message: 'Check failed (non-blocking)'
      });
    }
  }

  /**
   * Check and ensure Route53 hosted zone exists (DEP-19 Phase 1, DEP-20)
   *
   * This prevents deployment failures when SST requires Route53 zones.
   * Offers to auto-create zones if missing.
   */
  async function checkRoute53Zone(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  Route53 check skipped (non-SST infrastructure)'));
      checks.push({ name: 'Route53 Zone', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    const startTime = Date.now();

    try {
      // First, check if Route53 zone exists
      const existenceResult = await validateRoute53ZoneExistence(config, stage, projectRoot);

      if (!existenceResult.passed) {
        // Zone is missing - try to auto-create (DEP-20)
        console.log(chalk.yellow('\n⚠️  Route53 zone validation failed:'));
        console.log(chalk.yellow(`   ${existenceResult.issue}`));
        console.log(chalk.yellow(`   ${existenceResult.details}\n`));

        try {
          const zoneInfo = await ensureRoute53Zone(config, stage, projectRoot);

          if (zoneInfo) {
            checkCount++;
            checks.push({
              name: 'Route53 Zone',
              status: 'success',
              message: `Created: ${zoneInfo.zone.Id}`,
            });
          } else {
            // No zone needed (domain not configured)
            checks.push({
              name: 'Route53 Zone',
              status: 'warning',
              message: 'Skipped (no domain configured)',
            });
          }
        } catch (createError) {
          checks.push({
            name: 'Route53 Zone',
            status: 'failed',
            message: createError instanceof Error ? createError.message : 'Zone creation failed',
          });
          throw createError;
        }
      } else {
        // Zone exists - validate readiness (DEP-19 Phase 1, Check 1B)
        const readinessResult = await validateRoute53ZoneReadiness(config, stage, projectRoot);

        if (!readinessResult.passed) {
          checks.push({
            name: 'Route53 Zone',
            status: 'failed',
            message: readinessResult.issue || 'Zone not ready',
          });
          throw new Error(readinessResult.issue || 'Route53 zone validation failed');
        }

        checkCount++;
        checks.push({
          name: 'Route53 Zone',
          status: 'success',
          message: 'Ready for deployment',
        });
      }

      console.log(chalk.green(`✅ Route53 zone validated (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`));
    } catch (error) {
      console.log(chalk.red(`❌ Route53 zone check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      checks.push({
        name: 'Route53 Zone',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check CloudFront override requirement (DEP-26)
   *
   * Validates that override:true is present when adding domain to existing
   * CloudFront distribution without custom domain.
   */
  async function checkOverrideRequirement(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  Override requirement check skipped (non-SST infrastructure)'));
      checks.push({ name: 'CloudFront Override', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    const startTime = Date.now();

    try {
      const result = await validateOverrideRequirement(config, stage, projectRoot);

      if (!result.passed) {
        checks.push({
          name: 'CloudFront Override',
          status: 'failed',
          message: result.issue || 'Override required',
        });

        console.log(chalk.red('\n❌ Override requirement validation failed:'));
        console.log(chalk.red(`   ${result.issue}`));
        console.log(chalk.yellow(`\n${result.details}\n`));
        console.log(chalk.cyan(`💡 Fix: ${result.actionRequired}\n`));
        throw new Error(result.issue || 'Override:true required for updating existing distribution');
      }

      checkCount++;
      checks.push({
        name: 'CloudFront Override',
        status: 'success',
        message: 'No override required or present',
      });
      console.log(chalk.green(`✅ Override requirement validated (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`));
    } catch (error) {
      console.log(chalk.red(`❌ Override requirement check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      checks.push({
        name: 'CloudFront Override',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check CloudFront CNAME conflicts (DEP-35)
   *
   * Detects when existing CloudFront distributions have the same CNAME (alias)
   * as the domain being deployed. Offers automated cleanup options.
   *
   * Prevents deployment failures with AWS error:
   * "CNAMEAlreadyExists: One or more of the CNAMEs you provided are already
   *  associated with a different resource"
   */
  async function checkCloudFrontCnameConflicts(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  CloudFront CNAME check skipped (non-SST infrastructure)'));
      checks.push({ name: 'CloudFront CNAME', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    const startTime = Date.now();

    try {
      // Parse SST config to extract domain
      const sstConfig = parseSSTDomainConfig(projectRoot, stage);

      if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
        console.log(chalk.gray('ℹ️  CloudFront CNAME check skipped (no domain configured)'));
        checks.push({ name: 'CloudFront CNAME', status: 'warning', message: 'Skipped (no domain)' });
        return;
      }

      const spinner = ora(`Checking CloudFront CNAME conflicts for ${sstConfig.domainName}...`).start();

      try {
        // Check for CNAME conflicts
        const cfOps = new CloudFrontOperations(config, config.awsProfile);
        const conflicts = await cfOps.detectCnameConflicts(sstConfig.domainName);

        if (conflicts.length === 0) {
          checkCount++;
          spinner.succeed(`✅ No CloudFront CNAME conflicts detected (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
          checks.push({
            name: 'CloudFront CNAME',
            status: 'success',
            message: 'No conflicts detected',
          });
          return;
        }

        // Conflicts detected - display details
        spinner.fail(`❌ CloudFront CNAME conflicts detected for ${sstConfig.domainName}`);

        console.log(chalk.red(`\n❌ CNAME Conflict Detected\n`));
        console.log(chalk.yellow(`Found ${conflicts.length} CloudFront distribution(s) with conflicting CNAME: ${sstConfig.domainName}\n`));

        for (const conflict of conflicts) {
          console.log(chalk.gray(`  Distribution: ${conflict.distributionId}`));
          console.log(chalk.gray(`  Status: ${conflict.status} (${conflict.enabled ? 'Enabled' : 'Disabled'})`));
          console.log(chalk.gray(`  CloudFront Domain: ${conflict.domainName}`));
          console.log(chalk.gray(`  Aliases: ${conflict.aliases.join(', ')}\n`));
        }

        console.log(chalk.yellow(`\n⚠️  Without cleanup, SST deployment will fail with:\n`));
        console.log(chalk.red(`   CNAMEAlreadyExists: One or more of the CNAMEs you provided are`));
        console.log(chalk.red(`   already associated with a different resource\n`));

        // Offer cleanup options
        console.log(chalk.cyan('🔧 Automated Cleanup Options:\n'));
        console.log('  1. Remove CNAME from old distributions (Fast, ~1 minute)');
        console.log('  2. Delete old distributions (Slow, ~10-15 minutes)');
        console.log('  3. Show manual cleanup commands');
        console.log('  4. Abort deployment\n');

        const response = await prompts({
          type: 'select',
          name: 'action',
          message: 'How should I proceed?',
          choices: [
            { title: 'Auto-fix: Remove CNAMEs from old distributions', value: 'remove' },
            { title: 'Auto-fix: Delete old distributions', value: 'delete' },
            { title: 'Manual: Show me the AWS CLI commands', value: 'manual' },
            { title: 'Abort deployment', value: 'abort' },
          ],
          initial: 0,
        });

        switch (response.action) {
          case 'remove':
            console.log(chalk.cyan('\n🔧 Removing CNAMEs from conflicting distributions...\n'));
            await cfOps.removeCnamesFromDistributions(conflicts, sstConfig.domainName);
            console.log(chalk.green(`\n✅ CNAMEs removed successfully! Deployment can proceed.\n`));
            checkCount++;
            checks.push({
              name: 'CloudFront CNAME',
              status: 'success',
              message: 'Conflicts resolved (CNAMEs removed)',
            });
            break;

          case 'delete':
            console.log(chalk.cyan('\n🔧 Deleting conflicting distributions...\n'));
            console.log(chalk.yellow('⚠️  This operation takes 10-15 minutes. Please be patient.\n'));
            await cfOps.deleteDistributions(conflicts);
            console.log(chalk.green(`\n✅ Distributions deleted successfully! Deployment can proceed.\n`));
            checkCount++;
            checks.push({
              name: 'CloudFront CNAME',
              status: 'success',
              message: 'Conflicts resolved (distributions deleted)',
            });
            break;

          case 'manual':
            console.log(chalk.cyan('\n📋 Manual Cleanup Instructions:\n'));
            console.log(chalk.bold('Option 1: Remove CNAME (Fast, ~1 minute)\n'));

            for (const conflict of conflicts) {
              console.log(chalk.gray(`# For distribution ${conflict.distributionId}:`));
              console.log(chalk.white(`aws cloudfront get-distribution-config --id ${conflict.distributionId} > dist-config.json`));
              console.log(chalk.gray('# Edit dist-config.json: Remove "${sstConfig.domainName}" from Aliases'));
              console.log(chalk.white(`aws cloudfront update-distribution --id ${conflict.distributionId} --distribution-config file://dist-config.json --if-match <ETag>\n`));
            }

            console.log(chalk.bold('\nOption 2: Delete Distribution (Slow, ~10-15 minutes)\n'));

            for (const conflict of conflicts) {
              console.log(chalk.gray(`# Disable distribution first:`));
              console.log(chalk.white(`aws cloudfront get-distribution-config --id ${conflict.distributionId} > dist-config.json`));
              console.log(chalk.gray('# Edit dist-config.json: Set Enabled to false'));
              console.log(chalk.white(`aws cloudfront update-distribution --id ${conflict.distributionId} --distribution-config file://dist-config.json --if-match <ETag>`));
              console.log(chalk.gray('# Wait 5-15 minutes for deployment'));
              console.log(chalk.white(`aws cloudfront get-distribution --id ${conflict.distributionId}  # Check Status = Deployed`));
              console.log(chalk.white(`aws cloudfront delete-distribution --id ${conflict.distributionId} --if-match <ETag>\n`));
            }

            console.log(chalk.yellow('After manual cleanup, run: npx sst refresh'));
            console.log(chalk.yellow('Then retry deployment.\n'));

            checks.push({
              name: 'CloudFront CNAME',
              status: 'failed',
              message: 'Manual cleanup required',
            });
            throw new Error('CloudFront CNAME conflicts detected - manual cleanup required');

          case 'abort':
          default:
            checks.push({
              name: 'CloudFront CNAME',
              status: 'failed',
              message: 'Deployment aborted by user',
            });
            throw new Error('Deployment aborted due to CloudFront CNAME conflicts');
        }
      } catch (checkError) {
        // Re-throw if it's one of our expected errors
        if (
          (checkError as Error).message.includes('Deployment aborted') ||
          (checkError as Error).message.includes('manual cleanup required')
        ) {
          throw checkError;
        }

        // Otherwise, treat as warning
        spinner.warn('⚠️  Could not check CloudFront CNAME conflicts');
        checks.push({
          name: 'CloudFront CNAME',
          status: 'warning',
          message: 'Check failed (non-blocking)',
        });
        console.log(chalk.yellow(`⚠️  CloudFront CNAME check warning: ${(checkError as Error).message}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ CloudFront CNAME check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      checks.push({
        name: 'CloudFront CNAME',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check for conflicting Route53 CNAME records (DEP-43)
   * Detects CNAME records that conflict with SST A/AAAA alias records
   */
  async function checkRoute53CnameConflicts(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      console.log(chalk.gray('ℹ️  Route53 CNAME check skipped (non-SST infrastructure)'));
      checks.push({ name: 'Route53 CNAME', status: 'warning', message: 'Skipped (non-SST)' });
      return;
    }

    const startTime = Date.now();

    try {
      // Parse SST config to extract domain and zone
      const sstConfig = parseSSTDomainConfig(projectRoot, stage);

      if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
        console.log(chalk.gray('ℹ️  Route53 CNAME check skipped (no domain configured)'));
        checks.push({ name: 'Route53 CNAME', status: 'warning', message: 'Skipped (no domain)' });
        return;
      }

      if (!sstConfig.zoneId) {
        console.log(chalk.gray('ℹ️  Route53 CNAME check skipped (no zone ID)'));
        checks.push({ name: 'Route53 CNAME', status: 'warning', message: 'Skipped (no zone)' });
        return;
      }

      const spinner = ora(`Checking Route53 CNAME records for ${sstConfig.domainName}...`).start();

      try {
        // Get DNS records from Route53
        const cfOps = new CloudFrontOperations(config, config.awsProfile);
        const dnsRecords = await cfOps.getDNSRecords(sstConfig.zoneId);

        // Check for CNAME records at the configured domain
        const conflictingCnames = dnsRecords.filter(
          record => record.type === 'CNAME' && record.name === sstConfig.domainName
        );

        if (conflictingCnames.length === 0) {
          checkCount++;
          spinner.succeed(`✅ No conflicting Route53 CNAME records (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
          checks.push({
            name: 'Route53 CNAME',
            status: 'success',
            message: 'No conflicts detected',
          });
          return;
        }

        // Conflicts detected - display details
        const cnameValue = conflictingCnames[0].value;
        spinner.fail(`❌ Conflicting Route53 CNAME record detected`);

        console.log(chalk.red(`\n❌ Route53 CNAME Conflict\n`));
        console.log(chalk.yellow(`Domain: ${sstConfig.domainName}`));
        console.log(chalk.yellow(`CNAME Target: ${cnameValue}\n`));
        console.log(chalk.yellow(`Issue: CNAME record exists but SST needs A/AAAA alias records.`));
        console.log(chalk.yellow(`Route53 doesn't allow both at the same domain name.\n`));

        console.log(chalk.cyan('🔧 Fix Options:\n'));
        console.log('  1. Auto-delete the CNAME record (Recommended)');
        console.log('  2. Show manual deletion command');
        console.log('  3. Abort deployment\n');

        const response = await prompts({
          type: 'select',
          name: 'action',
          message: 'How should I proceed?',
          choices: [
            { title: 'Auto-delete the CNAME record', value: 'delete' },
            { title: 'Show me the manual command', value: 'manual' },
            { title: 'Abort deployment', value: 'abort' },
          ],
          initial: 0,
        });

        switch (response.action) {
          case 'delete':
            console.log(chalk.cyan('\n🔧 Deleting conflicting CNAME record...\n'));
            // Delete the CNAME record using AWS SDK
            try {
              await cfOps.deleteCnameRecord(sstConfig.zoneId, sstConfig.domainName, cnameValue, conflictingCnames[0].ttl || 300);
              console.log(chalk.green(`✅ CNAME record deleted successfully! Deployment can proceed.\n`));
              checkCount++;
              checks.push({
                name: 'Route53 CNAME',
                status: 'success',
                message: 'Conflict resolved (CNAME deleted)',
              });
            } catch (deleteError) {
              console.log(chalk.red(`❌ Failed to delete CNAME record: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`));
              checks.push({
                name: 'Route53 CNAME',
                status: 'failed',
                message: 'Auto-delete failed',
              });
              throw new Error('Failed to delete conflicting CNAME record');
            }
            break;

          case 'manual':
            console.log(chalk.cyan('\n📋 Manual Deletion Command:\n'));
            console.log(chalk.gray(`aws route53 change-resource-record-sets \\`));
            console.log(chalk.gray(`  --hosted-zone-id ${sstConfig.zoneId} \\`));
            console.log(chalk.gray(`  --change-batch '{`));
            console.log(chalk.gray(`    "Changes": [{`));
            console.log(chalk.gray(`      "Action": "DELETE",`));
            console.log(chalk.gray(`      "ResourceRecordSet": {`));
            console.log(chalk.gray(`        "Name": "${sstConfig.domainName}",`));
            console.log(chalk.gray(`        "Type": "CNAME",`));
            console.log(chalk.gray(`        "TTL": ${conflictingCnames[0].ttl || 300},`));
            console.log(chalk.gray(`        "ResourceRecords": [{"Value": "${cnameValue}"}]`));
            console.log(chalk.gray(`      }`));
            console.log(chalk.gray(`    }]`));
            console.log(chalk.gray(`  }'`));
            console.log(chalk.gray(`\nThen retry: npx deploy-kit deploy ${stage}\n`));
            checks.push({
              name: 'Route53 CNAME',
              status: 'failed',
              message: 'Manual deletion required',
            });
            throw new Error('Manual CNAME deletion required before deployment');

          default:
            checks.push({
              name: 'Route53 CNAME',
              status: 'failed',
              message: 'Deployment aborted by user',
            });
            throw new Error('Deployment aborted due to Route53 CNAME conflict');
        }
      } catch (checkError) {
        // Re-throw if it's one of our expected errors
        if (
          (checkError as Error).message.includes('Deployment aborted') ||
          (checkError as Error).message.includes('Manual CNAME deletion required')
        ) {
          throw checkError;
        }

        // Otherwise, treat as warning
        spinner.warn('⚠️  Could not check Route53 CNAME records');
        checks.push({
          name: 'Route53 CNAME',
          status: 'warning',
          message: 'Check failed (non-blocking)',
        });
        console.log(chalk.yellow(`⚠️  Route53 CNAME check warning: ${(checkError as Error).message}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Route53 CNAME check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      checks.push({
        name: 'Route53 CNAME',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Print check summary
   */
  function printSummary(): void {
    const successCount = checks.filter(c => c.status === 'success').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const failedCount = checks.filter(c => c.status === 'failed').length;

    console.log(chalk.bold('\n' + '═'.repeat(50)));
    console.log(chalk.bold('📋 Pre-Deployment Check Summary'));
    console.log(chalk.bold('═'.repeat(50)) + '\n');

    for (const check of checks) {
      const icon = check.status === 'success' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
      const color = check.status === 'success' ? chalk.green : check.status === 'warning' ? chalk.yellow : chalk.red;
      console.log(`${icon} ${color(check.name.padEnd(20))} ${check.message}`);
    }

    console.log('\n' + chalk.bold('─'.repeat(50)));
    console.log(`  ${chalk.green(`✅ Passed: ${successCount}`)} | ${chalk.yellow(`⚠️  Warnings: ${warningCount}`)} | ${chalk.red(`❌ Failed: ${failedCount}`)}`);
    console.log(chalk.bold('─'.repeat(50)) + '\n');
  }

  /**
   * Check SST secrets (DEP-38)
   * Validates that all declared secrets exist for the stage
   */
  async function checkSstSecrets(stage: DeploymentStage): Promise<void> {
    // Skip if project doesn't use secrets
    if (!projectUsesSecrets(projectRoot)) {
      checks.push({
        name: 'SST Secrets',
        status: 'success',
        message: 'No secrets declared (skipped)'
      });
      return;
    }

    const spinner = ora('Checking SST secrets...').start();
    const startTime = Date.now();

    try {
      const result = await validateSstSecrets(projectRoot, stage);

      if (!result.valid) {
        spinner.fail('❌ SST secret validation failed');
        checks.push({
          name: 'SST Secrets',
          status: 'failed',
          message: `Missing ${result.missingSecrets.length} secret(s)`
        });
        console.log('\n' + result.error + '\n');
        throw new Error('Missing required SST secrets');
      }

      checkCount++;
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      spinner.succeed(`✅ All SST secrets configured (${result.declaredSecrets.length} secrets, ${duration}s)`);
      checks.push({
        name: 'SST Secrets',
        status: 'success',
        message: `${result.declaredSecrets.length} secret(s) verified`
      });
    } catch (error) {
      if (error instanceof Error && error.message !== 'Missing required SST secrets') {
        spinner.fail(`❌ SST secret check failed`);
        checks.push({
          name: 'SST Secrets',
          status: 'warning',
          message: 'Check failed (continuing anyway)'
        });
        console.log(chalk.yellow(`⚠️  Could not validate secrets: ${error.message}`));
      } else {
        throw error;
      }
    }
  }

  /**
   * Warn when deploying SST without domain configuration
   *
   * Deploying without a domain is valid but results in:
   * - CloudFront URL only (no custom domain)
   * - No Route53 DNS records
   * - No ACM certificate
   */
  async function checkDomainConfiguration(stage: DeploymentStage): Promise<void> {
    if (config.infrastructure !== 'sst-serverless') {
      return; // Only check SST deployments
    }

    const sstConfig = parseSSTDomainConfig(projectRoot, stage);

    if (!sstConfig || !sstConfig.hasDomain) {
      console.log(chalk.yellow('\n⚠️  Domain Configuration Warning'));
      console.log(chalk.yellow('─'.repeat(50)));
      console.log(chalk.yellow('No domain configured for this deployment.\n'));
      console.log('Your application will be deployed with:');
      console.log(chalk.gray('  ✓ CloudFront distribution (e.g., d1234567890.cloudfront.net)'));
      console.log(chalk.gray('  ✓ Lambda functions and S3 assets'));
      console.log(chalk.gray('  ✗ No custom domain (e.g., staging.example.com)'));
      console.log(chalk.gray('  ✗ No Route53 DNS records'));
      console.log(chalk.gray('  ✗ No ACM certificate\n'));

      console.log('To add a custom domain, update your sst.config.ts:');
      console.log(chalk.gray('  domain: stage === "production" ? "example.com" : "staging.example.com"\n'));

      checks.push({
        name: 'Domain Configuration',
        status: 'warning',
        message: 'No custom domain configured'
      });

      const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Continue deployment without custom domain?',
        initial: true,
      });

      if (!response.continue) {
        checks.push({
          name: 'Domain Configuration',
          status: 'failed',
          message: 'Deployment cancelled by user'
        });
        throw new Error('Deployment cancelled - add domain configuration first');
      }
    } else {
      console.log(chalk.gray(`ℹ️  Domain configured: ${sstConfig.domainName || 'Yes'}`));
      checks.push({
        name: 'Domain Configuration',
        status: 'success',
        message: `Domain: ${sstConfig.domainName || 'Configured'}`
      });
    }
  }

  /**
   * Run all pre-deployment checks
   */
  async function run(stage: DeploymentStage): Promise<void> {
    console.log(chalk.bold(`\n🔐 Pre-Deployment Checks (${stage})\n`));
    console.log(chalk.bold('Starting safety validation...') + '\n');

    try {
      await checkGitStatus();
      await checkAwsCredentials();
      await checkLambdaReservedVars();

      if (config.runTestsBeforeDeploy !== false) {
        await runTests();
      }

      await checkSstSecrets(stage); // DEP-38 - Must run before deployment to prevent RangeError
      await checkDomainConfiguration(stage); // Warn when deploying without domain
      await checkSslCertificate(stage);
      await checkRoute53Zone(stage); // DEP-19 Phase 1 + DEP-20
      await checkRoute53CnameConflicts(stage); // DEP-43
      await checkCloudFrontCnameConflicts(stage); // DEP-35
      await checkOverrideRequirement(stage); // DEP-26
      await checkACMCertificatePreDeploy(stage); // DEP-22 Phase 3

      printSummary();
      console.log(chalk.green(`✨ All pre-deployment checks passed!\n`));
    } catch (error) {
      printSummary();
      console.log(chalk.red(`\n❌ Pre-deployment checks failed!\n`));
      throw error;
    }
  }

  return { checkGitStatus, checkAwsCredentials, runTests, checkLambdaReservedVars, checkSstSecrets, checkDomainConfiguration, checkSslCertificate, checkRoute53Zone, checkRoute53CnameConflicts, checkCloudFrontCnameConflicts, checkOverrideRequirement, checkACMCertificatePreDeploy, run };
}
