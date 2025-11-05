/**
 * Event Transformers (Pure Functions - No I/O)
 * Convert domain objects (CheckResult, etc.) to dashboard events
 *
 * These are pure functions that take input and return events.
 * No side effects, no I/O, fully testable.
 */

import { randomUUID } from 'crypto';
import type { CheckResult } from '../../cli/dev-checks/types.js';
import type {
  CheckStartEvent,
  CheckCompleteEvent,
  CheckProgressEvent,
  ChecksSummaryEvent,
  SstStartingEvent,
  SstReadyEvent,
  SstOutputEvent,
  SstErrorEvent,
  DashboardReadyEvent,
} from './event-schemas.js';

/**
 * Pure function to create check start event
 */
export function createCheckStartEvent(checkName: string): CheckStartEvent {
  return {
    type: 'check:start',
    id: randomUUID(),
    timestamp: Date.now(),
    checkName,
  };
}

/**
 * Pure function to create check complete event
 */
export function createCheckCompleteEvent(
  checkName: string,
  result: CheckResult,
  duration: number,
  autoFixed: boolean = false
): CheckCompleteEvent {
  return {
    type: 'check:complete',
    id: randomUUID(),
    timestamp: Date.now(),
    checkName,
    passed: result.passed,
    duration,
    issue: result.issue,
    manualFix: result.manualFix,
    autoFixed,
  };
}

/**
 * Pure function to create check progress event
 */
export function createCheckProgressEvent(
  checkName: string,
  message: string
): CheckProgressEvent {
  return {
    type: 'check:progress',
    id: randomUUID(),
    timestamp: Date.now(),
    checkName,
    message,
  };
}

/**
 * Pure function to create checks summary event
 */
export function createChecksSummaryEvent(
  total: number,
  passed: number,
  failed: number,
  autoFixed: number,
  totalDuration: number
): ChecksSummaryEvent {
  return {
    type: 'checks:summary',
    id: randomUUID(),
    timestamp: Date.now(),
    total,
    passed,
    failed,
    autoFixed,
    totalDuration,
  };
}

/**
 * Pure function to create SST starting event
 */
export function createSstStartingEvent(
  command: string,
  port?: number
): SstStartingEvent {
  return {
    type: 'sst:starting',
    id: randomUUID(),
    timestamp: Date.now(),
    port,
    command,
  };
}

/**
 * Pure function to create SST ready event
 */
export function createSstReadyEvent(urls: {
  console?: string;
  frontend?: string;
}): SstReadyEvent {
  return {
    type: 'sst:ready',
    id: randomUUID(),
    timestamp: Date.now(),
    urls,
  };
}

/**
 * Pure function to create SST output event
 */
export function createSstOutputEvent(
  line: string,
  level: 'info' | 'warn' | 'error' | 'debug' = 'info'
): SstOutputEvent {
  return {
    type: 'sst:output',
    id: randomUUID(),
    timestamp: Date.now(),
    line,
    level,
  };
}

/**
 * Pure function to create SST error event
 */
export function createSstErrorEvent(
  error: string,
  code?: number,
  recoverable: boolean = false
): SstErrorEvent {
  return {
    type: 'sst:error',
    id: randomUUID(),
    timestamp: Date.now(),
    error,
    code,
    recoverable,
  };
}

/**
 * Pure function to create dashboard ready event
 */
export function createDashboardReadyEvent(
  url: string,
  port: number
): DashboardReadyEvent {
  return {
    type: 'dashboard:ready',
    id: randomUUID(),
    timestamp: Date.now(),
    url,
    port,
  };
}

/**
 * Pure function to parse SST output and detect URLs
 * Returns extracted URLs or null if not found
 */
export function parsesstOutput(line: string): {
  console?: string;
  frontend?: string;
} | null {
  const urls: { console?: string; frontend?: string } = {};

  // SST Console URL pattern: https://console.sst.dev/...
  const consoleMatch = line.match(/https:\/\/console\.sst\.dev\/[^\s]+/);
  if (consoleMatch) {
    urls.console = consoleMatch[0];
  }

  // Frontend URL pattern: http://localhost:3000 or similar
  const frontendMatch = line.match(/http:\/\/localhost:\d+/);
  if (frontendMatch) {
    urls.frontend = frontendMatch[0];
  }

  return Object.keys(urls).length > 0 ? urls : null;
}

/**
 * Pure function to infer log level from SST output line
 */
export function inferLogLevel(line: string): 'info' | 'warn' | 'error' | 'debug' {
  const lower = line.toLowerCase();

  if (lower.includes('error') || lower.includes('fail')) {
    return 'error';
  }

  if (lower.includes('warn') || lower.includes('warning')) {
    return 'warn';
  }

  if (lower.includes('debug') || lower.includes('verbose')) {
    return 'debug';
  }

  return 'info';
}
