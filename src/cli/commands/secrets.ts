/**
 * Interactive SST Secrets Setup
 *
 * Smart wizard that:
 * 1. Detects all secrets from sst.config.ts
 * 2. Lets user select which stages to configure
 * 3. Prompts ONCE per secret
 * 4. Applies to all selected stages
 */

import chalk from 'chalk';
import prompts from 'prompts';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { extractSecretNames, getExistingSecrets } from '../../safety/sst-secret-validator.js';
import type { DeploymentStage, ProjectConfig } from '../../types.js';

interface StageSecretStatus {
  stage: string;
  existingSecrets: string[];
  missingSecrets: string[];
}

/**
 * Load AWS profile from deploy-config.json if it exists
 */
function loadAwsProfile(projectRoot: string): string | undefined {
  const configPath = join(projectRoot, '.deploy-config.json');

  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as ProjectConfig;
    return config.awsProfile;
  } catch (error) {
    return undefined;
  }
}

/**
 * Interactive secrets setup wizard
 *
 * @param projectRoot - Project root directory
 */
export async function handleSecretsCommand(projectRoot: string = process.cwd()): Promise<void> {
  console.log(chalk.bold.cyan('\n🔐 SST Secrets Setup Wizard\n'));

  // 1. Extract all secrets from sst.config.ts
  const declaredSecrets = extractSecretNames(projectRoot);

  if (declaredSecrets.length === 0) {
    console.log(chalk.yellow('No SST secrets found in sst.config.ts'));
    console.log(chalk.dim('Secrets are declared with: new sst.Secret("SecretName")'));
    return;
  }

  console.log(chalk.bold('Secrets declared in sst.config.ts:'));
  declaredSecrets.forEach(name => {
    console.log(chalk.cyan(`  • ${name}`));
  });
  console.log();

  // 2. Check which secrets exist in each stage
  const stages = ['dev', 'staging', 'production'];
  const stageStatuses: StageSecretStatus[] = [];

  console.log(chalk.dim('Checking existing secrets across stages...\n'));

  for (const stage of stages) {
    const existingSecrets = getExistingSecrets(projectRoot, stage as DeploymentStage);
    const missingSecrets = declaredSecrets.filter(s => !existingSecrets.includes(s));

    stageStatuses.push({
      stage,
      existingSecrets,
      missingSecrets,
    });

    // Show status for each stage
    const statusIcon = missingSecrets.length === 0 ? chalk.green('✓') : chalk.yellow('⚠');
    const statusText = missingSecrets.length === 0
      ? chalk.green('All set')
      : chalk.yellow(`${missingSecrets.length} missing`);

    console.log(`${statusIcon} ${chalk.bold(stage.padEnd(12))} ${statusText}`);

    if (missingSecrets.length > 0) {
      console.log(chalk.dim(`   Missing: ${missingSecrets.join(', ')}`));
    }
  }
  console.log();

  // 3. Let user select stages to configure
  const stagesWithMissing = stageStatuses.filter(s => s.missingSecrets.length > 0);

  if (stagesWithMissing.length === 0) {
    console.log(chalk.green('✅ All secrets are configured for all stages!\n'));
    return;
  }

  const { selectedStages } = await prompts({
    type: 'multiselect',
    name: 'selectedStages',
    message: 'Which stages do you want to configure?',
    choices: stageStatuses.map(s => ({
      title: `${s.stage} (${s.missingSecrets.length} missing)`,
      value: s.stage,
      selected: s.missingSecrets.length > 0, // Pre-select stages with missing secrets
    })),
    min: 1,
  });

  if (!selectedStages || selectedStages.length === 0) {
    console.log(chalk.yellow('\nNo stages selected. Exiting.\n'));
    return;
  }

  console.log();
  console.log(chalk.bold(`Selected stages: ${selectedStages.join(', ')}`));
  console.log();

  // 4. Collect all unique missing secrets across selected stages
  const allMissingSecrets = new Set<string>();
  selectedStages.forEach((stage: string) => {
    const status = stageStatuses.find(s => s.stage === stage);
    if (status) {
      status.missingSecrets.forEach(s => allMissingSecrets.add(s));
    }
  });

  const secretsToSet = Array.from(allMissingSecrets);

  if (secretsToSet.length === 0) {
    console.log(chalk.green('✅ Selected stages already have all secrets!\n'));
    return;
  }

  // 5. Prompt for each secret value (ONCE)
  console.log(chalk.bold('Enter values for secrets'));
  console.log(chalk.dim(`(will be set for: ${selectedStages.join(', ')})`));
  console.log();

  const secretValues: Record<string, string> = {};

  for (const secretName of secretsToSet) {
    const { value } = await prompts({
      type: 'password',
      name: 'value',
      message: `${secretName}:`,
      validate: (val: string) => val.length > 0 || 'Secret value cannot be empty',
    });

    if (!value) {
      console.log(chalk.yellow('\nSetup cancelled.\n'));
      return;
    }

    secretValues[secretName] = value;
  }

  console.log();

  // 6. Apply secrets to all selected stages
  console.log(chalk.bold('Setting secrets...\n'));

  // Load AWS profile from config
  const awsProfile = loadAwsProfile(projectRoot);

  // Set up environment with AWS_PROFILE if specified
  const env = {
    ...process.env,
    ...(awsProfile && {
      AWS_PROFILE: awsProfile,
    }),
  };

  if (awsProfile) {
    console.log(chalk.gray(`Using AWS profile: ${awsProfile}\n`));
  }

  let successCount = 0;
  let failCount = 0;

  for (const stage of selectedStages) {
    const stageStatus = stageStatuses.find(s => s.stage === stage);
    if (!stageStatus) continue;

    // Only set secrets that are missing for this stage
    const secretsForStage = secretsToSet.filter(s => stageStatus.missingSecrets.includes(s));

    for (const secretName of secretsForStage) {
      const value = secretValues[secretName];

      try {
        // Set secret using SST CLI
        execSync(`npx sst secret set ${secretName} "${value}" --stage ${stage}`, {
          cwd: projectRoot,
          stdio: 'pipe', // Suppress output
          env,
        });

        console.log(chalk.green(`✓ Set ${chalk.bold(secretName)} for ${chalk.cyan(stage)}`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`✗ Failed to set ${secretName} for ${stage}`));
        console.log(chalk.dim(`  Error: ${error instanceof Error ? error.message : String(error)}`));
        failCount++;
      }
    }
  }

  console.log();
  console.log(chalk.bold('═'.repeat(60)));

  if (failCount === 0) {
    console.log(chalk.green.bold(`✅ All secrets configured successfully! (${successCount} total)`));
  } else {
    console.log(chalk.yellow.bold(`⚠️  Setup complete with ${failCount} error(s) (${successCount} succeeded)`));
  }

  console.log(chalk.bold('═'.repeat(60)));
  console.log();

  // Show next steps
  console.log(chalk.dim('Next steps:'));
  console.log(chalk.dim(`  • Run ${chalk.cyan('dk dev')} to start development`));
  console.log(chalk.dim(`  • Run ${chalk.cyan('dk deploy staging')} to deploy to staging`));
  console.log(chalk.dim(`  • View secrets: ${chalk.cyan('npx sst secret list --stage <stage>')}`));
  console.log();
}
