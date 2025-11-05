/**
 * AWS API Retry Utility
 *
 * Provides retry logic with exponential backoff for AWS SDK operations.
 * Handles transient failures like rate limiting, network errors, and temporary AWS issues.
 */

/**
 * AWS SDK error types that should be retried
 */
const RETRYABLE_ERROR_CODES = [
  'RequestTimeout',
  'RequestTimeoutException',
  'PriorRequestNotComplete',
  'ConnectionError',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'NetworkingError',
  'TimeoutError',
  'ProvisionedThroughputExceededException',
  'Throttling',
  'ThrottlingException',
  'RequestLimitExceeded',
  'TooManyRequestsException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'InternalFailure',
  'InternalError',
  'InternalServiceError',
];

/**
 * Check if an error should be retried
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  // Check error code
  if (error.name && RETRYABLE_ERROR_CODES.includes(error.name)) {
    return true;
  }

  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // Check error message for common retry patterns
  const message = error.message || '';
  if (
    message.includes('timeout') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('rate limit') ||
    message.includes('throttl') ||
    message.includes('Too Many Requests')
  ) {
    return true;
  }

  // Check HTTP status codes
  if (error.$metadata?.httpStatusCode) {
    const statusCode = error.$metadata.httpStatusCode;
    // Retry on 429 (Too Many Requests), 500, 502, 503, 504
    if (statusCode === 429 || statusCode >= 500) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds (default: 1000ms)
 * @param maxDelay - Maximum delay in milliseconds (default: 30000ms)
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (random ±25% variation) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful operation
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => client.send(command),
 *   { maxAttempts: 3, baseDelay: 1000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (error: any, attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, throw
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Not retryable - throw immediately
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);

      // Notify caller about retry
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This shouldn't be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrap an AWS SDK client command with automatic retry
 *
 * @param client - AWS SDK client instance
 * @param command - AWS SDK command to execute
 * @param options - Retry configuration
 * @returns Command response
 *
 * @example
 * ```typescript
 * const response = await retryAWSCommand(
 *   route53Client,
 *   new ListHostedZonesCommand({}),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function retryAWSCommand<TOutput = any>(
  client: { send: (command: any) => Promise<TOutput> },
  command: any,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (error: any, attempt: number, delay: number) => void;
  } = {}
): Promise<TOutput> {
  return retryWithBackoff(
    () => client.send(command),
    options
  );
}
