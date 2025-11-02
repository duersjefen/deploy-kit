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
 * Detect SST-related processes in the current project only
 *
 * Uses ps command to find SST processes, then filters by working directory
 * to avoid killing SST processes from other projects (multi-worktree support).
 *
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
        const workingDir = getProcessWorkingDirectory(parseInt(pid, 10));

        // Only include processes running in the current project
        if (workingDir && workingDir.startsWith(projectRoot)) {
          processes.push({
            pid: parseInt(pid, 10),
            command: command.trim(),
            startTime: startTime.trim(),
            workingDir,
          });
        }
      }
    }

    return processes;
  } catch (error) {
    // grep returns exit code 1 if no matches found
    // This is expected when no SST processes are running
    return [];
  }
}

/**
 * Get the working directory of a process by PID
 *
 * Uses lsof to find the current working directory (cwd) of a process.
 * This is more reliable than ps on macOS which doesn't have a cwd output format.
 *
 * @param pid - Process ID
 * @returns Working directory path or null if not found
 */
function getProcessWorkingDirectory(pid: number): string | null {
  try {
    // Use lsof to get the cwd of the process
    // -p PID: filter by process ID
    // -a: AND the following filters
    // -d cwd: only show current working directory
    // -Fn: output format (file name only, no header)
    const lsofOutput = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // lsof -Fn output format:
    // p<PID>
    // n<path>
    // We want the line starting with 'n'
    const lines = lsofOutput.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('n')) {
        return line.substring(1); // Remove 'n' prefix
      }
    }

    return null;
  } catch (error) {
    // Process may have exited or lsof failed
    return null;
  }
}
