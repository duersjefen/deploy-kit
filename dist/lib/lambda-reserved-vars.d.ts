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
export declare const RESERVED_LAMBDA_ENV_VARS: readonly ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_EXECUTION_ENV", "AWS_LAMBDA_FUNCTION_NAME", "AWS_LAMBDA_FUNCTION_VERSION", "AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "AWS_LAMBDA_FUNCTION_INVOKED_ARN", "AWS_LAMBDA_RUNTIME_API", "AWS_LAMBDA_LOG_GROUP_NAME", "AWS_LAMBDA_LOG_STREAM_NAME", "AWS_LAMBDA_INITIALIZATION_TYPE", "AWS_XRAY_DAEMON_ADDRESS", "AWS_XRAY_CONTEXT_MISSING", "_AWS_XRAY_DAEMON_ADDRESS", "_AWS_XRAY_DAEMON_PORT", "_X_AMZN_TRACE_ID", "LAMBDA_TASK_ROOT", "LAMBDA_RUNTIME_DIR", "TZ"];
/**
 * Suggestions for commonly misused reserved variables
 */
export declare const RESERVED_VAR_SUGGESTIONS: Record<string, string>;
/**
 * Check if a variable name is reserved by AWS Lambda
 */
export declare function isReservedLambdaVar(varName: string): boolean;
/**
 * Get suggestion for a reserved variable
 */
export declare function getSuggestionForReservedVar(varName: string): string | undefined;
export interface ReservedVarViolation {
    varName: string;
    lineNumber?: number;
    suggestion?: string;
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
export declare function findReservedVarsInSstConfig(configContent: string): ReservedVarViolation[];
/**
 * Format reserved variable violations into user-friendly error message
 */
export declare function formatReservedVarError(violations: ReservedVarViolation[]): string;
//# sourceMappingURL=lambda-reserved-vars.d.ts.map