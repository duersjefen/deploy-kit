/**
 * Deployment Orchestrator - Main Entry Point
 *
 * Thin wrapper that coordinates the deployment workflow using specialized modules.
 *
 * Architecture:
 * - orchestration-coordinator: High-level workflow (build, deploy, extract)
 * - aws-state-manager: AWS resource state tracking and extraction
 * - deployment-printer: Result formatting and output
 *
 * This class provides the public API while delegating to focused modules.
 */

import type { ProjectConfig, DeploymentStage, DeploymentResult } from '../types.js';
import {
  isSSTProject,
  runBuild,
  executeDeploy,
} from './orchestration-coordinator.js';
import { extractCloudFrontDistributionId } from './aws-state-manager.js';
import {
  printDeploymentSummary,
  printDeploymentFailureSummary,
  type StageTiming,
} from './deployment-printer.js';

/**
 * Main deployment orchestrator class
 *
 * Coordinates the complete deployment workflow:
 * 1. Build the application
 * 2. Deploy to stage (SST or custom script)
 * 3. Extract deployment artifacts (CloudFront ID, etc.)
 * 4. Print results
 *
 * @example
 * ```typescript
 * const orchestrator = new DeploymentOrchestrator(config, '/path/to/project');
 * if (orchestrator.isSSTProject()) {
 *   const distId = await orchestrator.executeDeploy('staging');
 *   orchestrator.printDeploymentSummary(result, timings);
 * }
 * ```
 */
export class DeploymentOrchestrator {
  private config: ProjectConfig;
  private projectRoot: string;

  /**
   * Create a new deployment orchestrator
   *
   * @param config - Project configuration
   * @param projectRoot - Root directory of the project (defaults to cwd)
   */
  constructor(config: ProjectConfig, projectRoot: string = process.cwd()) {
    this.config = config;
    this.projectRoot = projectRoot;
  }

  /**
   * Detect if this is an SST project
   *
   * @returns True if sst.config.ts or sst.config.js exists
   */
  isSSTProject(): boolean {
    return isSSTProject(this.projectRoot);
  }

  /**
   * Run build command (for non-SST projects)
   *
   * @throws {Error} If build command fails
   */
  async runBuild(): Promise<void> {
    return runBuild(this.projectRoot, this.config);
  }

  /**
   * Execute deployment and extract CloudFront distribution ID
   *
   * @param stage - Deployment stage
   * @returns CloudFront distribution ID if found, null otherwise
   * @throws {Error} If deployment fails
   */
  async executeDeploy(stage: DeploymentStage): Promise<string | null> {
    return executeDeploy(stage, this.projectRoot, this.config);
  }

  /**
   * Extract CloudFront distribution ID from deployment output
   *
   * @param output - Deployment output text
   * @returns Distribution ID or null
   */
  extractCloudFrontDistributionId(output: string): string | null {
    return extractCloudFrontDistributionId(output);
  }

  /**
   * Print deployment success summary
   *
   * @param result - Deployment result
   * @param stageTimings - Timing information for each stage
   */
  printDeploymentSummary(result: DeploymentResult, stageTimings: StageTiming[]): void {
    printDeploymentSummary(result, stageTimings);
  }

  /**
   * Print deployment failure summary with recovery suggestions
   *
   * @param result - Deployment result
   * @param stageTimings - Timing information for each stage
   */
  printDeploymentFailureSummary(result: DeploymentResult, stageTimings: StageTiming[]): void {
    printDeploymentFailureSummary(result, stageTimings);
  }
}
