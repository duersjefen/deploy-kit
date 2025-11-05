import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

/**
 * Setup GitHub Actions workflow for remote deployments
 * Adds workflow file + required secrets to GitHub repo
 */
export async function setupRemoteDeploy(projectRoot: string = process.cwd()): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 Setting up remote deployment via GitHub Actions\n'));

  // 1. Create .github/workflows/deploy.yml
  await createDeployWorkflow(projectRoot);

  // 2. Detect AWS profile from CLAUDE.md
  const awsProfile = await detectAWSProfile(projectRoot);

  // 3. Add GitHub secrets
  await addGitHubSecrets(projectRoot, awsProfile);

  console.log(chalk.green('\n✅ Remote deployment setup complete!\n'));
  console.log(chalk.cyan('To deploy from your phone:'));
  console.log(chalk.white('  1. Open GitHub mobile app'));
  console.log(chalk.white('  2. Go to Actions tab'));
  console.log(chalk.white('  3. Select "Deploy" workflow'));
  console.log(chalk.white('  4. Run workflow → Choose stage (staging/production)\n'));
}

/**
 * Create .github/workflows/deploy.yml
 */
async function createDeployWorkflow(projectRoot: string): Promise<void> {
  const workflowsDir = path.join(projectRoot, '.github', 'workflows');
  await fs.ensureDir(workflowsDir);

  const workflowContent = `name: Deploy

on:
  workflow_dispatch:
    inputs:
      stage:
        description: 'Stage to deploy'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: \${{ secrets.AWS_REGION }}

      - name: Deploy
        run: npx @duersjefen/deploy-kit deploy \${{ inputs.stage }}
        env:
          CI: true
`;

  const workflowPath = path.join(workflowsDir, 'deploy.yml');
  await fs.writeFile(workflowPath, workflowContent);

  console.log(chalk.green('✅ Created .github/workflows/deploy.yml'));
}

/**
 * Detect AWS profile from project CLAUDE.md
 */
async function detectAWSProfile(projectRoot: string): Promise<string | null> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');

  if (!await fs.pathExists(claudeMdPath)) {
    return null;
  }

  const content = await fs.readFile(claudeMdPath, 'utf-8');

  // Look for AWS_PROFILE or AWS profile mentions
  const profileMatch = content.match(/AWS[_\s]?PROFILE[:\s]+([a-zA-Z0-9-]+)/i);
  if (profileMatch) {
    return profileMatch[1];
  }

  return null;
}

/**
 * Add GitHub secrets using gh CLI
 */
async function addGitHubSecrets(projectRoot: string, awsProfile: string | null): Promise<void> {
  // Check if gh CLI is authenticated
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch (error) {
    console.log(chalk.yellow('⚠️  GitHub CLI not authenticated - skipping secrets setup'));
    console.log(chalk.gray('   Run: gh auth login'));
    console.log(chalk.gray('   Then manually add secrets at: https://github.com/OWNER/REPO/settings/secrets/actions\n'));
    outputManualSecrets(awsProfile);
    return;
  }

  // Get AWS credentials from local profile or environment
  const awsCredentials = await getAWSCredentials(awsProfile);

  if (!awsCredentials) {
    console.log(chalk.yellow('⚠️  Could not auto-detect AWS credentials'));
    outputManualSecrets(awsProfile);
    return;
  }

  // Add secrets to GitHub
  try {
    console.log(chalk.cyan('\n📝 Adding GitHub secrets...'));

    execSync(`gh secret set AWS_ACCESS_KEY_ID --body "${awsCredentials.accessKeyId}"`, {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log(chalk.green('✅ Added AWS_ACCESS_KEY_ID'));

    execSync(`gh secret set AWS_SECRET_ACCESS_KEY --body "${awsCredentials.secretAccessKey}"`, {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log(chalk.green('✅ Added AWS_SECRET_ACCESS_KEY'));

    execSync(`gh secret set AWS_REGION --body "${awsCredentials.region}"`, {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log(chalk.green('✅ Added AWS_REGION'));

  } catch (error) {
    console.log(chalk.red('❌ Failed to add secrets via gh CLI'));
    outputManualSecrets(awsProfile);
  }
}

/**
 * Get AWS credentials from profile or environment
 */
async function getAWSCredentials(profile: string | null): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
} | null> {
  try {
    // Try to get credentials using AWS CLI
    const env = profile ? { ...process.env, AWS_PROFILE: profile } : process.env;

    const accessKeyId = execSync('aws configure get aws_access_key_id', {
      env,
      encoding: 'utf-8'
    }).trim();

    const secretAccessKey = execSync('aws configure get aws_secret_access_key', {
      env,
      encoding: 'utf-8'
    }).trim();

    const region = execSync('aws configure get region', {
      env,
      encoding: 'utf-8'
    }).trim();

    if (accessKeyId && secretAccessKey && region) {
      return { accessKeyId, secretAccessKey, region };
    }
  } catch (error) {
    // AWS CLI not available or credentials not found
  }

  return null;
}

/**
 * Output instructions for manually adding secrets
 */
function outputManualSecrets(awsProfile: string | null): void {
  console.log(chalk.yellow('\nManually add these secrets to GitHub:'));
  console.log(chalk.gray('━'.repeat(60)));
  console.log(chalk.white('Go to: https://github.com/OWNER/REPO/settings/secrets/actions\n'));
  console.log(chalk.cyan('Required secrets:'));
  console.log(chalk.white('  AWS_ACCESS_KEY_ID'));
  console.log(chalk.white('  AWS_SECRET_ACCESS_KEY'));
  console.log(chalk.white('  AWS_REGION'));

  if (awsProfile) {
    console.log(chalk.gray(`\nGet from AWS profile: ${awsProfile}`));
    console.log(chalk.gray(`  aws configure get aws_access_key_id --profile ${awsProfile}`));
    console.log(chalk.gray(`  aws configure get aws_secret_access_key --profile ${awsProfile}`));
    console.log(chalk.gray(`  aws configure get region --profile ${awsProfile}`));
  } else {
    console.log(chalk.gray('\nGet from: AWS Console → IAM → Users → Security credentials'));
  }

  console.log(chalk.gray('━'.repeat(60)));
}
