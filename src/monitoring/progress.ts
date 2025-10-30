import chalk from 'chalk';
import { DeploymentStage } from '../types.js';

/**
 * Progress monitoring and reporting
 * - Track deployment stages
 * - Display timing information
 * - Show current status
 */
export interface StageProgress {
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  message?: string;
}

export function getProgressMonitor() {
  const stages: Map<string, StageProgress> = new Map();
  const startTime = new Date();

  /**
   * Register a deployment stage
   */
  function registerStage(stageNum: number, name: string): void {
    stages.set(stageNum.toString(), {
      stage: `${stageNum}: ${name}`,
      status: 'pending',
    });
  }

  /**
   * Mark stage as in progress
   */
  function startStage(stageNum: number, message?: string): void {
    const key = stageNum.toString();
    const stage = stages.get(key);
    if (stage) {
      stage.status = 'in_progress';
      stage.startTime = new Date();
      stage.message = message;
    }
  }

  /**
   * Mark stage as completed
   */
  function completeStage(stageNum: number, message?: string): void {
    const key = stageNum.toString();
    const stage = stages.get(key);
    if (stage) {
      stage.status = 'completed';
      stage.endTime = new Date();
      stage.message = message;
    }
  }

  /**
   * Mark stage as failed
   */
  function failStage(stageNum: number, message?: string): void {
    const key = stageNum.toString();
    const stage = stages.get(key);
    if (stage) {
      stage.status = 'failed';
      stage.endTime = new Date();
      stage.message = message;
    }
  }

  /**
   * Get elapsed time in human-readable format
   */
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Display progress bar with percentage
   */
  function displayProgressBar(): void {
    const totalStages = stages.size;
    const completed = Array.from(stages.values()).filter(s => s.status === 'completed').length;
    const failed = Array.from(stages.values()).filter(s => s.status === 'failed').length;

    const percentage = Math.round((completed / totalStages) * 100);
    const barLength = 30;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    const elapsed = formatDuration(Date.now() - startTime.getTime());

    if (failed > 0) {
      console.log(chalk.red(`\n[${bar}] ${percentage}% - ${elapsed} (${failed} failed)\n`));
    } else {
      console.log(chalk.cyan(`\n[${bar}] ${percentage}% - ${elapsed}\n`));
    }
  }

  /**
   * Display all stages with current status
   */
  function displayStages(): void {
    console.log(chalk.bold.cyan('\nDeployment Progress:\n'));

    for (const [_key, stage] of stages) {
      let icon = '⏳';
      let color = chalk.gray;

      switch (stage.status) {
        case 'completed':
          icon = '✅';
          color = chalk.green;
          break;
        case 'in_progress':
          icon = '⏳';
          color = chalk.cyan;
          break;
        case 'failed':
          icon = '❌';
          color = chalk.red;
          break;
        case 'pending':
          icon = '⭕';
          color = chalk.gray;
          break;
      }

      let line = `${icon} ${stage.stage}`;

      if (stage.startTime && stage.endTime) {
        const duration = formatDuration(stage.endTime.getTime() - stage.startTime.getTime());
        line += ` (${duration})`;
      } else if (stage.startTime) {
        const elapsed = formatDuration(Date.now() - stage.startTime.getTime());
        line += ` (${elapsed}...)`;
      }

      if (stage.message) {
        line += ` - ${stage.message}`;
      }

      console.log(color(line));
    }

    console.log('');
  }

  /**
   * Display summary
   */
  function displaySummary(success: boolean): void {
    const elapsed = formatDuration(Date.now() - startTime.getTime());
    const totalStages = stages.size;
    const completed = Array.from(stages.values()).filter(s => s.status === 'completed').length;

    console.log(chalk.bold(`\n${'='.repeat(50)}`));
    console.log(chalk.bold('Deployment Summary'));
    console.log(chalk.bold(`${'='.repeat(50)}\n`));

    console.log(`Total time: ${chalk.cyan(elapsed)}`);
    console.log(`Stages completed: ${chalk.cyan(`${completed}/${totalStages}`)}`);

    if (success) {
      console.log(chalk.green.bold('\n✅ DEPLOYMENT SUCCESSFUL!\n'));
    } else {
      console.log(chalk.red.bold('\n❌ DEPLOYMENT FAILED\n'));
    }

    console.log(chalk.bold(`${'='.repeat(50)}\n`));
  }

  return {
    registerStage,
    startStage,
    completeStage,
    failStage,
    formatDuration,
    displayProgressBar,
    displayStages,
    displaySummary,
  };
}
