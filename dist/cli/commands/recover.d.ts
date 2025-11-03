/**
 * Recovery Command
 *
 * Handles stuck SST deployments and state machine issues.
 * This command is specifically designed to prevent and fix the issue:
 * "CloudFront update fails → SST continues → IAM roles never update → stuck state"
 *
 * Usage:
 *   deploy-kit recover cloudfront  # Fix stuck CloudFront distributions
 *   deploy-kit recover state       # Fix corrupted Pulumi state
 *   deploy-kit recover dev         # General dev environment recovery
 */
/**
 * Main recovery command handler
 */
export declare function recover(target: string, projectRoot?: string): Promise<void>;
//# sourceMappingURL=recover.d.ts.map