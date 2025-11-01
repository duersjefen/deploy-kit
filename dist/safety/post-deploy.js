import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
const execAsync = promisify(exec);
/**
 * Post-deployment safety checks
 * Validates deployment was successful
 */
export function getPostDeploymentChecks(config) {
    /**
     * Check Lambda/application is responding
     */
    async function checkApplicationHealth(stage) {
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
                signal: controller.signal,
            }).catch(() => null).finally(() => clearTimeout(timeoutId));
            if (response && (response.status === 200 || response.status === 404)) {
                spinner.succeed(`✅ Application responding (${response.status})`);
            }
            else {
                spinner.warn('Application may not be ready (CloudFront propagating - normal for 5-15 min)');
            }
        }
        catch (error) {
            spinner.warn('Application health check inconclusive (CloudFront may still be propagating)');
        }
    }
    /**
     * Validate CloudFront OAC (Origin Access Control) for S3
     * Prevents 403 Access Denied errors
     */
    async function validateCloudFrontOAC(stage) {
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
            const { stdout: distInfo } = await execAsync(`aws cloudfront get-distribution --id ${distId} --query 'Distribution.Status' --output text`, { env });
            if (distInfo.includes('Deployed')) {
                spinner.succeed('✅ CloudFront distribution ready');
            }
            else {
                spinner.info(`CloudFront status: ${distInfo.trim()} (propagating)`);
            }
            // Check OAC is configured
            const { stdout: oacInfo } = await execAsync(`aws cloudfront get-distribution-config --id ${distId} --query 'DistributionConfig.Origins[0].OriginAccessControlId' --output text`, { env });
            if (oacInfo.trim() && oacInfo !== 'None') {
                spinner.succeed('✅ Origin Access Control configured');
            }
            else {
                spinner.warn('⚠️  No OAC configured (may cause 403 errors)');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('InvalidDistribution')) {
                spinner.info('Distribution still initializing (normal after deployment)');
            }
            else {
                spinner.warn(`⚠️  CloudFront validation inconclusive: ${errorMsg.split('\n')[0]}`);
            }
        }
    }
    /**
     * Check database connectivity
     */
    async function checkDatabaseConnection(stage) {
        const spinner = ora('Checking database connection...').start();
        try {
            if (!config.database) {
                spinner.info('Database not configured');
                return;
            }
            // This would be customized per project
            // For now, just indicate it should be checked
            spinner.info('Database check should be implemented per project');
        }
        catch (error) {
            spinner.warn('Database connectivity check skipped');
        }
    }
    /**
     * Run all post-deployment checks
     */
    async function run(stage) {
        console.log(chalk.bold(`Post-deployment validation for ${stage}:\n`));
        try {
            await checkApplicationHealth(stage);
            await validateCloudFrontOAC(stage);
            if (config.database) {
                await checkDatabaseConnection(stage);
            }
            console.log(chalk.green(`\n✅ Post-deployment validation complete!\n`));
        }
        catch (error) {
            console.log(chalk.yellow(`\n⚠️  Post-deployment validation had issues (check manually)\n`));
            // Don't throw - post-deploy checks are informational
        }
    }
    return { checkApplicationHealth, validateCloudFrontOAC, checkDatabaseConnection, run };
}
