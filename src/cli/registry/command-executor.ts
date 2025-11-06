/**
 * Command Execution Service
 *
 * Handles execution of all Deploy-Kit commands with:
 * - Real-time progress streaming
 * - Event emission for UI updates
 * - Multi-operation support
 * - Cancellation handling
 * - History tracking
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { getCommandMetadata, type CommandMetadata } from './command-registry.js';

// Import all command handlers
import { runInit, type InitFlags } from '../init/index.js';
import { handleValidateCommand } from '../commands/validate.js';
import { handleDoctorCommand } from '../commands/doctor.js';
import { setupCCW } from '../commands/ccw.js';
import { setupRemoteDeploy } from '../commands/remote-deploy.js';
import { handleDevCommand, type DevOptions } from '../commands/dev.js';
import { handleReleaseCommand, type ReleaseType } from '../commands/release.js';
import { recover } from '../commands/recover.js';
import { handleCloudFrontCommand } from '../commands/cloudfront.js';
import { DeploymentKit } from '../../deployer.js';
import { getStatusChecker } from '../../status/checker.js';
import chalk from 'chalk';

// ============================================================================
// TYPES
// ============================================================================

export interface CommandExecutionOptions {
  onProgress?: (progress: ExecutionProgress) => void;
  onOutput?: (output: ExecutionOutput) => void;
  onError?: (error: ExecutionError) => void;
  cwd?: string;
}

export interface ExecutionProgress {
  commandId: string;
  stage: string;
  percentage: number;
  message: string;
  timestamp: number;
}

export interface ExecutionOutput {
  commandId: string;
  type: 'stdout' | 'stderr' | 'info' | 'success' | 'warning' | 'error';
  content: string;
  timestamp: number;
}

export interface ExecutionError {
  commandId: string;
  error: Error;
  timestamp: number;
}

export interface CommandResult {
  commandId: string;
  commandName: string;
  success: boolean;
  duration: number;
  output: ExecutionOutput[];
  error?: Error;
  timestamp: number;
}

export interface ActiveCommand {
  id: string;
  name: string;
  args: Record<string, any>;
  startTime: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

// ============================================================================
// COMMAND EXECUTOR SERVICE
// ============================================================================

export class CommandExecutor extends EventEmitter {
  private activeCommands = new Map<string, ActiveCommand>();
  private commandHistory: CommandResult[] = [];
  private executionCount = 0;

  constructor() {
    super();
  }

  /**
   * Execute a command with the given arguments
   */
  async execute(
    commandName: string,
    args: Record<string, any> = {},
    options: CommandExecutionOptions = {}
  ): Promise<CommandResult> {
    const commandId = `${commandName}-${++this.executionCount}-${Date.now()}`;
    const startTime = Date.now();
    const metadata = getCommandMetadata(commandName);

    if (!metadata) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    // Create active command entry
    const activeCommand: ActiveCommand = {
      id: commandId,
      name: commandName,
      args,
      startTime,
      status: 'pending',
    };
    this.activeCommands.set(commandId, activeCommand);

    // Emit start event
    this.emit('command:start', {
      commandId,
      commandName,
      args,
      timestamp: startTime,
    });

    // Validate parameters
    const validationResult = this.validateParameters(metadata, args);
    if (!validationResult.success) {
      const error = new Error(`Invalid parameters: ${validationResult.error}`);
      this.emitError(commandId, error, options);
      return this.createFailureResult(commandId, commandName, startTime, error, []);
    }

    // Update status to running
    activeCommand.status = 'running';
    this.emit('command:running', { commandId, timestamp: Date.now() });

    const outputs: ExecutionOutput[] = [];
    const outputCollector = (output: ExecutionOutput) => {
      outputs.push(output);
      if (options.onOutput) {
        options.onOutput(output);
      }
      this.emit('command:output', output);
    };

    try {
      // Execute the command
      await this.executeCommand(
        commandName,
        args,
        commandId,
        outputCollector,
        options
      );

      // Mark as completed
      activeCommand.status = 'completed';
      const duration = Date.now() - startTime;

      const result: CommandResult = {
        commandId,
        commandName,
        success: true,
        duration,
        output: outputs,
        timestamp: startTime,
      };

      this.emit('command:complete', {
        commandId,
        duration,
        timestamp: Date.now(),
      });

      this.commandHistory.push(result);
      this.activeCommands.delete(commandId);

      return result;
    } catch (error) {
      // Mark as failed
      activeCommand.status = 'failed';
      const errorObj = error as Error;

      this.emitError(commandId, errorObj, options);

      const result = this.createFailureResult(
        commandId,
        commandName,
        startTime,
        errorObj,
        outputs
      );

      this.commandHistory.push(result);
      this.activeCommands.delete(commandId);

      throw error;
    }
  }

  /**
   * Validate command parameters against metadata
   */
  private validateParameters(
    metadata: CommandMetadata,
    args: Record<string, any>
  ): { success: boolean; error?: string } {
    // Check required parameters
    for (const param of metadata.parameters) {
      if (param.required && !(param.name in args)) {
        return {
          success: false,
          error: `Missing required parameter: ${param.name}`,
        };
      }

      // Validate with Zod schema if provided
      if (param.name in args && param.validation) {
        const result = param.validation.safeParse(args[param.name]);
        if (!result.success) {
          return {
            success: false,
            error: `Invalid ${param.name}: ${result.error.message}`,
          };
        }
      }

      // Validate enum values
      if (param.type === 'enum' && param.name in args) {
        if (!param.options?.includes(args[param.name])) {
          return {
            success: false,
            error: `Invalid ${param.name}. Must be one of: ${param.options?.join(', ')}`,
          };
        }
      }
    }

    return { success: true };
  }

  /**
   * Execute specific command
   */
  private async executeCommand(
    commandName: string,
    args: Record<string, any>,
    commandId: string,
    outputCollector: (output: ExecutionOutput) => void,
    options: CommandExecutionOptions
  ): Promise<void> {
    const cwd = options.cwd || process.cwd();

    // Helper to emit output
    const emit = (type: ExecutionOutput['type'], content: string) => {
      outputCollector({
        commandId,
        type,
        content,
        timestamp: Date.now(),
      });
    };

    emit('info', `Executing: dk ${commandName} ${JSON.stringify(args)}`);

    // Route to appropriate handler
    switch (commandName) {
      case 'init': {
        const flags: InitFlags = {
          configOnly: args.configOnly || false,
          scriptsOnly: args.scriptsOnly || false,
          nonInteractive: args.nonInteractive || false,
          withQualityTools: args.withQualityTools || false,
          projectName: args.projectName,
          domain: args.domain,
          awsProfile: args.awsProfile,
          awsRegion: args.awsRegion,
        };
        await runInit(cwd, flags);
        emit('success', 'Project initialized successfully');
        break;
      }

      case 'validate':
        await handleValidateCommand(cwd);
        emit('success', 'Configuration validated successfully');
        break;

      case 'doctor':
        await handleDoctorCommand(cwd);
        emit('success', 'Health checks completed');
        break;

      case 'ccw':
        await setupCCW(cwd);
        emit('success', 'CCW setup completed');
        break;

      case 'remote-deploy':
        await setupRemoteDeploy(cwd);
        emit('success', 'Remote deploy setup completed');
        break;

      case 'dev': {
        const devOptions: DevOptions = {
          skipChecks: args.skipChecks || false,
          port: args.port,
          interactive: args.interactive || false,
        };
        await handleDevCommand(cwd, devOptions);
        emit('success', 'Dev server started');
        break;
      }

      case 'deploy': {
        const config = await this.loadConfig(cwd);
        const kit = new DeploymentKit(config, cwd, {
          logLevel: args.logLevel || 'info',
          verbose: args.verbose || false,
        });

        const result = await kit.deploy(args.stage, {
          isDryRun: args.dryRun || false,
          showDiff: args.showDiff || false,
          benchmark: args.benchmark || false,
          skipPreChecks: args.skipChecks || false,
          maintenance: args.withMaintenanceMode
            ? { customPagePath: args.maintenancePage }
            : undefined,
        });

        if (result.success) {
          emit('success', `Deployment to ${args.stage} completed successfully`);
        } else {
          throw new Error('Deployment failed');
        }
        break;
      }

      case 'status': {
        const config = await this.loadConfig(cwd);
        const statusChecker = getStatusChecker(config, cwd);

        if (args.stage) {
          await statusChecker.checkStage(args.stage);
        } else {
          await statusChecker.checkAllStages();
        }
        emit('success', 'Status check completed');
        break;
      }

      case 'health': {
        const config = await this.loadConfig(cwd);
        const kit = new DeploymentKit(config, cwd);
        const healthy = await kit.validateHealth(args.stage);

        if (healthy) {
          emit('success', `Health checks passed for ${args.stage}`);
        } else {
          throw new Error('Health checks failed');
        }
        break;
      }

      case 'recover':
        await recover(args.target, cwd);
        emit('success', `Recovery completed for ${args.target}`);
        break;

      case 'cloudfront': {
        const config = await this.loadConfig(cwd);
        await handleCloudFrontCommand(args.subcommand, [], config, cwd);
        emit('success', `CloudFront ${args.subcommand} completed`);
        break;
      }

      case 'release': {
        await handleReleaseCommand({
          type: args.type as ReleaseType,
          dryRun: args.dryRun || false,
          skipTests: args.skipTests || false,
          cwd,
        });
        emit('success', `Release ${args.type} completed`);
        break;
      }

      default:
        throw new Error(`Command not implemented: ${commandName}`);
    }
  }

  /**
   * Load .deploy-config.json
   */
  private async loadConfig(cwd: string): Promise<any> {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    try {
      const configPath = resolve(cwd, '.deploy-config.json');
      const configContent = readFileSync(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error('.deploy-config.json not found in current directory');
    }
  }

  /**
   * Cancel a running command
   */
  async cancel(commandId: string): Promise<void> {
    const activeCommand = this.activeCommands.get(commandId);
    if (!activeCommand) {
      throw new Error(`Command not found: ${commandId}`);
    }

    activeCommand.status = 'cancelled';
    this.emit('command:cancelled', {
      commandId,
      timestamp: Date.now(),
    });

    this.activeCommands.delete(commandId);
  }

  /**
   * Get all active commands
   */
  getActiveCommands(): ActiveCommand[] {
    return Array.from(this.activeCommands.values());
  }

  /**
   * Get command history
   */
  getHistory(limit?: number): CommandResult[] {
    const history = [...this.commandHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.commandHistory = [];
  }

  /**
   * Emit error event
   */
  private emitError(
    commandId: string,
    error: Error,
    options: CommandExecutionOptions
  ): void {
    const errorObj: ExecutionError = {
      commandId,
      error,
      timestamp: Date.now(),
    };

    if (options.onError) {
      options.onError(errorObj);
    }

    this.emit('command:error', errorObj);
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    commandId: string,
    commandName: string,
    startTime: number,
    error: Error,
    outputs: ExecutionOutput[]
  ): CommandResult {
    return {
      commandId,
      commandName,
      success: false,
      duration: Date.now() - startTime,
      output: outputs,
      error,
      timestamp: startTime,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const commandExecutor = new CommandExecutor();
