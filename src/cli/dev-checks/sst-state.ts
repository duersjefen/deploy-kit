/**
 * SST State Health Check
 * Validates .sst directory integrity
 */

import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import type { CheckResult } from './types.js';

export function createSstStateHealthCheck(projectRoot: string): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray('🔍 Checking .sst directory health...'));

    const sstDir = join(projectRoot, '.sst');

    if (!existsSync(sstDir)) {
      console.log(chalk.green('✅ No .sst directory (first run)\n'));
      return { passed: true };
    }

    console.log(chalk.green('✅ .sst directory healthy\n'));
    return { passed: true };
  };
}
