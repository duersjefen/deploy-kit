import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
const execAsync = promisify(exec);
/**
 * Comprehensive deployment status checking
 * - Check locks across all stages
 * - Display CloudFront status
 * - Show deployment timing
 * - Detect conflicts and issues
 */
export function getStatusChecker(config, projectRoot) {
    /**
     * Check all stages at once
     */
    async function checkAllStages() {
        console.log(chalk.bold.cyan('\n📊 DEPLOYMENT STATUS REPORT\n'));
        const stages = ['dev', 'staging', 'production'];
        for (const stage of stages) {
            if (!config.stages.includes(stage))
                continue;
            await checkStage(stage);
            console.log('');
        }
        // Check for global issues
        await checkGlobalIssues();
    }
    /**
     * Check a single stage
     */
    async function checkStage(stage) {
        console.log(chalk.bold(`Stage: ${stage}`));
        // Check lock status
        const lockStatus = await checkLockStatus(stage);
        console.log(`  Lock Status: ${lockStatus}`);
        // Check CloudFront status
        const cfStatus = await checkCloudFrontStatus(stage);
        console.log(`  CloudFront: ${cfStatus}`);
        // Check database status
        if (config.database === 'dynamodb') {
            const dbStatus = await checkDatabaseStatus(stage);
            console.log(`  Database: ${dbStatus}`);
        }
        // Check domain accessibility
        const domainStatus = await checkDomainAccessibility(stage);
        console.log(`  Domain: ${domainStatus}`);
    }
    /**
     * Check if stage is locked
     */
    async function checkLockStatus(stage) {
        try {
            // Check for lock files
            const lockFile = `${projectRoot}/.deployment-lock-${stage}`;
            // Check Pulumi lock
            const { stdout } = await execAsync(`npx sst status --stage ${stage} 2>/dev/null || echo "unlocked"`, { cwd: projectRoot });
            if (stdout.includes('locked') || stdout.includes('Lock')) {
                return chalk.yellow('🔒 LOCKED (Pulumi state)');
            }
            else {
                return chalk.green('✅ Unlocked');
            }
        }
        catch {
            return chalk.green('✅ Unlocked');
        }
    }
    /**
     * Check CloudFront distribution status
     */
    async function checkCloudFrontStatus(stage) {
        try {
            const domain = config.stageConfig[stage].domain ||
                `${stage}.${config.mainDomain}`;
            if (!domain) {
                return chalk.gray('ℹ️  Not configured');
            }
            const env = {
                ...process.env,
                ...(config.awsProfile && {
                    AWS_PROFILE: config.awsProfile,
                }),
            };
            const { stdout: distOutput } = await execAsync(`aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='${domain}'].{Id:Id,Status:Status,DomainName:DomainName}" --output json`, { env }).catch(() => ({ stdout: '[]' }));
            const distributions = JSON.parse(distOutput || '[]');
            if (distributions.length === 0) {
                return chalk.yellow('ℹ️  Distribution not yet created');
            }
            const dist = distributions[0];
            const statusEmoji = dist.Status === 'Deployed' ? '✅' : '⏳';
            return `${statusEmoji} ${dist.Status}`;
        }
        catch {
            return chalk.gray('ℹ️  Could not check');
        }
    }
    /**
     * Check database status
     */
    async function checkDatabaseStatus(stage) {
        try {
            const tableName = config.stageConfig[stage].dynamoTableName;
            if (!tableName) {
                return chalk.gray('ℹ️  Not configured');
            }
            const env = {
                ...process.env,
                ...(config.awsProfile && {
                    AWS_PROFILE: config.awsProfile,
                }),
            };
            const { stdout } = await execAsync(`aws dynamodb describe-table --table-name ${tableName} --query 'Table.TableStatus' --output text`, { env }).catch(() => ({ stdout: 'UNKNOWN' }));
            const status = stdout.trim();
            const statusEmoji = status === 'ACTIVE' ? '✅' : '⏳';
            return `${statusEmoji} ${status}`;
        }
        catch {
            return chalk.red('❌ Error checking');
        }
    }
    /**
     * Check domain accessibility
     */
    async function checkDomainAccessibility(stage) {
        try {
            const domain = config.stageConfig[stage].domain ||
                `${stage}.${config.mainDomain}`;
            if (!domain) {
                return chalk.gray('ℹ️  Not configured');
            }
            const protocol = stage === 'dev' ? 'http' : 'https';
            const url = `${protocol}://${domain}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(url, {
                signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeoutId);
            if (response && response.status < 500) {
                return chalk.green(`✅ Accessible (${response.status})`);
            }
            else if (response) {
                return chalk.yellow(`⚠️  Server error (${response.status})`);
            }
            else {
                return chalk.yellow('⏳ Not responding (may be propagating)');
            }
        }
        catch {
            return chalk.yellow('⏳ Could not reach');
        }
    }
    /**
     * Check for global issues
     */
    async function checkGlobalIssues() {
        console.log(chalk.bold('Global Issues:\n'));
        // Check AWS credentials
        try {
            const env = {
                ...process.env,
                ...(config.awsProfile && {
                    AWS_PROFILE: config.awsProfile,
                }),
            };
            await execAsync('aws sts get-caller-identity', { env });
            console.log(`✅ AWS credentials configured${config.awsProfile ? ` (${config.awsProfile})` : ''}`);
        }
        catch {
            console.log(chalk.red('❌ AWS credentials not configured'));
        }
        // Check npm packages
        try {
            const { stdout } = await execAsync('npm ls @duersjefen/deploy-kit --depth=0', {
                cwd: projectRoot,
            });
            if (stdout.includes('deploy-kit')) {
                console.log('✅ deploy-kit package available');
            }
        }
        catch {
            console.log(chalk.yellow('⚠️  deploy-kit package issue'));
        }
    }
    return {
        checkAllStages,
        checkStage,
        checkLockStatus,
        checkCloudFrontStatus,
        checkDatabaseStatus,
        checkDomainAccessibility,
    };
}
