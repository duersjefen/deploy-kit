/**
 * SST Process Manager (Imperative Shell - I/O)
 * Manages SST dev process lifecycle with dashboard integration
 *
 * This class:
 * 1. Spawns SST dev process with output capture
 * 2. Parses output using pure functions
 * 3. Emits dashboard events
 * 4. Passes output through to terminal (preserves user experience)
 */

import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import { getEventEmitter, type DashboardEventEmitter } from '../../dashboard/event-emitter.js';
import {
  createSstStartingEvent,
  createSstReadyEvent,
  createSstOutputEvent,
  createSstErrorEvent,
} from '../../dashboard/index.js';
import {
  parseSstLine,
  stripAnsiCodes,
  detectSstVersion,
  isIonMode,
  type ParsedSstLine,
} from '../../data/dashboard/sst-output-parser.js';

/**
 * Configuration options for SST process
 */
export interface SstProcessOptions {
  projectRoot: string;
  command: string;
  port?: number;
  env?: Record<string, string | undefined>;
  verbose?: boolean;
}

/**
 * SST Process Manager
 * Handles process lifecycle and event emission
 */
export class SstProcessManager {
  private process: ChildProcess | null = null;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';
  private emitter: DashboardEventEmitter;
  private state: 'idle' | 'starting' | 'building' | 'ready' | 'error' = 'idle';
  private detectedVersion: string | null = null;
  private ionMode: boolean = false;
  private urlsDetected: Set<string> = new Set();
  private eventCount: number = 0;
  private lastEventTime: number = 0;

  // Event throttling (max 100 log events per second)
  private readonly MAX_EVENTS_PER_SECOND = 100;
  private readonly EVENT_WINDOW_MS = 1000;

  constructor(private options: SstProcessOptions) {
    this.emitter = getEventEmitter();
  }

  /**
   * Start the SST process
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('SST process already running');
    }

    // Emit starting event
    this.state = 'starting';
    this.emitter.emitEvent(
      createSstStartingEvent(this.options.command, this.options.port)
    );

    // Spawn SST process with piped output
    this.process = spawn(this.options.command, {
      stdio: ['inherit', 'pipe', 'pipe'], // stdin: inherit, stdout/stderr: pipe
      shell: true,
      cwd: this.options.projectRoot,
      env: {
        ...process.env,
        ...this.options.env,
      },
    });

    // Handle stdout
    if (this.process.stdout) {
      this.process.stdout.on('data', (chunk: Buffer) => {
        this.handleOutput(chunk, false);
      });
    }

    // Handle stderr
    if (this.process.stderr) {
      this.process.stderr.on('data', (chunk: Buffer) => {
        this.handleOutput(chunk, true);
      });
    }

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      if (this.options.verbose) {
        console.log(chalk.gray(`\nSST process exited: code=${code}, signal=${signal}`));
      }

      if (code !== 0 && code !== null) {
        this.state = 'error';
        this.emitter.emitEvent(
          createSstErrorEvent(
            `SST dev exited with code ${code}`,
            code,
            false
          )
        );
      }
    });

    // Handle process errors
    this.process.on('error', (error: Error) => {
      console.error(chalk.red('\n❌ SST process error:'), error);
      this.state = 'error';
      this.emitter.emitEvent(
        createSstErrorEvent(
          error.message,
          undefined,
          false
        )
      );
    });

    // Set up graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Handle output from stdout/stderr
   */
  private handleOutput(chunk: Buffer, isError: boolean): void {
    // Add to appropriate buffer
    const bufferKey = isError ? 'stderrBuffer' : 'stdoutBuffer';
    this[bufferKey] += chunk.toString();

    // Process complete lines
    const lines = this[bufferKey].split('\n');
    this[bufferKey] = lines.pop() || ''; // Keep incomplete line in buffer

    for (const rawLine of lines) {
      // Always write to terminal (preserve user experience)
      if (isError) {
        process.stderr.write(rawLine + '\n');
      } else {
        process.stdout.write(rawLine + '\n');
      }

      // Process line for dashboard
      this.processLine(rawLine, isError);
    }
  }

  /**
   * Process a single line of output
   */
  private processLine(rawLine: string, isError: boolean): void {
    // Parse the line
    const parsed = parseSstLine(rawLine);

    // Detect SST version early
    if (!this.detectedVersion) {
      const cleanLine = stripAnsiCodes(rawLine);
      const version = detectSstVersion(cleanLine);
      if (version) {
        this.detectedVersion = version;
        if (this.options.verbose) {
          console.log(chalk.gray(`Detected SST version: ${version}`));
        }
      }

      // Detect Ion mode
      if (isIonMode(cleanLine)) {
        this.ionMode = true;
        if (this.options.verbose) {
          console.log(chalk.gray('Detected SST Ion mode'));
        }
      }
    }

    // Handle parsed result
    switch (parsed.type) {
      case 'state-change':
        this.handleStateChange(parsed);
        break;

      case 'url':
        this.handleUrlDetection(parsed);
        break;

      case 'error':
        this.handleError(parsed);
        break;

      case 'log':
        this.handleLog(parsed);
        break;

      case 'noise':
        // Ignore noise (already filtered)
        break;
    }
  }

  /**
   * Handle state change events
   */
  private handleStateChange(parsed: ParsedSstLine): void {
    if (parsed.data.state) {
      this.state = parsed.data.state;

      if (this.options.verbose) {
        console.log(chalk.gray(`SST state: ${this.state}`));
      }
    }
  }

  /**
   * Handle URL detection
   */
  private handleUrlDetection(parsed: ParsedSstLine): void {
    if (!parsed.data.urls) return;

    const { console: consoleUrl, frontend: frontendUrl } = parsed.data.urls;

    // Track detected URLs to avoid duplicates
    const newUrls: { console?: string; frontend?: string } = {};

    if (consoleUrl && !this.urlsDetected.has(consoleUrl)) {
      this.urlsDetected.add(consoleUrl);
      newUrls.console = consoleUrl;
    }

    if (frontendUrl && !this.urlsDetected.has(frontendUrl)) {
      this.urlsDetected.add(frontendUrl);
      newUrls.frontend = frontendUrl;
    }

    // Emit ready event if we have new URLs
    if (Object.keys(newUrls).length > 0) {
      this.state = 'ready';
      this.emitter.emitEvent(createSstReadyEvent(newUrls));

      if (this.options.verbose) {
        console.log(chalk.gray(`Detected URLs: ${JSON.stringify(newUrls)}`));
      }
    }
  }

  /**
   * Handle error detection
   */
  private handleError(parsed: ParsedSstLine): void {
    if (!parsed.data.error) return;

    this.state = 'error';
    const { message, code, recoverable } = parsed.data.error;

    this.emitter.emitEvent(createSstErrorEvent(message, code, recoverable));

    if (this.options.verbose) {
      console.log(chalk.gray(`Error detected: ${message} (recoverable: ${recoverable})`));
    }
  }

  /**
   * Handle log output
   */
  private handleLog(parsed: ParsedSstLine): void {
    if (!parsed.data.log) return;

    // Throttle events to prevent spam
    if (!this.shouldEmitEvent()) {
      return;
    }

    const { line, level } = parsed.data.log;
    this.emitter.emitEvent(createSstOutputEvent(line, level));
  }

  /**
   * Check if we should emit an event (throttling)
   */
  private shouldEmitEvent(): boolean {
    const now = Date.now();

    // Reset counter if window expired
    if (now - this.lastEventTime > this.EVENT_WINDOW_MS) {
      this.eventCount = 0;
      this.lastEventTime = now;
    }

    // Check if we're under the limit
    if (this.eventCount < this.MAX_EVENTS_PER_SECOND) {
      this.eventCount++;
      return true;
    }

    return false;
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const cleanup = () => {
      if (this.options.verbose) {
        console.log(chalk.gray('\n\nGraceful shutdown initiated...'));
      }

      if (this.process && this.process.pid) {
        try {
          process.kill(this.process.pid, 'SIGINT');
        } catch (err) {
          // Process may have already exited
        }
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Wait for process to exit
   */
  async waitForExit(): Promise<number> {
    if (!this.process) {
      throw new Error('SST process not started');
    }

    return new Promise((resolve, reject) => {
      this.process!.on('exit', (code) => {
        resolve(code || 0);
      });

      this.process!.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the SST process
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.process || !this.process.pid) {
        resolve();
        return;
      }

      this.process.once('exit', () => {
        this.process = null;
        resolve();
      });

      try {
        process.kill(this.process.pid, 'SIGTERM');
      } catch (err) {
        // Process may have already exited
        resolve();
      }

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && this.process.pid) {
          try {
            process.kill(this.process.pid, 'SIGKILL');
          } catch (err) {
            // Ignore
          }
        }
        resolve();
      }, 5000);
    });
  }

  /**
   * Get current state
   */
  getState(): 'idle' | 'starting' | 'building' | 'ready' | 'error' {
    return this.state;
  }

  /**
   * Get detected SST version
   */
  getVersion(): string | null {
    return this.detectedVersion;
  }

  /**
   * Check if running in Ion mode
   */
  isIonMode(): boolean {
    return this.ionMode;
  }
}
