/**
 * AWS Lambda Reserved Environment Variables Validator
 *
 * Detects usage of reserved AWS Lambda environment variables in SST config files
 * to prevent deployment failures with clear, actionable error messages.
 *
 * @see https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html
 */
/**
 * Reserved AWS Lambda environment variables
 *
 * These variables are set automatically by Lambda runtime and cannot be overridden.
 * Attempting to set them will cause InvalidParameterValueException during deployment.
 */
export const RESERVED_LAMBDA_ENV_VARS = [
    // AWS Credentials and Identity
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    // AWS Region and Execution
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AWS_EXECUTION_ENV',
    // Lambda Function Info
    'AWS_LAMBDA_FUNCTION_NAME',
    'AWS_LAMBDA_FUNCTION_VERSION',
    'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
    'AWS_LAMBDA_FUNCTION_INVOKED_ARN',
    // Lambda Runtime
    'AWS_LAMBDA_RUNTIME_API',
    'AWS_LAMBDA_LOG_GROUP_NAME',
    'AWS_LAMBDA_LOG_STREAM_NAME',
    // Lambda Initialization
    'AWS_LAMBDA_INITIALIZATION_TYPE',
    // X-Ray Tracing
    'AWS_XRAY_DAEMON_ADDRESS',
    'AWS_XRAY_CONTEXT_MISSING',
    '_AWS_XRAY_DAEMON_ADDRESS',
    '_AWS_XRAY_DAEMON_PORT',
    '_X_AMZN_TRACE_ID',
    // Language-specific runtime variables
    'LAMBDA_TASK_ROOT',
    'LAMBDA_RUNTIME_DIR',
    // Other reserved variables
    'TZ', // Timezone (can be set by user but not recommended)
];
/**
 * Suggestions for commonly misused reserved variables
 */
export const RESERVED_VAR_SUGGESTIONS = {
    AWS_REGION: 'Use `providers.aws.region` in sst.config.ts instead. AWS SDK automatically detects region from Lambda environment.',
    AWS_DEFAULT_REGION: 'Use `providers.aws.region` in sst.config.ts instead.',
    AWS_ACCESS_KEY_ID: 'Lambda execution role provides credentials automatically. Do not set AWS credentials as environment variables.',
    AWS_SECRET_ACCESS_KEY: 'Lambda execution role provides credentials automatically. Do not set AWS credentials as environment variables.',
    AWS_SESSION_TOKEN: 'Lambda execution role provides credentials automatically. Do not set AWS credentials as environment variables.',
    AWS_LAMBDA_FUNCTION_NAME: 'This is set automatically by Lambda runtime. Access via process.env.AWS_LAMBDA_FUNCTION_NAME at runtime.',
    AWS_LAMBDA_FUNCTION_VERSION: 'This is set automatically by Lambda runtime. Access via process.env.AWS_LAMBDA_FUNCTION_VERSION at runtime.',
};
/**
 * Check if a variable name is reserved by AWS Lambda
 */
export function isReservedLambdaVar(varName) {
    return RESERVED_LAMBDA_ENV_VARS.includes(varName);
}
/**
 * Get suggestion for a reserved variable
 */
export function getSuggestionForReservedVar(varName) {
    return RESERVED_VAR_SUGGESTIONS[varName];
}
/**
 * Find reserved environment variables in SST config content
 *
 * Parses TypeScript/JavaScript code to find environment variable definitions
 * like `environment: { AWS_REGION: "..." }`
 *
 * @param configContent - Content of sst.config.ts or sst.config.js
 * @returns Array of violations with variable names and line numbers
 */
export function findReservedVarsInSstConfig(configContent) {
    const violations = [];
    const lines = configContent.split('\n');
    // Pattern 1: environment: { VAR_NAME: ... }
    // Pattern 2: environment: { "VAR_NAME": ... }
    // Pattern 3: environment: { 'VAR_NAME': ... }
    const envVarPattern = /environment:\s*\{[^}]*\}/gs;
    // Find all environment blocks
    const matches = configContent.matchAll(envVarPattern);
    for (const match of matches) {
        const envBlock = match[0];
        const startIndex = match.index || 0;
        // Find line number where this block starts
        const lineNumber = configContent.substring(0, startIndex).split('\n').length;
        // Extract individual variable names from the block
        // Match: VAR_NAME: or "VAR_NAME": or 'VAR_NAME':
        const varNamePattern = /['"]?([A-Z_][A-Z0-9_]*)['"]?\s*:/g;
        const varMatches = envBlock.matchAll(varNamePattern);
        for (const varMatch of varMatches) {
            const varName = varMatch[1];
            if (isReservedLambdaVar(varName)) {
                violations.push({
                    varName,
                    lineNumber,
                    suggestion: getSuggestionForReservedVar(varName),
                });
            }
        }
    }
    return violations;
}
/**
 * Format reserved variable violations into user-friendly error message
 */
export function formatReservedVarError(violations) {
    let message = '❌ Reserved AWS Lambda environment variables detected:\n\n';
    for (const violation of violations) {
        message += `  • ${violation.varName}`;
        if (violation.lineNumber) {
            message += ` (line ~${violation.lineNumber})`;
        }
        message += '\n';
        if (violation.suggestion) {
            message += `    → ${violation.suggestion}\n`;
        }
    }
    message += '\nThese variables are set automatically by Lambda runtime and cannot be overridden.\n';
    message += 'See: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html';
    return message;
}
