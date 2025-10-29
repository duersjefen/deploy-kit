import fetch from 'node-fetch';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectConfig, DeploymentStage, HealthCheck } from '../types.js';

/**
 * Health check validation after deployment
 */
export function getHealthChecker(config: ProjectConfig) {
  /**
   * Resolve full URL for a health check
   */
  function resolveUrl(check: HealthCheck, stage: DeploymentStage): string {
    if (check.url.startsWith('http')) {
      return check.url;
    }

    const domain = config.stageConfig[stage].domain ||
      `${stage}.${config.mainDomain}`;

    if (!domain) {
      throw new Error(`Cannot resolve domain for ${stage} - configure stageConfig.domain or mainDomain`);
    }

    const protocol = stage === 'dev' ? 'http' : 'https';
    return `${protocol}://${domain}${check.url}`;
  }

  /**
   * Perform a single health check
   */
  async function check(
    check: HealthCheck,
    stage: DeploymentStage,
    retries: number = 5
  ): Promise<boolean> {
    const url = resolveUrl(check, stage);
    const name = check.name || check.url;
    const spinner = ora(`Checking ${name}...`).start();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          check.timeout || 5000
        );

        const response = await fetch(url, {
          signal: controller.signal as any,
          timeout: check.timeout || 5000,
        });

        clearTimeout(timeoutId);

        const expectedStatus = check.expectedStatus || 200;
        const statusOk = response.status === expectedStatus ||
          (expectedStatus === 200 && [200, 301, 302].includes(response.status));

        if (!statusOk) {
          if (attempt < retries) {
            spinner.text = `Checking ${name} (attempt ${attempt}/${retries}, status ${response.status})...`;
            await sleep(2000 * attempt); // Exponential backoff
            continue;
          }
          spinner.fail(`❌ ${name}: Got ${response.status}, expected ${expectedStatus}`);
          return false;
        }

        // Check response content if specified
        if (check.searchText) {
          const text = await response.text();
          if (!text.includes(check.searchText)) {
            spinner.fail(`❌ ${name}: Response does not contain "${check.searchText}"`);
            return false;
          }
        }

        spinner.succeed(`✅ ${name}: ${response.status}`);
        return true;

      } catch (error) {
        if (attempt < retries) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          spinner.text = `Checking ${name} (attempt ${attempt}/${retries}, ${errorMsg})...`;
          await sleep(2000 * attempt); // Exponential backoff
          continue;
        }

        const errorMsg = error instanceof Error ? error.message : String(error);
        spinner.fail(`❌ ${name}: ${errorMsg}`);
        return false;
      }
    }

    return false;
  }

  /**
   * Run all health checks for a stage
   */
  async function runAll(stage: DeploymentStage): Promise<boolean> {
    const checks = config.stageConfig[stage].skipHealthChecks
      ? []
      : (config.healthChecks || []);

    if (checks.length === 0) {
      console.log(chalk.gray('No health checks configured'));
      return true;
    }

    let allPass = true;
    for (const check of checks) {
      const passed = await check(check, stage);
      if (!passed) allPass = false;
    }

    return allPass;
  }

  return { check, runAll };
}

/**
 * Helper: sleep for n milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
