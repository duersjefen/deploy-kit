/**
 * DNS Resolution Validator
 *
 * Validates domain actually resolves correctly using multiple public DNS resolvers.
 * Critical for detecting DNS propagation issues and silent SST failures.
 *
 * @module dns-resolution-validator
 */

import { Resolver } from 'dns';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Public DNS resolvers to test against
 */
const PUBLIC_RESOLVERS = {
  google: '8.8.8.8',
  cloudflare: '1.1.1.1',
  quad9: '9.9.9.9',
  openDNS: '208.67.222.222',
};

/**
 * DNS query result
 */
export interface DNSQueryResult {
  resolver: string;
  resolverName: string;
  addresses: string[];
  success: boolean;
  error?: string;
}

/**
 * DNS validation result
 */
export interface DNSValidationResult {
  passed: boolean;
  domain: string;
  resolvers: DNSQueryResult[];
  consistent: boolean;
  propagated: boolean;
  message: string;
}

/**
 * Query a domain using a specific DNS resolver
 */
async function queryDNS(domain: string, resolver: string, resolverName: string): Promise<DNSQueryResult> {
  const customResolver = new Resolver();
  customResolver.setServers([resolver]);

  const resolve4 = promisify(customResolver.resolve4.bind(customResolver));
  const resolve6 = promisify(customResolver.resolve6.bind(customResolver));

  try {
    // Try IPv4 first
    const ipv4Addresses = await resolve4(domain).catch(() => [] as string[]);
    const ipv6Addresses = await resolve6(domain).catch(() => [] as string[]);

    const addresses = [...ipv4Addresses, ...ipv6Addresses];

    return {
      resolver,
      resolverName,
      addresses,
      success: addresses.length > 0,
    };
  } catch (error) {
    return {
      resolver,
      resolverName,
      addresses: [],
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate domain resolution across multiple public DNS resolvers
 *
 * Checks if domain resolves consistently across Google, Cloudflare, Quad9, and OpenDNS.
 * This detects DNS propagation issues and verifies domain is globally accessible.
 *
 * @param domain - Domain to validate (e.g., 'staging.example.com')
 * @param maxAttempts - Maximum retry attempts (default: 6 = 1 minute with 10s intervals)
 * @param retryInterval - Milliseconds between retries (default: 10000 = 10 seconds)
 * @returns Validation result with resolver responses
 */
export async function validateDNSResolution(
  domain: string,
  maxAttempts: number = 6,
  retryInterval: number = 10000
): Promise<DNSValidationResult> {
  const spinner = ora(`Validating DNS resolution for ${domain}...`).start();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    spinner.text = `Validating DNS resolution for ${domain}... (attempt ${attempt}/${maxAttempts})`;

    // Query all public resolvers in parallel
    const results = await Promise.all([
      queryDNS(domain, PUBLIC_RESOLVERS.google, 'Google DNS'),
      queryDNS(domain, PUBLIC_RESOLVERS.cloudflare, 'Cloudflare'),
      queryDNS(domain, PUBLIC_RESOLVERS.quad9, 'Quad9'),
      queryDNS(domain, PUBLIC_RESOLVERS.openDNS, 'OpenDNS'),
    ]);

    const successfulResolvers = results.filter(r => r.success);
    const failedResolvers = results.filter(r => !r.success);

    // Check if at least one resolver succeeded
    if (successfulResolvers.length > 0) {
      // Check consistency: all successful resolvers should return same IPs
      const firstAddresses = new Set(successfulResolvers[0].addresses);
      const allConsistent = successfulResolvers.every(r =>
        r.addresses.length === firstAddresses.size &&
        r.addresses.every(addr => firstAddresses.has(addr))
      );

      const propagated = successfulResolvers.length >= 3; // At least 3/4 resolvers

      if (allConsistent && propagated) {
        spinner.succeed(chalk.green(`✅ DNS resolution validated: ${domain}`));

        console.log(chalk.gray('\nResolver Results:'));
        successfulResolvers.forEach(r => {
          console.log(chalk.gray(`  ${r.resolverName}: ${r.addresses.join(', ')}`));
        });

        return {
          passed: true,
          domain,
          resolvers: results,
          consistent: true,
          propagated: true,
          message: `Domain resolves consistently across ${successfulResolvers.length}/4 public DNS resolvers`,
        };
      }

      if (!allConsistent) {
        spinner.warn(chalk.yellow(`⚠️  Inconsistent DNS responses for ${domain}`));

        console.log(chalk.yellow('\nInconsistent responses detected:'));
        successfulResolvers.forEach(r => {
          console.log(chalk.yellow(`  ${r.resolverName}: ${r.addresses.join(', ')}`));
        });

        return {
          passed: false,
          domain,
          resolvers: results,
          consistent: false,
          propagated: false,
          message: 'DNS responses are inconsistent across resolvers - propagation incomplete',
        };
      }

      if (!propagated) {
        spinner.text = `DNS partially propagated (${successfulResolvers.length}/4 resolvers)...`;

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          continue;
        }

        spinner.warn(chalk.yellow(`⚠️  DNS partially propagated for ${domain}`));

        return {
          passed: false,
          domain,
          resolvers: results,
          consistent: allConsistent,
          propagated: false,
          message: `Only ${successfulResolvers.length}/4 resolvers have propagated DNS`,
        };
      }
    }

    // No successful resolvers
    if (attempt < maxAttempts) {
      spinner.text = `Waiting for DNS propagation... (${attempt}/${maxAttempts})`;
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      continue;
    }

    spinner.fail(chalk.red(`❌ DNS resolution failed for ${domain}`));

    console.log(chalk.red('\nAll DNS resolvers failed:'));
    failedResolvers.forEach(r => {
      console.log(chalk.red(`  ${r.resolverName}: ${r.error || 'No response'}`));
    });

    return {
      passed: false,
      domain,
      resolvers: results,
      consistent: false,
      propagated: false,
      message: 'Domain does not resolve on any public DNS resolver',
    };
  }

  // Should never reach here
  spinner.fail(chalk.red(`❌ DNS resolution validation timeout for ${domain}`));

  return {
    passed: false,
    domain,
    resolvers: [],
    consistent: false,
    propagated: false,
    message: 'DNS validation timed out',
  };
}

/**
 * Wait for domain to resolve with retries
 *
 * Simplified version that just waits for domain to be resolvable,
 * without consistency checks. Useful for CI/CD environments.
 *
 * @param domain - Domain to check
 * @param maxAttempts - Maximum attempts (default: 12 = 2 minutes)
 * @param retryInterval - Milliseconds between retries (default: 10000)
 * @returns true if domain resolves, false if timeout
 */
export async function waitForDNS(
  domain: string,
  maxAttempts: number = 12,
  retryInterval: number = 10000
): Promise<boolean> {
  const spinner = ora(`Waiting for ${domain} to resolve...`).start();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await queryDNS(domain, PUBLIC_RESOLVERS.cloudflare, 'Cloudflare');

      if (result.success && result.addresses.length > 0) {
        spinner.succeed(chalk.green(`✅ ${domain} is now resolvable`));
        return true;
      }

      if (attempt < maxAttempts) {
        spinner.text = `Waiting for ${domain} to resolve... (${attempt}/${maxAttempts})`;
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    } catch (error) {
      if (attempt >= maxAttempts) {
        spinner.fail(chalk.red(`❌ ${domain} did not resolve within timeout`));
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  spinner.fail(chalk.red(`❌ DNS resolution timeout for ${domain}`));
  return false;
}
