/**
 * Running SST Process Check
 * Detects zombie SST dev processes from previous crashed sessions
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import type { CheckResult } from './types.js';

interface SstProcess {
  pid: number;
  command: string;
  startTime: string;
  workingDir: string;
}

/**
 * Detect running SST dev processes
 *
 * Searches for:
 * - sst dev (main process)
 * - sst ui (SST console UI)
 * - node processes running SST-related commands
 */
export function createRunningSstProcessCheck(
  projectRoot: string,
  verbose: boolean = false
): () => Promise<CheckResult> {
  return async () => {
    if (verbose) {
      console.log(chalk.gray('🔍 [DEBUG] Checking for running SST processes...'));
    } else {
      console.log(chalk.gray('🔍 Checking for running SST processes...'));
    }

    try {
      const processes = await detectSstProcesses(projectRoot);

      if (verbose) {
        console.log(chalk.gray(`   [DEBUG] Found ${processes.length} SST processes`));
      }

      if (processes.length === 0) {
        console.log(chalk.green('✅ No running SST processes\n'));
        return { passed: true };
      }

      // Found running SST processes - provide detailed info
      const processDetails = processes
        .map(p => `   - PID: ${p.pid} (${p.command})`)
        .join('\n');

      const primaryProcess = processes[0];
      const manualFix = `
Kill the process(es):
  kill ${processes.map(p => p.pid).join(' ')}

Or kill all SST processes:
  pkill -f "sst dev"`;

      return {
        passed: false,
        issue: `Found ${processes.length} running SST process(es):\n${processDetails}`,
        manualFix,
        canAutoFix: true,
        errorType: 'running_sst_processes',
        autoFix: async () => {
          for (const process of processes) {
            try {
              execSync(`kill ${process.pid}`, { stdio: 'pipe' });
              console.log(chalk.gray(`   Killed PID ${process.pid}`));
            } catch (error) {
              // Process may have already exited
              console.log(chalk.gray(`   PID ${process.pid} already exited`));
            }
          }
          // Wait a moment for processes to clean up
          await new Promise(resolve => setTimeout(resolve, 500));
        },
      };
    } catch (error) {
      if (verbose) {
        console.log(chalk.yellow(`⚠️  [DEBUG] Could not check for SST processes: ${(error as Error).message}\n`));
      }
      // Skip check on error (e.g., ps command not available)
      console.log(chalk.green('✅ Skipped (could not verify)\n'));
      return { passed: true };
    }
  };
}

/**
 * Detect all SST-related processes on the system
 *
 * Uses ps command to find:
 * - sst dev --mode=mono
 * - sst ui --filter=*
 * - node processes running SST
 */
async function detectSstProcesses(projectRoot: string): Promise<SstProcess[]> {
  try {
    // Use ps to find SST processes
    // -o: output format (pid,lstart,command)
    // -A: all processes
    const psOutput = execSync(
      'ps -A -o pid,lstart,command | grep -E "sst (dev|ui)" | grep -v grep',
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    if (!psOutput.trim()) {
      return [];
    }

    const processes: SstProcess[] = [];
    const lines = psOutput.trim().split('\n');

    for (const line of lines) {
      // Parse ps output: PID LSTART                    COMMAND
      // Example: 43308 Fri Nov  1 10:12:00 2024  sst dev --mode=mono
      const match = line.trim().match(/^(\d+)\s+(.{24})\s+(.+)$/);
      if (match) {
        const [, pid, startTime, command] = match;
        processes.push({
          pid: parseInt(pid, 10),
          command: command.trim(),
          startTime: startTime.trim(),
          workingDir: 'unknown', // ps doesn't show cwd easily
        });
      }
    }

    return processes;
  } catch (error) {
    // grep returns exit code 1 if no matches found
    // This is expected when no SST processes are running
    return [];
  }
}
