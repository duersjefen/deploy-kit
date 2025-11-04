/**
 * Configuration file generation (deploy-config, package.json, Makefile)
 */
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
/**
 * Generate .deploy-config.json content
 */
export function generateDeployConfig(answers) {
    return JSON.stringify({
        projectName: answers.projectName,
        displayName: answers.projectName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        infrastructure: 'sst-serverless',
        database: 'dynamodb',
        stages: ['staging', 'production'],
        mainDomain: answers.mainDomain,
        awsProfile: answers.awsProfile,
        requireCleanGit: true,
        runTestsBeforeDeploy: answers.runTests,
        stageConfig: {
            staging: {
                domain: answers.stagingDomain,
                requiresConfirmation: false,
                awsRegion: answers.awsRegion,
            },
            production: {
                domain: answers.productionDomain,
                requiresConfirmation: true,
                awsRegion: answers.awsRegion,
            },
        },
        healthChecks: [
            {
                url: '/',
                expectedStatus: 200,
                timeout: 5000,
                name: 'Homepage',
            },
            {
                url: '/api/health',
                expectedStatus: 200,
                timeout: 5000,
                name: 'Health endpoint',
            },
        ],
        hooks: {
            preDeploy: answers.runTests ? 'npm test' : '',
            postBuild: 'npm run build',
        },
    }, null, 2);
}
/**
 * Create .deploy-config.json
 */
export function createDeployConfig(answers, projectRoot, mergedConfig) {
    const spinner = ora('Creating .deploy-config.json...').start();
    try {
        const configPath = join(projectRoot, '.deploy-config.json');
        let content;
        if (mergedConfig) {
            content = JSON.stringify(mergedConfig, null, 2);
        }
        else {
            content = generateDeployConfig(answers);
        }
        writeFileSync(configPath, content, 'utf-8');
        spinner.succeed(chalk.green('✅ Created .deploy-config.json'));
    }
    catch (error) {
        spinner.fail('Failed to create .deploy-config.json');
        throw error;
    }
}
/**
 * Update package.json with deploy scripts
 */
export function updatePackageJson(answers, projectRoot) {
    const spinner = ora('Updating package.json...').start();
    try {
        const packagePath = join(projectRoot, 'package.json');
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
        if (!packageJson.scripts) {
            packageJson.scripts = {};
        }
        packageJson.scripts['deploy:staging'] = 'npx @duersjefen/deploy-kit deploy staging';
        packageJson.scripts['deploy:prod'] = 'npx @duersjefen/deploy-kit deploy production';
        packageJson.scripts['deployment-status'] = 'npx @duersjefen/deploy-kit status';
        packageJson.scripts['recover:staging'] = 'npx @duersjefen/deploy-kit recover staging';
        packageJson.scripts['recover:prod'] = 'npx @duersjefen/deploy-kit recover production';
        packageJson.scripts['validate:config'] = 'npx @duersjefen/deploy-kit validate';
        packageJson.scripts['doctor'] = 'npx @duersjefen/deploy-kit doctor';
        writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        spinner.succeed(chalk.green('✅ Updated package.json with deploy scripts'));
    }
    catch (error) {
        spinner.fail('Failed to update package.json');
        throw error;
    }
}
// Makefile generation removed - users should use `dk` commands directly
