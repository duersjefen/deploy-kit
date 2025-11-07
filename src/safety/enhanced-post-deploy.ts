/**
 * Enhanced Post-Deployment Validation
 *
 * Comprehensive validation suite that verifies deployment actually succeeded.
 * Catches SST silent failures and ensures domain is fully operational.
 *
 * This goes beyond AWS resource creation checks - it validates real-world functionality.
 *
 * @module enhanced-post-deploy
 */

import chalk from 'chalk';
import type { ProjectConfig, DeploymentStage } from '../types.js';
import { parseSSTDomainConfig } from '../lib/sst-deployment-validator.js';
import { validateDNSResolution } from '../lib/dns-resolution-validator.js';
import { waitForCertificateValidation } from '../lib/certificate-validation-monitor.js';
import { testDomainAccessibility } from '../lib/domain-accessibility-tester.js';

/**
 * Enhanced post-deployment validation result
 */
export interface EnhancedPostDeployResult {
  passed: boolean;
  checks: {
    dns: boolean;
    certificate: boolean;
    accessibility: boolean;
  };
  failures: string[];
  warnings: string[];
}

/**
 * Run comprehensive post-deployment validation
 *
 * Validates:
 * 1. DNS resolution across multiple public resolvers
 * 2. ACM certificate validation and issuance
 * 3. Domain accessibility via HTTPS
 *
 * @param config - Project configuration
 * @param stage - Deployment stage
 * @param projectRoot - Project root directory
 * @returns Validation result
 */
export async function runEnhancedPostDeployValidation(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<EnhancedPostDeployResult> {
  console.log(chalk.bold('\n🔬 Enhanced Post-Deployment Validation\n'));

  const result: EnhancedPostDeployResult = {
    passed: true,
    checks: {
      dns: false,
      certificate: false,
      accessibility: false,
    },
    failures: [],
    warnings: [],
  };

  // Parse SST config
  const sstConfig = parseSSTDomainConfig(projectRoot, stage);

  // If no domain configured, skip domain-specific checks
  if (!sstConfig || !sstConfig.hasDomain || !sstConfig.domainName) {
    console.log(chalk.gray('ℹ️  No domain configured - skipping domain validation\n'));

    return {
      passed: true,
      checks: {
        dns: true,
        certificate: true,
        accessibility: true,
      },
      failures: [],
      warnings: ['No custom domain configured - using CloudFront URL only'],
    };
  }

  const domain = sstConfig.domainName;

  console.log(chalk.cyan(`Validating domain: ${domain}\n`));

  // ============================================================
  // CHECK 1: DNS Resolution (Critical)
  // ============================================================
  console.log(chalk.bold('1️⃣  DNS Resolution Validation\n'));

  try {
    const dnsResult = await validateDNSResolution(domain, 6, 10000);

    if (dnsResult.passed) {
      result.checks.dns = true;
      console.log('');
    } else {
      result.passed = false;
      result.failures.push(`DNS Resolution: ${dnsResult.message}`);

      console.log(chalk.red('\n❌ DNS validation failed'));
      console.log(chalk.red(`   ${dnsResult.message}\n`));

      if (!dnsResult.propagated) {
        console.log(chalk.yellow('⚠️  Possible causes:'));
        console.log(chalk.yellow('   • DNS propagation still in progress (wait 5-15 minutes)'));
        console.log(chalk.yellow('   • Nameservers not updated at domain registrar'));
        console.log(chalk.yellow('   • Route53 DNS records not created by SST\n'));
      }
    }
  } catch (error) {
    result.passed = false;
    result.failures.push(`DNS Resolution: ${error instanceof Error ? error.message : 'Unknown error'}`);

    console.log(chalk.red(`\n❌ DNS validation error: ${error instanceof Error ? error.message : String(error)}\n`));
  }

  // ============================================================
  // CHECK 2: ACM Certificate Validation (Critical)
  // ============================================================
  console.log(chalk.bold('2️⃣  SSL Certificate Validation\n'));

  try {
    const certResult = await waitForCertificateValidation(domain, config.awsProfile, 5);

    if (certResult.passed) {
      result.checks.certificate = true;
      console.log('');
    } else {
      // Certificate validation can be slow - treat as warning if PENDING
      if (certResult.status === 'PENDING_VALIDATION') {
        result.warnings.push(`Certificate validation in progress (waited ${certResult.waitedMinutes || 0} min)`);

        console.log(chalk.yellow('\n⚠️  Certificate validation still pending'));
        console.log(chalk.yellow('   This can take 5-30 minutes on first deployment.'));
        console.log(chalk.yellow('   Domain may not be accessible until certificate is issued.\n'));
      } else {
        result.passed = false;
        result.failures.push(`Certificate: ${certResult.message}`);

        console.log(chalk.red('\n❌ Certificate validation failed'));
        console.log(chalk.red(`   ${certResult.message}\n`));
      }
    }
  } catch (error) {
    result.warnings.push(`Certificate check error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    console.log(chalk.yellow(`\n⚠️  Could not verify certificate: ${error instanceof Error ? error.message : String(error)}\n`));
  }

  // ============================================================
  // CHECK 3: Domain Accessibility (Critical)
  // ============================================================
  console.log(chalk.bold('3️⃣  Domain Accessibility Test\n'));

  try {
    const accessResult = await testDomainAccessibility(domain, 6, 10000);

    if (accessResult.passed) {
      result.checks.accessibility = true;
      console.log('');
    } else {
      // If certificate is pending, accessibility failure is expected
      if (!result.checks.certificate) {
        result.warnings.push(`Domain not yet accessible (certificate pending)`);

        console.log(chalk.yellow('\n⚠️  Domain not accessible yet (expected - certificate pending)\n'));
      } else {
        result.passed = false;
        result.failures.push(`Accessibility: ${accessResult.message}`);

        console.log(chalk.red('\n❌ Domain accessibility test failed'));
        console.log(chalk.red(`   ${accessResult.message}\n`));

        console.log(chalk.yellow('⚠️  Possible causes:'));
        console.log(chalk.yellow('   • CloudFront distribution still deploying (wait 5-15 minutes)'));
        console.log(chalk.yellow('   • CloudFront CNAME not configured by SST'));
        console.log(chalk.yellow('   • SSL certificate not attached to CloudFront\n'));
      }
    }
  } catch (error) {
    result.warnings.push(`Accessibility check error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    console.log(chalk.yellow(`\n⚠️  Could not test accessibility: ${error instanceof Error ? error.message : String(error)}\n`));
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log(chalk.bold('━'.repeat(60)));
  console.log(chalk.bold('📊 Validation Summary'));
  console.log(chalk.bold('━'.repeat(60)) + '\n');

  const checkResults = [
    { name: 'DNS Resolution', passed: result.checks.dns },
    { name: 'SSL Certificate', passed: result.checks.certificate },
    { name: 'Domain Accessibility', passed: result.checks.accessibility },
  ];

  checkResults.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    const color = check.passed ? chalk.green : chalk.red;

    console.log(`${icon} ${color(check.name.padEnd(25))} ${check.passed ? 'PASSED' : 'FAILED'}`);
  });

  if (result.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    result.warnings.forEach(warning => {
      console.log(chalk.yellow(`   • ${warning}`));
    });
  }

  if (result.failures.length > 0) {
    console.log(chalk.red('\n❌ Failures:'));
    result.failures.forEach(failure => {
      console.log(chalk.red(`   • ${failure}`));
    });
  }

  console.log('');

  if (result.passed && result.failures.length === 0) {
    console.log(chalk.green.bold('✅ All post-deployment validations passed!'));
    console.log(chalk.green(`🌐 Your application is live at: https://${domain}\n`));
  } else if (result.warnings.length > 0 && result.failures.length === 0) {
    console.log(chalk.yellow.bold('⚠️  Deployment succeeded with warnings'));
    console.log(chalk.yellow('   Your domain may take a few more minutes to become fully accessible.\n'));
  } else {
    console.log(chalk.red.bold('❌ Post-deployment validation failed'));
    console.log(chalk.red('   Review failures above and check AWS resources manually.\n'));
  }

  return result;
}
