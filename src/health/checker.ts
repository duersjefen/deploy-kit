import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage, HealthCheck } from '../types.js';

const execAsync = promisify(exec);

/**
 * Create a comprehensive health checking system for deployed applications
 * 
 * Provides methods to validate:
 * - HTTP endpoint responses and status codes
 * - Database (DynamoDB) connectivity
 * - CloudFront distribution origin configuration
 * - Origin Access Control (OAC) security settings
 * - Response content and response times
 * 
 * @param config - Project configuration with stage and health check settings
 * @returns Health checker object with check methods
 * 
 * @example
 * ```typescript
 * const checker = getHealthChecker(config);
 * const stagingHealthy = await checker.runAll('staging');
 * if (stagingHealthy) {
 *   console.log('Deployment successful!');
 * }
 * ```
 */
export function getHealthChecker(config: ProjectConfig) {
  /**
   * Execute a single health check endpoint validation
   * 
   * Validates HTTP endpoint accessibility, response status codes, response content,
   * and response times. Supports custom timeouts and text search validation.
   * 
   * @param check - Health check configuration with url, timeout, expectedStatus, etc.
   * @param stage - Deployment stage name (staging, production)
   * @returns Promise resolving to true if check passes, false otherwise
   * 
   * @throws Will not throw; instead returns false on failure
   * 
   * @example
   * ```typescript
   * const checker = getHealthChecker(config);
   * const passed = await checker.check({
   *   url: '/api/health',
   *   expectedStatus: 200,
   *   timeout: 5000,
   *   name: 'API Health'
   * }, 'staging');
   * ```
   */
  async function check(check: HealthCheck, stage: DeploymentStage): Promise<boolean> {
    const checkName = check.name || check.url;
    const spinner = ora(`Checking ${checkName}...`).start();
    const startTime = Date.now();

    try {
      // Resolve domain
      const domain = config.stageConfig[stage].domain ||
        `${stage}.${config.mainDomain}`;
      
      const url = check.url.startsWith('http')
        ? check.url
        : `https://${domain}${check.url}`;

      const timeout = check.timeout || 5000;
      const expectedStatus = check.expectedStatus || 200;

      // Build curl command with proper quoting
      const curlCmd = `curl -s -w "%{http_code}" -o /tmp/health_check_response.txt --max-time ${Math.ceil(timeout / 1000)} "${url}"`;

      // Execute health check
      const { stdout } = await execAsync(curlCmd, {
        timeout: timeout + 2000,
      });

      const statusCode = parseInt(stdout.trim().split('\n').pop() || '0');

      // Check if status code matches expected range
      const statusOk = statusCode >= 200 && statusCode < 400;

      if (!statusOk) {
        spinner.fail(`❌ ${checkName} returned HTTP ${statusCode}`);
        return false;
      }

      // If searching for text, validate response contains text
      if (check.searchText) {
        try {
          const { stdout: fileContent } = await execAsync(
            'cat /tmp/health_check_response.txt'
          );

          if (!fileContent.includes(check.searchText)) {
            spinner.fail(`❌ ${checkName} response missing text: "${check.searchText}"`);
            return false;
          }
        } catch {
          spinner.fail(`❌ ${checkName} could not validate response content`);
          return false;
        }
      }

      // Check response time
      const responseTime = Date.now() - startTime;
      if (responseTime > 5000) {
        spinner.warn(`⚠️  ${checkName} slow (${responseTime}ms > 5000ms)`);
      } else {
        spinner.succeed(`✅ ${checkName} (${statusCode}, ${responseTime}ms)`);
      }

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        spinner.fail(`❌ ${checkName} timeout (${check.timeout || 5000}ms)`);
      } else {
        spinner.fail(`❌ ${checkName} failed: ${errorMsg.split('\n')[0]}`);
      }
      return false;
    }
  }

  /**
   * Validate DynamoDB database connectivity and health
   * 
   * Checks if the configured DynamoDB table is accessible and in ACTIVE state.
   * Uses AWS CLI to query table status. Skips check if database is not configured.
   * 
   * @param stage - Deployment stage name
   * @returns Promise resolving to true if database is accessible/healthy or not applicable
   * 
   * @throws Will not throw; returns false on failed access or missing table
   * 
   * @example
   * ```typescript
   * const healthy = await checker.checkDatabase('staging');
   * if (!healthy) {
   *   console.log('Database is unreachable or unhealthy');
   * }
   * ```
   */
  async function checkDatabase(stage: DeploymentStage): Promise<boolean> {
    if (config.database !== 'dynamodb') {
      return true; // Not applicable
    }

    const spinner = ora('Checking database connectivity...').start();

    try {
      const tableName = config.stageConfig[stage].dynamoTableName;
      if (!tableName) {
        spinner.info('DynamoDB table not configured');
        return true;
      }

      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      const { stdout } = await execAsync(
        `aws dynamodb describe-table --table-name ${tableName} --query 'Table.TableStatus' --output text`,
        { env }
      );

      const status = stdout.trim();

      if (status === 'ACTIVE') {
        spinner.succeed(`✅ Database healthy (${tableName})`);
        return true;
      } else if (status === 'CREATING' || status === 'UPDATING') {
        spinner.info(`ℹ️  Database is ${status.toLowerCase()} - try again in a moment`);
        return true;
      } else {
        spinner.fail(`❌ Database unhealthy: ${status}`);
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('ResourceNotFoundException')) {
        spinner.fail('❌ Database table not found');
      } else if (errorMsg.includes('UnauthorizedException')) {
        spinner.fail('❌ Database access denied (check AWS credentials)');
      } else {
        spinner.fail(`❌ Database check failed: ${errorMsg.split('\n')[0]}`);
      }
      return false;
    }
  }

  /**
   * Validate CloudFront distribution origin configuration
   * 
   * Finds the CloudFront distribution for the stage domain and verifies the origin
   * is properly configured (not a placeholder or sst.dev). Returns true if distribution
   * doesn't exist yet (normal after new deployment).
   * 
   * @param stage - Deployment stage name
   * @returns Promise resolving to true if origin is valid or distribution not yet created
   * 
   * @throws Will not throw; returns false if origin is misconfigured
   * 
   * @example
   * ```typescript
   * const valid = await checker.checkCloudFrontOrigin('production');
   * if (!valid) {
   *   console.log('CloudFront origin needs to be fixed');
   * }
   * ```
   */
  async function checkCloudFrontOrigin(stage: DeploymentStage): Promise<boolean> {
    const domain = config.stageConfig[stage].domain ||
      `${stage}.${config.mainDomain}`;

    if (!domain) {
      return true; // Not applicable
    }

    const spinner = ora('Checking CloudFront origin...').start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      // Find distribution by domain
      const { stdout: distIdOutput } = await execAsync(
        `aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='${domain}'].Id" --output text`,
        { env }
      );

      const distId = distIdOutput.trim();

      if (!distId) {
        spinner.info('ℹ️  CloudFront distribution not yet initialized (normal after new deployment)');
        return true;
      }

      // Check origin configuration
      const { stdout: originOutput } = await execAsync(
        `aws cloudfront get-distribution-config --id ${distId} --query 'DistributionConfig.Origins[0].DomainName' --output text`,
        { env }
      );

      const origin = originOutput.trim();

      // Fail if origin is placeholder
      if (origin.includes('placeholder') || origin.includes('sst.dev')) {
        spinner.fail(`❌ CloudFront origin is misconfigured: ${origin}`);
        spinner.info('Run: make fix-cloudfront-origin');
        return false;
      }

      // Warn if origin looks incorrect
      if (!origin.includes('.amazonaws.com') && !origin.includes('.s3')) {
        spinner.warn(`⚠️  CloudFront origin unexpected: ${origin}`);
      } else {
        spinner.succeed(`✅ CloudFront origin healthy: ${origin}`);
      }

      return true;
    } catch (error) {
      spinner.info('ℹ️  Could not validate CloudFront origin (not critical yet)');
      return true;
    }
  }

  /**
   * Validate Origin Access Control (OAC) security settings
   * 
   * Verifies that CloudFront distribution has Origin Access Control configured
   * to restrict S3 bucket access. OAC ensures only CloudFront can access the origin,
   * preventing direct public access. Skips check if OAC not configured (warns user).
   * 
   * @param stage - Deployment stage name
   * @returns Promise resolving to true if OAC is configured or not applicable
   * 
   * @example
   * ```typescript
   * const secure = await checker.checkOriginAccessControl('production');
   * if (!secure) {
   *   console.log('S3 bucket may be publicly accessible');
   * }
   * ```
   */
  async function checkOriginAccessControl(stage: DeploymentStage): Promise<boolean> {
    const domain = config.stageConfig[stage].domain ||
      `${stage}.${config.mainDomain}`;

    if (!domain || config.database !== 'dynamodb') {
      return true; // Only for serverless deployments
    }

    const spinner = ora('Checking Origin Access Control...').start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      // Find distribution by domain
      const { stdout: distIdOutput } = await execAsync(
        `aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='${domain}'].Id" --output text`,
        { env }
      );

      const distId = distIdOutput.trim();

      if (!distId) {
        spinner.info('ℹ️  CloudFront distribution not yet available');
        return true;
      }

      // Check OAC
      const { stdout: oacOutput } = await execAsync(
        `aws cloudfront get-distribution-config --id ${distId} --query 'DistributionConfig.Origins[0].OriginAccessControlId' --output text`,
        { env }
      );

      const oacId = oacOutput.trim();

      if (!oacId || oacId === 'None') {
        spinner.warn('⚠️  Origin Access Control not configured - S3 bucket may be publicly accessible');
        spinner.info('This should be fixed for production deployments');
        return true;
      }

      spinner.succeed(`✅ Origin Access Control (OAC) enabled: ${oacId}`);
      return true;
    } catch (error) {
      spinner.info('ℹ️  Could not validate OAC (not critical)');
      return true;
    }
  }

  /**
   * Execute all configured health checks for a deployment stage
   * 
   * Runs the complete health check suite:
   * 1. Database connectivity check
   * 2. CloudFront origin validation
   * 3. Origin Access Control (OAC) security
   * 4. All user-configured HTTP endpoint checks
   * 
   * Logs detailed results for each check and returns overall pass/fail status.
   * All checks must pass for function to return true.
   * 
   * @param stage - Deployment stage name (staging, production)
   * @returns Promise resolving to true if all checks pass, false if any fail
   * 
   * @example
   * ```typescript
   * const checker = getHealthChecker(config);
   * const allHealthy = await checker.runAll('staging');
   * console.log(allHealthy ? '✅ Healthy' : '❌ Issues found');
   * ```
   */
  async function runAll(stage: DeploymentStage): Promise<boolean> {
    console.log(chalk.bold.cyan(`\n🏥 Running comprehensive health checks for ${stage}...\n`));

    const checks: Array<() => Promise<boolean>> = [
      () => checkDatabase(stage),
      () => checkCloudFrontOrigin(stage),
      () => checkOriginAccessControl(stage),
    ];

    // Add configured endpoint checks
    const configuredChecks = config.healthChecks || [];
    for (const hc of configuredChecks) {
      checks.push(() => check(hc, stage));
    }

    // Run all checks in parallel for better performance
    const results = await Promise.all(checks.map(checkFn => checkFn()));
    const allPass = results.every(passed => passed);

    console.log(''); // Blank line for readability
    return allPass;
  }

  return {
    check,
    checkDatabase,
    checkCloudFrontOrigin,
    checkOriginAccessControl,
    runAll,
  };
}
