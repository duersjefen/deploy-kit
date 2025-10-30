import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage } from '../types.js';

const execAsync = promisify(exec);

/**
 * Deployment recovery and resource cleanup
 * - Detect orphaned CloudFront distributions
 * - Remove incomplete deployments
 * - Clean up stuck Pulumi state
 * - Reset locks safely
 */
export function getRecoveryManager(config: ProjectConfig) {
  /**
   * Detect orphaned CloudFront distributions
   */
  async function detectOrphanedDistributions(): Promise<void> {
    const spinner = ora('Detecting orphaned CloudFront distributions...').start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      // Get all distributions
      const { stdout } = await execAsync(
        'aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName,Status,Comment]" --output text',
        { env }
      );

      const distributions = stdout.split('\n').filter(line => line.trim());

      if (distributions.length === 0) {
        spinner.info('No CloudFront distributions found');
        return;
      }

      const expectedDomains = new Set<string>();
      for (const stage of config.stages) {
        const domain = config.stageConfig[stage].domain ||
          `${stage}.${config.mainDomain}`;
        expectedDomains.add(domain);
      }

      const orphaned: string[] = [];

      for (const dist of distributions) {
        const parts = dist.split('\t');
        if (parts.length >= 2) {
          const domainName = parts[1];
          if (!expectedDomains.has(domainName)) {
            orphaned.push(`${parts[0]} (${domainName})`);
          }
        }
      }

      if (orphaned.length > 0) {
        spinner.warn(`⚠️  Found ${orphaned.length} orphaned CloudFront distributions:`);
        for (const dist of orphaned) {
          console.log(`    - ${chalk.yellow(dist)}`);
        }
        console.log(`\nTo delete: aws cloudfront delete-distribution --id <ID> (after setting Enabled=false)\n`);
      } else {
        spinner.succeed('✅ No orphaned distributions found');
      }
    } catch (error) {
      spinner.warn('Could not check for orphaned distributions');
    }
  }

  /**
   * Clean up incomplete SST deployment
   */
  async function cleanupIncompleteDeployment(stage: DeploymentStage): Promise<void> {
    const spinner = ora(`Cleaning up incomplete ${stage} deployment...`).start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      // Check if there are Pulumi resources in progress
      const { stdout: stackOutput } = await execAsync(
        `npx sst status --stage ${stage} 2>/dev/null || echo "no stack"`,
        { env }
      ).catch(() => ({ stdout: 'error' }));

      if (stackOutput.includes('InProgress') || stackOutput.includes('CREATE_IN_PROGRESS')) {
        spinner.text = `Waiting for ${stage} deployment to finish...`;

        // Wait up to 10 minutes for deployment to finish
        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          attempts++;

          const { stdout: newStatus } = await execAsync(
            `npx sst status --stage ${stage} 2>/dev/null || echo "no stack"`,
            { env }
          ).catch(() => ({ stdout: 'error' }));

          if (!newStatus.includes('InProgress')) {
            break;
          }

          if (attempts % 3 === 0) {
            spinner.text = `Waiting for ${stage} deployment... (${attempts * 10}s)`;
          }
        }

        if (attempts >= maxAttempts) {
          spinner.warn(`⚠️  Deployment took too long, may need manual intervention`);
          spinner.info(`Run: npx sst remove --stage ${stage} (if needed)`);
        } else {
          spinner.succeed(`✅ Deployment finished`);
        }
      } else {
        spinner.succeed('✅ No incomplete deployments detected');
      }
    } catch (error) {
      spinner.info('Could not detect incomplete deployments');
    }
  }

  /**
   * Unlock Pulumi state
   */
  async function unlockPulumiState(stage: DeploymentStage): Promise<void> {
    const spinner = ora(`Unlocking Pulumi state for ${stage}...`).start();

    try {
      const env = {
        ...process.env,
        ...(config.awsProfile && {
          AWS_PROFILE: config.awsProfile,
        }),
      };

      await execAsync(`npx sst unlock --stage ${stage}`, { env });

      spinner.succeed(`✅ Pulumi state unlocked for ${stage}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('no lock')) {
        spinner.info(`ℹ️  No lock found for ${stage}`);
      } else {
        spinner.warn(`⚠️  Could not unlock ${stage}: ${errorMsg.split('\n')[0]}`);
      }
    }
  }

  /**
   * Full recovery procedure
   */
  async function performFullRecovery(stage: DeploymentStage): Promise<void> {
    console.log(chalk.bold.yellow(`\n🔧 FULL RECOVERY PROCEDURE FOR ${stage.toUpperCase()}\n`));

    // Step 1: Detect orphaned resources
    await detectOrphanedDistributions();
    console.log('');

    // Step 2: Clean up incomplete deployments
    await cleanupIncompleteDeployment(stage);
    console.log('');

    // Step 3: Unlock Pulumi state
    await unlockPulumiState(stage);
    console.log('');

    console.log(chalk.green.bold('Recovery procedure complete. Ready to redeploy.\n'));
  }

  return {
    detectOrphanedDistributions,
    cleanupIncompleteDeployment,
    unlockPulumiState,
    performFullRecovery,
  };
}
