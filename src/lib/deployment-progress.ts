/**
 * Deployment Progress Tracker
 * Manages stage tracking, progress bars, and time estimation for deployments
 */

import chalk from 'chalk';

export interface DeploymentStage {
  number: number;
  total: number;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration?: number;
  startTime?: number;
}

export class DeploymentProgress {
  private stages: DeploymentStage[] = [];
  private currentStageIndex: number = -1;

  constructor(stageNames: string[]) {
    this.stages = stageNames.map((name, index) => ({
      number: index + 1,
      total: stageNames.length,
      name,
      status: 'pending' as const,
    }));
  }

  /**
   * Start tracking a stage
   */
  startStage(stageNumber: number): void {
    this.currentStageIndex = stageNumber - 1;
    this.stages[this.currentStageIndex].status = 'running';
    this.stages[this.currentStageIndex].startTime = Date.now();
  }

  /**
   * Mark a stage as complete (passed or failed)
   */
  completeStage(stageNumber: number, passed: boolean): void {
    const index = stageNumber - 1;
    this.stages[index].status = passed ? 'passed' : 'failed';
    if (this.stages[index].startTime) {
      this.stages[index].duration = Date.now() - (this.stages[index].startTime || 0);
    }
  }

  /**
   * Mark a stage as skipped
   */
  skipStage(stageNumber: number): void {
    this.stages[stageNumber - 1].status = 'skipped';
  }

  /**
   * Get formatted stage header (e.g., "STAGE 1/5: SST Environment Checks")
   */
  getStageHeader(stageNumber: number): string {
    const stage = this.stages[stageNumber - 1];
    return `STAGE ${stage.number}/${stage.total}: ${stage.name}`;
  }

  /**
   * Get visual progress bar showing all stages
   * Example: ✅ | ✅ | ⏳ | ⏸️ | ⏸️
   */
  getProgressBar(): string {
    const stageIndicators = this.stages.map(stage => {
      switch (stage.status) {
        case 'passed':
          return chalk.green('✅');
        case 'running':
          return chalk.yellow('⏳');
        case 'failed':
          return chalk.red('❌');
        case 'skipped':
          return chalk.gray('⏭️');
        case 'pending':
          return chalk.gray('⏸️');
      }
    });

    const labels = this.stages.map(stage => {
      const label = `Stage ${stage.number}`;
      switch (stage.status) {
        case 'passed':
          return chalk.green(label);
        case 'running':
          return chalk.yellow(label);
        case 'failed':
          return chalk.red(label);
        default:
          return chalk.gray(label);
      }
    });

    return `${stageIndicators.join(' | ')}\n${labels.join(' | ')}`;
  }

  /**
   * Get estimated time remaining based on completed stages
   * Returns null if not enough data to estimate
   */
  getEstimatedTimeRemaining(): number | null {
    const completedStages = this.stages.filter(s => s.status === 'passed' && s.duration);
    if (completedStages.length === 0) return null;

    const avgDuration = completedStages.reduce((sum, s) => sum + (s.duration || 0), 0) / completedStages.length;
    const remainingStages = this.stages.filter(s => s.status === 'pending').length;

    return Math.round(avgDuration * remainingStages / 1000); // in seconds
  }

  /**
   * Get formatted failure summary with stage context
   */
  getFailureSummary(failedStageNumber: number): string {
    const stage = this.stages[failedStageNumber - 1];
    const completedStages = this.stages.filter(s => s.status === 'passed').length;

    return `Failed at STAGE ${stage.number}/${stage.total}: ${stage.name} (${completedStages}/${stage.total - 1} prior stages completed)`;
  }

  /**
   * Print progress bar to console
   */
  printProgressBar(): void {
    console.log('\n' + chalk.bold('Deployment Progress:'));
    console.log(this.getProgressBar());

    const eta = this.getEstimatedTimeRemaining();
    if (eta !== null) {
      console.log(chalk.gray(`⏱️  Estimated time remaining: ~${eta}s\n`));
    } else {
      console.log(''); // Empty line
    }
  }
}
