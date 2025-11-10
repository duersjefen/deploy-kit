import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';

const execAsync = promisify(exec);

/**
 * SST Deployment Validation Results
 */
export interface SSTValidationReport {
  issuesDetected: boolean;
  issues: SSTValidationIssue[];
  summary: string;
}

export interface SSTValidationIssue {
  type: 'config-mismatch' | 'incomplete-deployment' | 'configuration-drift' | 'empty-kvs';
  severity: 'warning' | 'info';
  description: string;
  details: string;
  guidance: string;
  autoFixAvailable: boolean;
}

/**
 * SST Intended Architecture (from sst.config.ts)
 */
interface SSTIntent {
  usesFunctionURLs: boolean;
  usesCloudFrontFunction: boolean;
  usesKeyValueStore: boolean;
}

/**
 * SST Deployment State (from AWS)
 */
interface SSTDeploymentState {
  distributionId?: string;
  functionName?: string;
  functionUrl?: string;
  origin?: string;
  protocolPolicy?: string;
  kvsArn?: string;
  kvsItemCount?: number | null;
  certificateArn?: string;
  certificateStatus?: string;
  certificateDomain?: string;
}

/**
 * Parse sst.config.ts to understand intended architecture
 *
 * Reads the project's SST configuration to determine what infrastructure
 * the user INTENDED to deploy. This is critical for accurate validation.
 */
async function parseIntendedArchitecture(projectRoot: string): Promise<SSTIntent> {
  try {
    const configPath = path.join(projectRoot, 'sst.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    return {
      // Lambda Function URLs explicitly enabled with url: true
      usesFunctionURLs: /url:\s*true/i.test(configContent),

      // CloudFront Functions use edge configuration
      usesCloudFrontFunction: /edge:\s*\{/i.test(configContent),

      // KeyValueStore explicitly configured
      usesKeyValueStore: /kvStore:/i.test(configContent),
    };
  } catch (error) {
    // If config can't be read, assume conservative defaults
    return {
      usesFunctionURLs: false,
      usesCloudFrontFunction: false,
      usesKeyValueStore: false,
    };
  }
}

/**
 * Get current SST deployment state from AWS
 *
 * Queries AWS to get the current state of deployed infrastructure.
 * Returns partial information gracefully (undefined for missing components).
 */
/**
 * Parse AWS CLI error and provide helpful guidance
 * 
 * Detects common AWS error types and returns user-friendly guidance
 */
/**
 * Simple in-memory cache for AWS deployment state
 * Reduces AWS API calls during validation
 */
interface CachedState {
  state: SSTDeploymentState;
  timestamp: number;
}

const deploymentStateCache = new Map<string, CachedState>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached deployment state if available and not expired
 */
function getCachedState(cacheKey: string): SSTDeploymentState | null {
  const cached = deploymentStateCache.get(cacheKey);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    deploymentStateCache.delete(cacheKey);
    return null;
  }

  return cached.state;
}

/**
 * Store deployment state in cache
 */
function setCachedState(cacheKey: string, state: SSTDeploymentState): void {
  deploymentStateCache.set(cacheKey, {
    state,
    timestamp: Date.now(),
  });
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, cached] of deploymentStateCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      deploymentStateCache.delete(key);
    }
  }
}

function parseAWSError(error: Error, operation: string): { type: string; guidance: string } {
  const message = error.message;

  // Access Denied - IAM permissions issue
  if (message.includes('AccessDenied') || message.includes('UnauthorizedOperation')) {
    return {
      type: 'access-denied',
      guidance: `AWS IAM permissions missing for ${operation}. Check AWS credentials and IAM policies.`,
    };
  }

  // Resource Not Found - normal for new deployments
  if (message.includes('NoSuchEntity') || message.includes('ResourceNotFoundException') || message.includes('FunctionUrlConfigNotFound')) {
    return {
      type: 'not-found',
      guidance: `Resource not yet created (normal for new deployments). ${operation} will be checked again.`,
    };
  }

  // Rate Limiting - too many requests
  if (message.includes('Throttling') || message.includes('TooManyRequests') || message.includes('RequestLimitExceeded')) {
    return {
      type: 'throttling',
      guidance: `AWS API rate limit exceeded. Wait 30 seconds and try again.`,
    };
  }

  // Invalid Parameters - configuration issue
  if (message.includes('InvalidParameterValue') || message.includes('ValidationException')) {
    return {
      type: 'invalid-input',
      guidance: `Invalid AWS parameter in ${operation}. Check sst.config.ts configuration.`,
    };
  }

  // Service Unavailable - AWS outage
  if (message.includes('ServiceUnavailable') || message.includes('InternalError')) {
    return {
      type: 'service-unavailable',
      guidance: `AWS service temporarily unavailable. Check AWS status page or retry in 5 minutes.`,
    };
  }

  // Invalid Distribution - CloudFront not ready
  if (message.includes('InvalidDistribution') || message.includes('NoSuchDistribution')) {
    return {
      type: 'distribution-not-ready',
      guidance: `CloudFront distribution not yet propagated (normal after deployment). Wait 5-15 minutes.`,
    };
  }

  // Timeout - command took too long
  if (message.includes('timed out') || message.includes('ETIMEDOUT')) {
    return {
      type: 'timeout',
      guidance: `AWS command timed out. Check network connectivity or increase timeout.`,
    };
  }

  // Generic error
  return {
    type: 'unknown',
    guidance: `AWS error in ${operation}: ${message.split('\\n')[0]}`,
  };
}

async function getDeploymentState(
  config: ProjectConfig,
  stage: DeploymentStage
): Promise<SSTDeploymentState> {
  // Check cache first
  const cacheKey = `${config.projectName || 'app'}-${stage}`;
  const cachedState = getCachedState(cacheKey);
  if (cachedState) {
    console.log(chalk.gray('   Using cached deployment state (5min TTL)'));
    return cachedState;
  }

  const state: SSTDeploymentState = {};

  const env = {
    ...process.env,
    ...(config.awsProfile && { AWS_PROFILE: config.awsProfile }),
  };

  const timeout = 30000; // 30s timeout for AWS commands

  try {
    // 1. Get CloudFront distribution ID from domain
    const domain = config.stageConfig[stage].domain || `${stage}.${config.mainDomain}`;

    if (domain) {
      const { stdout: distOutput } = await execAsync(
        `aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, '${domain}')]].Id | [0]" --output text`,
        { env, timeout }
      );

      state.distributionId = distOutput.trim() || undefined;

      // 2. If distribution found, get origin and protocol policy
      if (state.distributionId && state.distributionId !== 'None') {
        const { stdout: originOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${state.distributionId} --query 'DistributionConfig.Origins.Items[0].DomainName' --output text`,
          { env, timeout }
        );
        state.origin = originOutput.trim();

        const { stdout: protocolOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${state.distributionId} --query 'DistributionConfig.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy' --output text`,
          { env, timeout }
        );
        state.protocolPolicy = protocolOutput.trim();

        // Also check ACM certificate
        try {
          const { stdout: certArnOutput } = await execAsync(
            `aws cloudfront get-distribution --id ${state.distributionId} --query 'Distribution.DistributionConfig.ViewerCertificate.ACMCertificateArn' --output text`,
            { env, timeout }
          );

          const certArn = certArnOutput.trim();
          if (certArn && certArn !== 'None') {
            state.certificateArn = certArn;

            // Get certificate status and domain
            const { stdout: certStatusOutput } = await execAsync(
              `aws acm describe-certificate --certificate-arn ${certArn} --query 'Certificate.Status' --output text`,
              { env, timeout }
            );
            state.certificateStatus = certStatusOutput.trim();

            const { stdout: certDomainOutput } = await execAsync(
              `aws acm describe-certificate --certificate-arn ${certArn} --query 'Certificate.DomainName' --output text`,
              { env, timeout }
            );
            state.certificateDomain = certDomainOutput.trim();
          }
        } catch (error) {
          const { type } = parseAWSError(error as Error, 'acm-certificate');
          if (type !== 'not-found') {
            console.log(chalk.gray(`   Note: Could not check SSL certificate (${type})`));
          }
        }
      }
    }

    // 3. Find Lambda function (SST naming pattern: <app>-<stage>-*Function*)
    const appName = config.projectName || 'app';
    const { stdout: functionOutput } = await execAsync(
      `aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${appName}-${stage}-')].FunctionName | [0]" --output text`,
      { env, timeout }
    );

    state.functionName = functionOutput.trim() || undefined;

    // 4. If function found, check for Function URL
    if (state.functionName && state.functionName !== 'None') {
      try {
        const { stdout: urlOutput } = await execAsync(
          `aws lambda get-function-url-config --function-name ${state.functionName} --query 'FunctionUrl' --output text`,
          { env, timeout }
        );
        state.functionUrl = urlOutput.trim();
      } catch (error) {
        const { type } = parseAWSError(error as Error, 'get-function-url-config');
        // Function URL not configured is normal if not using url: true
        // Only log if it's a real error (not just "not found")
        if (type !== 'not-found') {
          console.log(chalk.gray(`   Note: Could not check Function URL (${type})`));
        }
        state.functionUrl = undefined;
      }
    }

    // 5. Check for CloudFront KeyValueStore (if CloudFront Function is used)
    if (state.distributionId) {
      try {
        // Get CloudFront Function associations
        const { stdout: cfFuncOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${state.distributionId} --query 'DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items[?FunctionARN!=\`null\`].FunctionARN | [0]' --output text`,
          { env, timeout }
        );

        const cfFunctionArn = cfFuncOutput.trim();

        if (cfFunctionArn && cfFunctionArn !== 'None') {
          // Get KVS associations for this CloudFront Function
          const cfFunctionName = cfFunctionArn.split('/').pop();
          const { stdout: kvsOutput } = await execAsync(
            `aws cloudfront list-key-value-stores --query "KeyValueStoreList.Items[?Name=='${cfFunctionName}'].ARN | [0]" --output text`,
            { env, timeout }
          );

          state.kvsArn = kvsOutput.trim() || undefined;

          // Check if KVS has items
          if (state.kvsArn && state.kvsArn !== 'None') {
            const kvsId = state.kvsArn.split('/').pop();
            const { stdout: itemCountOutput } = await execAsync(
              `aws cloudfront describe-key-value-store --key-value-store-id ${kvsId} --query 'ItemCount' --output text`,
              { env, timeout }
            );

            const itemCount = itemCountOutput.trim();
            state.kvsItemCount = itemCount === 'None' || itemCount === 'null' ? null : parseInt(itemCount);
          }
        }
      } catch (error) {
        const { type } = parseAWSError(error as Error, 'cloudfront-function/kvs');
        // No CloudFront Function or KVS is normal for many deployments
        if (type !== 'not-found' && type !== 'distribution-not-ready') {
          console.log(chalk.gray(`   Note: Could not check CloudFront Function/KVS (${type})`));
        }
      }
    }

  } catch (error) {
    // Parse error to provide helpful guidance
    const { type, guidance } = parseAWSError(error as Error, 'deployment-state');
    
    // Only log non-trivial errors
    if (type !== 'not-found') {
      console.log(chalk.yellow(`\n⚠️  AWS query issue: ${guidance}\n`));
    }
    
    // Return partial state - validation logic will handle missing resources
  }

  // Store in cache for future calls
  setCachedState(cacheKey, state);

  return state;
}

/**
 * Validate Lambda Function URL configuration
 *
 * Only checks if user INTENDED to use Function URLs (url: true in config).
 * If not configured, missing Function URL is normal and not an issue.
 */
async function validateFunctionURL(
  intent: SSTIntent,
  state: SSTDeploymentState,
  spinner: Ora
): Promise<SSTValidationIssue | null> {
  // If user didn't configure Function URLs, skip check
  if (!intent.usesFunctionURLs) {
    spinner.info('ℹ️  Lambda Function URLs not configured (using CloudFront → Lambda pattern)');
    return null;
  }

  // User configured Function URLs - verify they exist
  if (!state.functionName) {
    spinner.warn('⚠️  Lambda function not found yet');
    return {
      type: 'incomplete-deployment',
      severity: 'warning',
      description: 'Lambda function not found',
      details: 'Expected Lambda function not found in AWS.',
      guidance: 'Deployment may still be in progress. Wait 2-5 minutes and check again, or verify SST deployment succeeded.',
      autoFixAvailable: false,
    };
  }

  if (!state.functionUrl) {
    return {
      type: 'config-mismatch',
      severity: 'warning',
      description: 'Lambda Function URL not created',
      details: `Config has url: true but Function URL not found for ${state.functionName}.`,
      guidance: 'Check sst.config.ts syntax or wait for deployment to complete. If persists, manually create URL with: aws lambda create-function-url-config',
      autoFixAvailable: true,
    };
  }

  spinner.succeed(`✅ Lambda Function URL exists: ${state.functionUrl}`);
  return null;
}

/**
 * Validate CloudFront origin configuration
 *
 * Checks for temporary placeholder origins or mismatches between CloudFront and Lambda.
 * Only validates if user is using Function URLs.
 */
async function validateCloudFrontOrigin(
  intent: SSTIntent,
  state: SSTDeploymentState,
  spinner: Ora
): Promise<SSTValidationIssue | null> {
  if (!state.distributionId || !state.origin) {
    spinner.info('ℹ️  CloudFront distribution not fully initialized yet');
    return null;
  }

  // Check for temporary placeholder origins (transient state during deployment)
  if (state.origin.includes('placeholder') || state.origin.includes('sst.dev')) {
    return {
      type: 'incomplete-deployment',
      severity: 'warning',
      description: 'CloudFront origin is temporary placeholder',
      details: `Origin is currently ${state.origin}. This is a temporary state during SST deployment.`,
      guidance: 'Wait 2-5 minutes for SST to update the origin. If persists after 10 minutes, check SST logs or manually update origin.',
      autoFixAvailable: true,
    };
  }

  // If using Function URLs, verify CloudFront points to them
  if (intent.usesFunctionURLs && state.functionUrl) {
    const functionDomain = state.functionUrl.replace('https://', '');
    if (!state.origin.includes(functionDomain)) {
      return {
        type: 'configuration-drift',
        severity: 'warning',
        description: 'CloudFront origin mismatch',
        details: `CloudFront origin is ${state.origin} but Function URL is ${state.functionUrl}.`,
        guidance: 'These should match. Manually update CloudFront origin or redeploy with SST.',
        autoFixAvailable: true,
      };
    }
  }

  spinner.succeed(`✅ CloudFront origin configured: ${state.origin}`);
  return null;
}

/**
 * Validate origin protocol policy
 *
 * Lambda Function URLs ONLY accept HTTPS. If protocol policy is http-only,
 * CloudFront will get 403 errors.
 */
async function validateProtocolPolicy(
  intent: SSTIntent,
  state: SSTDeploymentState,
  spinner: Ora
): Promise<SSTValidationIssue | null> {
  if (!state.distributionId || !state.protocolPolicy) {
    spinner.info('ℹ️  CloudFront protocol policy not available yet');
    return null;
  }

  // Only validate if using Function URLs (which require HTTPS)
  if (intent.usesFunctionURLs && state.functionUrl && state.protocolPolicy !== 'https-only') {
    return {
      type: 'config-mismatch',
      severity: 'warning',
      description: 'Origin protocol policy is not https-only',
      details: `Protocol policy is ${state.protocolPolicy} but Lambda Function URLs require https-only.`,
      guidance: 'CloudFront will get 403 errors when trying to reach Lambda. Update protocol policy to https-only.',
      autoFixAvailable: true,
    };
  }

  spinner.succeed(`✅ Origin protocol policy: ${state.protocolPolicy}`);
  return null;
}

/**
 * Validate SSL/TLS certificate configuration
 */
async function validateSSLCertificate(
  config: ProjectConfig,
  stage: DeploymentStage,
  state: SSTDeploymentState,
  spinner: Ora
): Promise<SSTValidationIssue | null> {
  // If no distribution, skip certificate check
  if (!state.distributionId) {
    spinner.info('ℹ️  SSL certificate check skipped (no CloudFront distribution)');
    return null;
  }

  // Check if certificate exists
  if (!state.certificateArn) {
    return {
      type: 'config-mismatch',
      severity: 'warning',
      description: 'SSL certificate not found',
      details: 'CloudFront distribution exists but no ACM certificate configured.',
      guidance: 'Check SST domain configuration in sst.config.ts. Certificate may still be provisioning.',
      autoFixAvailable: false,
    };
  }

  // Check certificate status
  if (state.certificateStatus !== 'ISSUED') {
    const statusGuidance =
      state.certificateStatus === 'PENDING_VALIDATION'
        ? 'Add DNS CNAME records to validate certificate ownership.'
        : state.certificateStatus === 'FAILED'
        ? 'Certificate validation failed. Check domain ownership and DNS configuration.'
        : `Unexpected certificate status: ${state.certificateStatus}`;

    return {
      type: 'incomplete-deployment',
      severity: 'warning',
      description: `SSL certificate not issued (status: ${state.certificateStatus})`,
      details: `Certificate ${state.certificateArn} is in ${state.certificateStatus} state.`,
      guidance: statusGuidance,
      autoFixAvailable: false,
    };
  }

  // Verify certificate domain matches configured domain
  const configuredDomain = config.stageConfig[stage].domain || `${stage}.${config.mainDomain}`;
  if (state.certificateDomain && !state.certificateDomain.includes(configuredDomain)) {
    return {
      type: 'config-mismatch',
      severity: 'warning',
      description: 'SSL certificate domain mismatch',
      details: `Certificate is for ${state.certificateDomain}, but configured domain is ${configuredDomain}.`,
      guidance: 'Verify domain configuration in sst.config.ts or update certificate.',
      autoFixAvailable: false,
    };
  }

  spinner.succeed(`✅ SSL certificate valid: ${state.certificateDomain} (ISSUED)`);
  return null;
}

/**
 * Validate KeyValueStore population
 *
 * Only checks if user configured KVS. An empty KVS is only a problem if the
 * CloudFront Function code tries to access keys without error handling.
 */
async function validateKeyValueStore(
  intent: SSTIntent,
  state: SSTDeploymentState,
  spinner: Ora
): Promise<SSTValidationIssue | null> {
  // If user didn't configure KVS, skip check
  if (!intent.usesKeyValueStore) {
    if (state.kvsArn) {
      spinner.info('ℹ️  KeyValueStore exists but not configured in sst.config.ts');
    } else {
      spinner.info('ℹ️  KeyValueStore not in use');
    }
    return null;
  }

  // User configured KVS - verify it exists and has data
  if (!state.kvsArn) {
    spinner.warn('⚠️  KeyValueStore configured but not found in AWS');
    return {
      type: 'config-mismatch',
      severity: 'warning',
      description: 'KeyValueStore not found',
      details: 'Config has kvStore but KVS not found in AWS.',
      guidance: 'Verify SST deployment completed successfully and CloudFront Function is associated.',
      autoFixAvailable: false,
    };
  }

  // KVS exists - check if populated
  if (state.kvsItemCount === null || state.kvsItemCount === 0) {
    return {
      type: 'empty-kvs',
      severity: 'info',
      description: 'KeyValueStore is empty',
      details: `KVS exists (${state.kvsArn}) but has no items.`,
      guidance: 'CloudFront Function will crash if it tries to access KVS keys. Either populate KVS or update CloudFront Function to handle missing keys gracefully.',
      autoFixAvailable: false,
    };
  }

  spinner.succeed(`✅ KeyValueStore populated: ${state.kvsItemCount} items`);
  return null;
}

/**
 * Validate SST deployment against intended configuration
 *
 * Comprehensive validation that checks if AWS infrastructure matches what
 * the user configured in sst.config.ts. Only flags mismatches and incomplete
 * deployments, not missing optional features.
 *
 * @returns Validation report with issues and guidance
 */
export async function validateSSTDeployment(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<SSTValidationReport> {
  console.log(chalk.bold('\n🔍 Validating SST Deployment Configuration\n'));

  const issues: SSTValidationIssue[] = [];

  // Phase 1: Parse intended architecture
  const intentSpinner = ora('Reading sst.config.ts...').start();
  const intent = await parseIntendedArchitecture(projectRoot);
  intentSpinner.succeed('✅ SST configuration parsed');

  console.log(chalk.gray('\n  Architecture detected:'));
  console.log(chalk.gray(`    Function URLs: ${intent.usesFunctionURLs ? 'yes' : 'no'}`));
  console.log(chalk.gray(`    CloudFront Function: ${intent.usesCloudFrontFunction ? 'yes' : 'no'}`));
  console.log(chalk.gray(`    KeyValueStore: ${intent.usesKeyValueStore ? 'yes' : 'no'}\n`));

  // Phase 2: Get current deployment state
  const stateSpinner = ora('Querying AWS deployment state...').start();
  const state = await getDeploymentState(config, stage);
  stateSpinner.succeed('✅ Deployment state retrieved');

  // Phase 3: Run conditional validation checks
  const checks = [
    { name: 'Lambda Function URL', fn: () => validateFunctionURL(intent, state, ora().start()) },
    { name: 'CloudFront Origin', fn: () => validateCloudFrontOrigin(intent, state, ora().start()) },
    { name: 'Origin Protocol Policy', fn: () => validateProtocolPolicy(intent, state, ora().start()) },
    { name: 'KeyValueStore', fn: () => validateKeyValueStore(intent, state, ora().start()) },
    { name: 'SSL Certificate', fn: () => validateSSLCertificate(config, stage, state, ora().start()) },
  ];

  console.log('');
  for (const { name, fn } of checks) {
    const spinner = ora(`Checking ${name}...`).start();
    try {
      const issue = await fn();
      if (issue) {
        issues.push(issue);
        const icon = issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        spinner.fail(`${icon} ${name} - ${issue.description}`);
      } else {
        spinner.stop(); // Function handles its own success message
      }
    } catch (error) {
      spinner.warn(`⚠️  ${name} check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate report
  const issuesDetected = issues.length > 0;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;

  let summary = '';
  if (issuesDetected) {
    summary = `Found ${issues.length} potential issue(s): ${warnings} warnings, ${infos} info`;
  } else {
    summary = 'Deployment matches configuration - all checks passed';
  }

  // Print summary
  console.log(chalk.bold('\n' + '─'.repeat(60)));
  console.log(chalk.bold('📋 SST Validation Summary'));
  console.log(chalk.bold('─'.repeat(60)) + '\n');

  if (issuesDetected) {
    console.log(chalk.yellow(`⚠️  ${summary}\n`));

    for (const issue of issues) {
      const icon = issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      const color = issue.severity === 'warning' ? chalk.yellow : chalk.cyan;

      console.log(`${icon} ${color.bold(issue.description)}`);
      console.log(chalk.gray(`   Details: ${issue.details}`));
      console.log(chalk.gray(`   Guidance: ${issue.guidance}`));

      if (issue.autoFixAvailable) {
        console.log(chalk.green(`   ✅ Auto-fix available`));
      } else {
        console.log(chalk.gray(`   🔧 Manual fix required`));
      }
      console.log('');
    }
  } else {
    console.log(chalk.green(`✅ ${summary}\n`));
  }

  console.log(chalk.bold('─'.repeat(60)) + '\n');

  return {
    issuesDetected,
    issues,
    summary,
  };
}

/**
 * Check if running in CI/CD environment (non-interactive)
 */
function isCI(): boolean {
  return !process.stdin.isTTY || process.env.CI === 'true';
}

/**
 * Prompt user for confirmation (with TTY detection)
 */
async function promptUser(question: string): Promise<boolean> {
  if (isCI()) {
    console.log(chalk.yellow(`\nSkipping prompt in CI/CD: ${question}`));
    return false;
  }

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan(`\n${question} (y/n): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
    });
  });
}

/**
 * Auto-fix detected deployment issues
 *
 * Attempts to automatically fix configuration mismatches:
 * - Creates missing Lambda Function URLs
 * - Updates CloudFront origins
 * - Fixes protocol policies
 *
 * @returns Array of issues that were successfully fixed
 */
export async function fixDeploymentIssues(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string,
  issues: SSTValidationIssue[]
): Promise<SSTValidationIssue[]> {
  console.log(chalk.bold('\n🔧 Fixing Deployment Issues\n'));

  const fixed: SSTValidationIssue[] = [];
  const state = await getDeploymentState(config, stage);

  const env = {
    ...process.env,
    ...(config.awsProfile && { AWS_PROFILE: config.awsProfile }),
  };

  const timeout = 60000; // 60s timeout for AWS commands

  for (const issue of issues) {
    if (!issue.autoFixAvailable) {
      console.log(chalk.yellow(`⊘  Skipping ${issue.type} - manual fix required\n`));
      continue;
    }

    const spinner = ora(`Fixing ${issue.description}...`).start();

    try {
      switch (issue.type) {
        case 'config-mismatch':
          // Create Lambda Function URL
          if (issue.description.includes('Lambda Function URL') && state.functionName) {
            await execAsync(
              `aws lambda create-function-url-config --function-name ${state.functionName} --auth-type NONE --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"],"MaxAge":86400}'`,
              { env, timeout }
            );
            spinner.succeed(`✅ Created Lambda Function URL for ${state.functionName}`);
            fixed.push(issue);
          }
          // Fix protocol policy
          else if (issue.description.includes('protocol policy') && state.distributionId) {
            // Get current config
            const { stdout: configJson } = await execAsync(
              `aws cloudfront get-distribution-config --id ${state.distributionId}`,
              { env, timeout }
            );

            const config = JSON.parse(configJson);
            const etag = config.ETag;

            // Update protocol policy using native JSON manipulation (no jq dependency)
            config.DistributionConfig.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy = 'https-only';

            // Write to temp file (will be cleaned up)
            const tempFile = `/tmp/cf-config-${Date.now()}.json`;
            await import('fs/promises').then(fs =>
              fs.writeFile(tempFile, JSON.stringify(config.DistributionConfig, null, 2))
            );

            // Apply update
            await execAsync(
              `aws cloudfront update-distribution --id ${state.distributionId} --distribution-config file://${tempFile} --if-match ${etag}`,
              { env, timeout }
            );

            // Cleanup temp file
            await import('fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));

            spinner.succeed(`✅ Fixed protocol policy to https-only`);
            fixed.push(issue);
          }
          break;

        case 'incomplete-deployment':
        case 'configuration-drift':
          // Update CloudFront origin
          if (state.distributionId && state.functionUrl) {
            const functionDomain = state.functionUrl.replace('https://', '').replace(/\/$/, '');

            // Get current config
            const { stdout: configJson } = await execAsync(
              `aws cloudfront get-distribution-config --id ${state.distributionId}`,
              { env, timeout }
            );

            const config = JSON.parse(configJson);
            const etag = config.ETag;

            // Update origin using native JSON manipulation (no jq dependency)
            config.DistributionConfig.Origins.Items[0].DomainName = functionDomain;

            // Write to temp file (will be cleaned up)
            const tempFile = `/tmp/cf-origin-${Date.now()}.json`;
            await import('fs/promises').then(fs =>
              fs.writeFile(tempFile, JSON.stringify(config.DistributionConfig, null, 2))
            );

            // Apply update
            await execAsync(
              `aws cloudfront update-distribution --id ${state.distributionId} --distribution-config file://${tempFile} --if-match ${etag}`,
              { env, timeout }
            );

            // Cleanup temp file
            await import('fs/promises').then(fs => fs.unlink(tempFile).catch(() => {}));

            spinner.succeed(`✅ Updated CloudFront origin to ${functionDomain}`);
            fixed.push(issue);
          } else {
            spinner.fail('❌ Cannot fix - missing distribution ID or function URL');
          }
          break;

        default:
          spinner.warn(`⚠️  Unknown issue type: ${issue.type}`);
      }
    } catch (error) {
      spinner.fail(`❌ Failed to fix ${issue.type}: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('');
  }

  // If any CloudFront updates were made, invalidate cache
  if (fixed.some(i => i.type === 'incomplete-deployment' || i.type === 'configuration-drift')) {
    const spinner = ora('Invalidating CloudFront cache...').start();
    try {
      if (state.distributionId) {
        await execAsync(
          `aws cloudfront create-invalidation --distribution-id ${state.distributionId} --paths "/*"`,
          { env, timeout }
        );
        spinner.succeed('✅ CloudFront cache invalidation started (will complete in 5-15 min)');
      }
    } catch (error) {
      spinner.warn('⚠️  Cache invalidation failed - changes may take 5-15 min to propagate');
    }
  }

  return fixed;
}
