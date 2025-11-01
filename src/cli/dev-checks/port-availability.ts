/**
 * Port Availability Check
 * Ensures required ports are not already in use
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import type { CheckResult } from './types.js';

export function createPortAvailabilityCheck(port: number): () => Promise<CheckResult> {
  return async () => {
    console.log(chalk.gray(`🔍 Checking if port ${port} is available...`));

    try {
      const result = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const processId = result.trim();

      if (processId) {
        return {
          passed: false,
          issue: `Port ${port} is in use by process ${processId}`,
          manualFix: `Kill process: lsof -ti:${port} | xargs kill -9`,
        };
      }
    } catch (error) {
      // lsof returns error code if no process found (port is available)
    }

    console.log(chalk.green('✅ Port available\n'));
    return { passed: true };
  };
}
