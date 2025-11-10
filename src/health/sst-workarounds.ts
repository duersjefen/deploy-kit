import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';

const execAsync = promisify(exec);

/**
 * SST 3.17 Bug Detection Results
 */
export interface SSTBugReport {
  bugDetected: boolean;
  bugs: SSTBug[];
  summary: string;
}

export interface SSTBug {
  type: 'lambda-function-url' | 'cloudfront-origin' | 'protocol-policy' | 'keyvalue-store';
  severity: 'critical' | 'high' | 'medium';
  description: string;
  details: string;
  autoFixAvailable: boolean;
}

/**
 * SST Deployment Metadata
 */
interface SSTDeploymentInfo {
  distributionId?: string;
  functionName?: string;
  functionUrl?: string;
  origin?: string;
  protocolPolicy?: string;
  kvsArn?: string;
  kvsItemCount?: number | null;
}

/**
 * Get SST deployment information from sst deploy output
 *
 * Queries AWS to get the current state of SST-deployed infrastructure.
 * Handles missing resources gracefully (returns undefined for missing components).
 */
async function getSSTDeploymentInfo(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<SSTDeploymentInfo> {
  const info: SSTDeploymentInfo = {};

  const env = {
    ...process.env,
    ...(config.awsProfile && { AWS_PROFILE: config.awsProfile }),
  };

  try {
    // 1. Get CloudFront distribution ID from domain
    const domain = config.stageConfig[stage].domain || `${stage}.${config.mainDomain}`;

    if (domain) {
      const { stdout: distOutput } = await execAsync(
        `aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, '${domain}')]].Id | [0]" --output text`,
        { env }
      );

      info.distributionId = distOutput.trim() || undefined;

      // 2. If distribution found, get origin and protocol policy
      if (info.distributionId && info.distributionId !== 'None') {
        const { stdout: originOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${info.distributionId} --query 'DistributionConfig.Origins.Items[0].DomainName' --output text`,
          { env }
        );
        info.origin = originOutput.trim();

        const { stdout: protocolOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${info.distributionId} --query 'DistributionConfig.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy' --output text`,
          { env }
        );
        info.protocolPolicy = protocolOutput.trim();
      }
    }

    // 3. Find Lambda function (SST naming pattern: <app>-<stage>-*Function*)
    const appName = config.projectName || 'app';
    const { stdout: functionOutput } = await execAsync(
      `aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${appName}-${stage}-')].FunctionName | [0]" --output text`,
      { env }
    );

    info.functionName = functionOutput.trim() || undefined;

    // 4. If function found, check for Function URL
    if (info.functionName && info.functionName !== 'None') {
      try {
        const { stdout: urlOutput } = await execAsync(
          `aws lambda get-function-url-config --function-name ${info.functionName} --query 'FunctionUrl' --output text`,
          { env }
        );
        info.functionUrl = urlOutput.trim();
      } catch {
        // Function URL not created - this is one of the bugs
        info.functionUrl = undefined;
      }
    }

    // 5. Check for CloudFront KeyValueStore (if CloudFront Function is used)
    if (info.distributionId) {
      try {
        // Get CloudFront Function associations
        const { stdout: cfFuncOutput } = await execAsync(
          `aws cloudfront get-distribution-config --id ${info.distributionId} --query 'DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items[?FunctionARN!=\`null\`].FunctionARN | [0]' --output text`,
          { env }
        );

        const cfFunctionArn = cfFuncOutput.trim();

        if (cfFunctionArn && cfFunctionArn !== 'None') {
          // Get KVS associations for this CloudFront Function
          const cfFunctionName = cfFunctionArn.split('/').pop();
          const { stdout: kvsOutput } = await execAsync(
            `aws cloudfront list-key-value-stores --query "KeyValueStoreList.Items[?Name=='${cfFunctionName}'].ARN | [0]" --output text`,
            { env }
          );

          info.kvsArn = kvsOutput.trim() || undefined;

          // Check if KVS has items
          if (info.kvsArn && info.kvsArn !== 'None') {
            const kvsId = info.kvsArn.split('/').pop();
            const { stdout: itemCountOutput } = await execAsync(
              `aws cloudfront describe-key-value-store --key-value-store-id ${kvsId} --query 'ItemCount' --output text`,
              { env }
            );

            const itemCount = itemCountOutput.trim();
            info.kvsItemCount = itemCount === 'None' || itemCount === 'null' ? null : parseInt(itemCount);
          }
        }
      } catch {
        // No CloudFront Function or KVS - not critical
      }
    }

  } catch (error) {
    // Errors are expected for resources that don't exist yet
    // Return partial info - detection logic will handle it
  }

  return info;
}

/**
 * Check for SST 3.17 Bug #1: Lambda Function URL not created
 *
 * SST 3.17 sometimes reports successful deployment but fails to create
 * Lambda Function URLs, causing complete site failure.
 */
async function checkLambdaFunctionURL(
  info: SSTDeploymentInfo,
  spinner: Ora
): Promise<SSTBug | null> {
  if (!info.functionName) {
    spinner.info('ℹ️  Lambda function not found (may not be using Lambda Function URLs)');
    return null;
  }

  if (!info.functionUrl) {
    return {
      type: 'lambda-function-url',
      severity: 'critical',
      description: 'Lambda Function URL not created',
      details: `Function ${info.functionName} exists but Function URL was not created. Site will return 403 errors.`,
      autoFixAvailable: true,
    };
  }

  spinner.succeed(`✅ Lambda Function URL exists: ${info.functionUrl}`);
  return null;
}

/**
 * Check for SST 3.17 Bug #2: CloudFront origin stuck on placeholder.sst.dev
 *
 * SST 3.17 sometimes fails to update CloudFront origin from placeholder to
 * actual Lambda Function URL, causing 403 errors.
 */
async function checkCloudFrontOriginConfiguration(
  info: SSTDeploymentInfo,
  spinner: Ora
): Promise<SSTBug | null> {
  if (!info.distributionId || !info.origin) {
    spinner.info('ℹ️  CloudFront distribution not fully initialized yet');
    return null;
  }

  // Check for placeholder origins
  if (info.origin.includes('placeholder') || info.origin.includes('sst.dev')) {
    return {
      type: 'cloudfront-origin',
      severity: 'critical',
      description: 'CloudFront origin is placeholder',
      details: `Origin is set to ${info.origin} instead of actual Lambda Function URL. All requests will fail.`,
      autoFixAvailable: true,
    };
  }

  // Verify origin points to Lambda (if using Lambda Function URLs)
  if (info.functionUrl && !info.origin.includes(info.functionUrl.replace('https://', ''))) {
    return {
      type: 'cloudfront-origin',
      severity: 'high',
      description: 'CloudFront origin mismatch',
      details: `Origin is ${info.origin} but Function URL is ${info.functionUrl}. These should match.`,
      autoFixAvailable: true,
    };
  }

  spinner.succeed(`✅ CloudFront origin correctly configured: ${info.origin}`);
  return null;
}

/**
 * Check for SST 3.17 Bug #3: Origin protocol policy is http-only
 *
 * SST 3.17 sometimes sets origin protocol policy to http-only,
 * but Lambda Function URLs only accept HTTPS, causing 403 errors.
 */
async function checkOriginProtocolPolicy(
  info: SSTDeploymentInfo,
  spinner: Ora
): Promise<SSTBug | null> {
  if (!info.distributionId || !info.protocolPolicy) {
    spinner.info('ℹ️  CloudFront protocol policy not available yet');
    return null;
  }

  // Lambda Function URLs require HTTPS
  if (info.functionUrl && info.protocolPolicy !== 'https-only') {
    return {
      type: 'protocol-policy',
      severity: 'critical',
      description: 'Origin protocol policy is not https-only',
      details: `Protocol policy is ${info.protocolPolicy} but Lambda Function URLs require https-only. CloudFront will get 403 errors.`,
      autoFixAvailable: true,
    };
  }

  spinner.succeed(`✅ Origin protocol policy correct: ${info.protocolPolicy}`);
  return null;
}

/**
 * Check for SST 3.17 Bug #4: KeyValueStore empty/not populated
 *
 * SST 3.17 sometimes creates KeyValueStore but fails to populate it,
 * causing CloudFront Function crashes.
 */
async function checkKeyValueStorePopulation(
  info: SSTDeploymentInfo,
  spinner: Ora
): Promise<SSTBug | null> {
  // If no KVS configured, not a problem
  if (!info.kvsArn) {
    spinner.info('ℹ️  KeyValueStore not in use (CloudFront Function may not be configured)');
    return null;
  }

  // If KVS exists but is empty
  if (info.kvsItemCount === null || info.kvsItemCount === 0) {
    return {
      type: 'keyvalue-store',
      severity: 'high',
      description: 'KeyValueStore is empty',
      details: `KVS exists (${info.kvsArn}) but has no items. CloudFront Function will crash on every request.`,
      autoFixAvailable: false, // Complex to fix - recommend removing CF Function
    };
  }

  spinner.succeed(`✅ KeyValueStore populated: ${info.kvsItemCount} items`);
  return null;
}

/**
 * Verify SST deployment for known SST 3.17 bugs
 *
 * Runs comprehensive checks for all known SST 3.17 bugs:
 * 1. Lambda Function URLs not created
 * 2. CloudFront origins stuck on placeholder.sst.dev
 * 3. Origin protocol policy http-only (should be https-only)
 * 4. KeyValueStore empty/not populated
 *
 * @returns Report of detected bugs with severity and auto-fix availability
 */
export async function verifySSTDeployment(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string
): Promise<SSTBugReport> {
  console.log(chalk.bold('\n🔍 Running SST 3.17 Bug Detection\n'));

  const bugs: SSTBug[] = [];

  // Get deployment info
  const infoSpinner = ora('Gathering SST deployment information...').start();
  const info = await getSSTDeploymentInfo(config, stage, projectRoot);
  infoSpinner.succeed('✅ Deployment information collected');

  // Run all bug checks
  const checks = [
    { name: 'Lambda Function URL', fn: () => checkLambdaFunctionURL(info, ora().start()) },
    { name: 'CloudFront Origin', fn: () => checkCloudFrontOriginConfiguration(info, ora().start()) },
    { name: 'Origin Protocol Policy', fn: () => checkOriginProtocolPolicy(info, ora().start()) },
    { name: 'KeyValueStore Population', fn: () => checkKeyValueStorePopulation(info, ora().start()) },
  ];

  for (const { name, fn } of checks) {
    const spinner = ora(`Checking ${name}...`).start();
    try {
      const bug = await fn();
      if (bug) {
        bugs.push(bug);
        spinner.fail(`❌ ${name} - ${bug.description}`);
      } else {
        spinner.stop(); // Function handles its own success message
      }
    } catch (error) {
      spinner.warn(`⚠️  ${name} check inconclusive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate report
  const bugDetected = bugs.length > 0;
  const criticalBugs = bugs.filter(b => b.severity === 'critical').length;
  const highBugs = bugs.filter(b => b.severity === 'high').length;

  let summary = '';
  if (bugDetected) {
    summary = `Found ${bugs.length} SST bug(s): ${criticalBugs} critical, ${highBugs} high priority`;
  } else {
    summary = 'No SST 3.17 bugs detected - deployment looks healthy';
  }

  // Print summary
  console.log(chalk.bold('\n' + '─'.repeat(50)));
  console.log(chalk.bold('📋 SST Bug Detection Summary'));
  console.log(chalk.bold('─'.repeat(50)) + '\n');

  if (bugDetected) {
    console.log(chalk.red(`❌ ${summary}\n`));

    for (const bug of bugs) {
      const icon = bug.severity === 'critical' ? '🔴' : '🟡';
      const color = bug.severity === 'critical' ? chalk.red : chalk.yellow;

      console.log(`${icon} ${color.bold(bug.description)}`);
      console.log(chalk.gray(`   ${bug.details}`));

      if (bug.autoFixAvailable) {
        console.log(chalk.green(`   ✅ Auto-fix available`));
      } else {
        console.log(chalk.yellow(`   ⚠️  Manual fix required`));
      }
      console.log('');
    }
  } else {
    console.log(chalk.green(`✅ ${summary}\n`));
  }

  console.log(chalk.bold('─'.repeat(50)) + '\n');

  return {
    bugDetected,
    bugs,
    summary,
  };
}

/**
 * Auto-fix detected SST bugs
 *
 * Attempts to automatically fix detected SST 3.17 bugs:
 * - Creates missing Lambda Function URLs
 * - Updates CloudFront origins
 * - Fixes protocol policies
 * - Removes problematic CloudFront Functions (for KVS issues)
 *
 * @returns Array of bugs that were successfully fixed
 */
export async function autoFixSSTBugs(
  config: ProjectConfig,
  stage: DeploymentStage,
  projectRoot: string,
  bugs: SSTBug[]
): Promise<SSTBug[]> {
  console.log(chalk.bold('\n🔧 Auto-Fixing SST Bugs\n'));

  const fixed: SSTBug[] = [];
  const info = await getSSTDeploymentInfo(config, stage, projectRoot);

  const env = {
    ...process.env,
    ...(config.awsProfile && { AWS_PROFILE: config.awsProfile }),
  };

  for (const bug of bugs) {
    if (!bug.autoFixAvailable) {
      console.log(chalk.yellow(`⊘  Skipping ${bug.type} - manual fix required\n`));
      continue;
    }

    const spinner = ora(`Fixing ${bug.description}...`).start();

    try {
      switch (bug.type) {
        case 'lambda-function-url':
          // Create Lambda Function URL
          if (info.functionName) {
            await execAsync(
              `aws lambda create-function-url-config --function-name ${info.functionName} --auth-type NONE --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"],"MaxAge":86400}'`,
              { env }
            );
            spinner.succeed(`✅ Created Lambda Function URL for ${info.functionName}`);
            fixed.push(bug);
          } else {
            spinner.fail('❌ Cannot fix - function name unknown');
          }
          break;

        case 'cloudfront-origin':
          // Update CloudFront origin
          if (info.distributionId && info.functionUrl) {
            const functionDomain = info.functionUrl.replace('https://', '').replace(/\/$/, '');

            // Get current config
            const configFile = `/tmp/cf-config-${Date.now()}.json`;
            await execAsync(
              `aws cloudfront get-distribution-config --id ${info.distributionId} > ${configFile}`,
              { env }
            );

            // Update origin domain using jq
            await execAsync(
              `jq '.DistributionConfig.Origins.Items[0].DomainName = "${functionDomain}"' ${configFile} > ${configFile}.updated`,
              { env }
            );

            // Get ETag for update
            const { stdout: etagOutput } = await execAsync(`jq -r '.ETag' ${configFile}`);
            const etag = etagOutput.trim();

            // Apply update
            await execAsync(
              `aws cloudfront update-distribution --id ${info.distributionId} --distribution-config file://${configFile}.updated --if-match ${etag}`,
              { env }
            );

            spinner.succeed(`✅ Updated CloudFront origin to ${functionDomain}`);
            fixed.push(bug);
          } else {
            spinner.fail('❌ Cannot fix - missing distribution ID or function URL');
          }
          break;

        case 'protocol-policy':
          // Fix protocol policy
          if (info.distributionId) {
            const configFile = `/tmp/cf-config-protocol-${Date.now()}.json`;
            await execAsync(
              `aws cloudfront get-distribution-config --id ${info.distributionId} > ${configFile}`,
              { env }
            );

            // Update protocol policy using jq
            await execAsync(
              `jq '.DistributionConfig.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy = "https-only"' ${configFile} > ${configFile}.updated`,
              { env }
            );

            // Get ETag
            const { stdout: etagOutput } = await execAsync(`jq -r '.ETag' ${configFile}`);
            const etag = etagOutput.trim();

            // Apply update
            await execAsync(
              `aws cloudfront update-distribution --id ${info.distributionId} --distribution-config file://${configFile}.updated --if-match ${etag}`,
              { env }
            );

            spinner.succeed(`✅ Fixed protocol policy to https-only`);
            fixed.push(bug);
          } else {
            spinner.fail('❌ Cannot fix - distribution ID unknown');
          }
          break;

        default:
          spinner.warn(`⚠️  Unknown bug type: ${bug.type}`);
      }
    } catch (error) {
      spinner.fail(`❌ Failed to fix ${bug.type}: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('');
  }

  // If any CloudFront updates were made, invalidate cache
  if (fixed.some(b => b.type === 'cloudfront-origin' || b.type === 'protocol-policy')) {
    const spinner = ora('Invalidating CloudFront cache...').start();
    try {
      if (info.distributionId) {
        await execAsync(
          `aws cloudfront create-invalidation --distribution-id ${info.distributionId} --paths "/*"`,
          { env }
        );
        spinner.succeed('✅ CloudFront cache invalidation started (will complete in 5-15 min)');
      }
    } catch (error) {
      spinner.warn('⚠️  Cache invalidation failed - changes may take 5-15 min to propagate');
    }
  }

  return fixed;
}
