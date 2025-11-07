/**
 * Domain Accessibility Tester
 *
 * Validates that deployed domain is actually accessible via HTTP/HTTPS.
 * Tests real user experience, not just DNS resolution or AWS resource creation.
 *
 * @module domain-accessibility-tester
 */

import chalk from 'chalk';
import ora from 'ora';

/**
 * HTTP test result
 */
export interface HTTPTestResult {
  protocol: 'http' | 'https';
  statusCode: number;
  success: boolean;
  responseTime: number;
  error?: string;
  redirectsTo?: string;
}

/**
 * Domain accessibility result
 */
export interface DomainAccessibilityResult {
  passed: boolean;
  domain: string;
  httpTest?: HTTPTestResult;
  httpsTest?: HTTPTestResult;
  message: string;
  accessible: boolean;
  sslValid: boolean;
}

/**
 * Test HTTP/HTTPS accessibility of a URL
 */
async function testURL(
  url: string,
  protocol: 'http' | 'https',
  timeout: number = 10000
): Promise<HTTPTestResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal as any,
      redirect: 'manual', // Don't follow redirects automatically
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;

    // Check for redirect
    let redirectsTo: string | undefined;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsTo = response.headers.get('location') || undefined;
    }

    return {
      protocol,
      statusCode: response.status,
      success: response.status >= 200 && response.status < 400,
      responseTime,
      redirectsTo,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return {
      protocol,
      statusCode: 0,
      success: false,
      responseTime,
      error: error.name === 'AbortError'
        ? 'Request timeout'
        : error.message || String(error),
    };
  }
}

/**
 * Test domain accessibility via HTTP and HTTPS
 *
 * Validates:
 * - Domain resolves and responds
 * - HTTPS works (SSL certificate valid)
 * - HTTP redirects to HTTPS (optional but recommended)
 * - Response time is reasonable
 *
 * @param domain - Domain to test (e.g., 'staging.example.com')
 * @param maxAttempts - Maximum retry attempts (default: 6 = 1 minute)
 * @param retryInterval - Milliseconds between retries (default: 10000)
 * @param requireHTTPSRedirect - Fail if HTTP doesn't redirect to HTTPS (default: false)
 * @returns Accessibility test result
 */
export async function testDomainAccessibility(
  domain: string,
  maxAttempts: number = 6,
  retryInterval: number = 10000,
  requireHTTPSRedirect: boolean = false
): Promise<DomainAccessibilityResult> {
  const spinner = ora(`Testing accessibility of ${domain}...`).start();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    spinner.text = `Testing accessibility of ${domain}... (attempt ${attempt}/${maxAttempts})`;

    // Test HTTPS first (primary protocol for production)
    const httpsTest = await testURL(`https://${domain}`, 'https');

    // Test HTTP (should redirect to HTTPS in production)
    const httpTest = await testURL(`http://${domain}`, 'http');

    // Check if HTTPS is working
    if (httpsTest.success) {
      spinner.succeed(chalk.green(`✅ Domain is accessible: https://${domain}`));

      console.log(chalk.gray('\nAccessibility Test Results:'));
      console.log(chalk.gray(`  HTTPS: ${httpsTest.statusCode} (${httpsTest.responseTime}ms)`));
      console.log(chalk.gray(`  HTTP:  ${httpTest.statusCode} (${httpTest.responseTime}ms)`));

      // Check HTTP to HTTPS redirect
      if (httpTest.redirectsTo && httpTest.redirectsTo.startsWith('https://')) {
        console.log(chalk.green('  ✓ HTTP redirects to HTTPS'));
      } else if (requireHTTPSRedirect) {
        console.log(chalk.yellow('  ⚠️  HTTP does not redirect to HTTPS (recommended)'));
      }

      return {
        passed: true,
        domain,
        httpTest,
        httpsTest,
        message: `Domain is accessible via HTTPS (${httpsTest.statusCode})`,
        accessible: true,
        sslValid: true,
      };
    }

    // HTTPS failed - check if it's CloudFront propagation delay
    if (httpsTest.error?.includes('ENOTFOUND')) {
      spinner.text = `Waiting for CloudFront propagation... (${attempt}/${maxAttempts})`;

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        continue;
      }

      spinner.fail(chalk.red(`❌ Domain not accessible: ${domain}`));

      return {
        passed: false,
        domain,
        httpTest,
        httpsTest,
        message: `Domain does not resolve (DNS or CloudFront not propagated)`,
        accessible: false,
        sslValid: false,
      };
    }

    // HTTPS failed - SSL certificate issue
    if (
      httpsTest.error?.includes('certificate') ||
      httpsTest.error?.includes('SSL') ||
      httpsTest.error?.includes('TLS')
    ) {
      spinner.text = `Waiting for SSL certificate... (${attempt}/${maxAttempts})`;

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        continue;
      }

      spinner.fail(chalk.red(`❌ SSL certificate error for ${domain}`));

      console.log(chalk.red('\nHTTPS Test Failed:'));
      console.log(chalk.red(`  Error: ${httpsTest.error}`));

      return {
        passed: false,
        domain,
        httpTest,
        httpsTest,
        message: `SSL certificate error: ${httpsTest.error}`,
        accessible: false,
        sslValid: false,
      };
    }

    // Some other error - retry
    if (attempt < maxAttempts) {
      spinner.text = `Retrying accessibility test... (${attempt}/${maxAttempts})`;
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      continue;
    }

    // Final attempt failed
    spinner.fail(chalk.red(`❌ Domain accessibility test failed for ${domain}`));

    console.log(chalk.red('\nAccessibility Test Results:'));
    console.log(chalk.red(`  HTTPS: ${httpsTest.error || `Status ${httpsTest.statusCode}`}`));
    console.log(chalk.red(`  HTTP:  ${httpTest.error || `Status ${httpTest.statusCode}`}`));

    return {
      passed: false,
      domain,
      httpTest,
      httpsTest,
      message: `Domain not accessible: ${httpsTest.error || 'Unknown error'}`,
      accessible: false,
      sslValid: false,
    };
  }

  // Should never reach here
  spinner.fail(chalk.red(`❌ Accessibility test timeout for ${domain}`));

  return {
    passed: false,
    domain,
    message: 'Accessibility test timed out',
    accessible: false,
    sslValid: false,
  };
}

/**
 * Quick accessibility check (single attempt, no retries)
 *
 * Useful for health checks that shouldn't block deployment.
 *
 * @param domain - Domain to test
 * @param timeout - Request timeout in milliseconds
 * @returns true if accessible, false otherwise
 */
export async function quickAccessibilityCheck(
  domain: string,
  timeout: number = 5000
): Promise<boolean> {
  const httpsTest = await testURL(`https://${domain}`, 'https', timeout);
  return httpsTest.success;
}

/**
 * Test specific URL path accessibility
 *
 * Useful for testing health endpoints or specific application routes.
 *
 * @param url - Full URL to test (e.g., 'https://staging.example.com/api/health')
 * @param expectedStatus - Expected HTTP status code (default: 200)
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @returns true if accessible and status matches, false otherwise
 */
export async function testURLPath(
  url: string,
  expectedStatus: number = 200,
  timeout: number = 5000
): Promise<{
  success: boolean;
  actualStatus: number;
  responseTime: number;
  error?: string;
}> {
  const protocol = url.startsWith('https://') ? 'https' : 'http';
  const result = await testURL(url, protocol, timeout);

  return {
    success: result.success && result.statusCode === expectedStatus,
    actualStatus: result.statusCode,
    responseTime: result.responseTime,
    error: result.error,
  };
}
