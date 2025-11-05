/**
 * Dashboard State Management (Pure Functions - No I/O)
 * Manages dashboard state transitions based on events
 *
 * Following functional programming principles:
 * - Immutable state updates
 * - Pure functions (no side effects)
 * - Deterministic (same input → same output)
 */

import type { DashboardEvent } from './event-schemas.js';

/**
 * Individual check state
 */
export interface CheckState {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'auto-fixed';
  duration?: number;
  issue?: string;
  manualFix?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * SST dev server state
 */
export interface SstState {
  status: 'idle' | 'starting' | 'ready' | 'error';
  port?: number;
  urls: {
    console?: string;
    frontend?: string;
  };
  errorMessage?: string;
  outputLines: Array<{
    line: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    timestamp: number;
  }>;
}

/**
 * Dashboard overall state
 */
export interface DashboardState {
  checks: CheckState[];
  checksSummary: {
    total: number;
    passed: number;
    failed: number;
    autoFixed: number;
    totalDuration: number;
  } | null;
  sst: SstState;
  dashboardUrl?: string;
  events: DashboardEvent[]; // Event history
}

/**
 * Initial state (pure)
 */
export function createInitialState(): DashboardState {
  return {
    checks: [],
    checksSummary: null,
    sst: {
      status: 'idle',
      urls: {},
      outputLines: [],
    },
    events: [],
  };
}

/**
 * Pure function to update state based on event
 * Returns new state (immutable update)
 */
export function applyEvent(
  state: DashboardState,
  event: DashboardEvent
): DashboardState {
  // Add event to history (immutable)
  const newState: DashboardState = {
    ...state,
    events: [...state.events, event],
  };

  switch (event.type) {
    case 'check:start':
      return handleCheckStart(newState, event);

    case 'check:complete':
      return handleCheckComplete(newState, event);

    case 'check:progress':
      return handleCheckProgress(newState, event);

    case 'checks:summary':
      return handleChecksSummary(newState, event);

    case 'sst:starting':
      return handleSstStarting(newState, event);

    case 'sst:ready':
      return handleSstReady(newState, event);

    case 'sst:output':
      return handleSstOutput(newState, event);

    case 'sst:error':
      return handleSstError(newState, event);

    case 'dashboard:ready':
      return handleDashboardReady(newState, event);

    case 'resource:discovered':
      // Phase 2: Resource tracking
      return newState;

    default:
      return newState;
  }
}

/**
 * Handle check:start event
 */
function handleCheckStart(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'check:start' }>
): DashboardState {
  const existingCheck = state.checks.find((c) => c.name === event.checkName);

  if (existingCheck) {
    // Update existing check to running
    return {
      ...state,
      checks: state.checks.map((c) =>
        c.name === event.checkName
          ? { ...c, status: 'running' as const, startTime: event.timestamp }
          : c
      ),
    };
  }

  // Add new check
  return {
    ...state,
    checks: [
      ...state.checks,
      {
        name: event.checkName,
        status: 'running',
        startTime: event.timestamp,
      },
    ],
  };
}

/**
 * Handle check:complete event
 */
function handleCheckComplete(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'check:complete' }>
): DashboardState {
  return {
    ...state,
    checks: state.checks.map((c) =>
      c.name === event.checkName
        ? {
            ...c,
            status: event.autoFixed ? 'auto-fixed' : event.passed ? 'passed' : 'failed',
            duration: event.duration,
            issue: event.issue,
            manualFix: event.manualFix,
            endTime: event.timestamp,
          }
        : c
    ),
  };
}

/**
 * Handle check:progress event
 */
function handleCheckProgress(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'check:progress' }>
): DashboardState {
  // Progress events don't modify check state, just logged in events
  return state;
}

/**
 * Handle checks:summary event
 */
function handleChecksSummary(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'checks:summary' }>
): DashboardState {
  return {
    ...state,
    checksSummary: {
      total: event.total,
      passed: event.passed,
      failed: event.failed,
      autoFixed: event.autoFixed,
      totalDuration: event.totalDuration,
    },
  };
}

/**
 * Handle sst:starting event
 */
function handleSstStarting(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'sst:starting' }>
): DashboardState {
  return {
    ...state,
    sst: {
      ...state.sst,
      status: 'starting',
      port: event.port,
    },
  };
}

/**
 * Handle sst:ready event
 */
function handleSstReady(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'sst:ready' }>
): DashboardState {
  return {
    ...state,
    sst: {
      ...state.sst,
      status: 'ready',
      urls: {
        ...state.sst.urls,
        ...event.urls,
      },
    },
  };
}

/**
 * Handle sst:output event
 */
function handleSstOutput(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'sst:output' }>
): DashboardState {
  // Keep last 1000 lines to prevent memory issues
  const outputLines = [
    ...state.sst.outputLines,
    {
      line: event.line,
      level: event.level,
      timestamp: event.timestamp,
    },
  ].slice(-1000);

  return {
    ...state,
    sst: {
      ...state.sst,
      outputLines,
    },
  };
}

/**
 * Handle sst:error event
 */
function handleSstError(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'sst:error' }>
): DashboardState {
  return {
    ...state,
    sst: {
      ...state.sst,
      status: 'error',
      errorMessage: event.error,
    },
  };
}

/**
 * Handle dashboard:ready event
 */
function handleDashboardReady(
  state: DashboardState,
  event: Extract<DashboardEvent, { type: 'dashboard:ready' }>
): DashboardState {
  return {
    ...state,
    dashboardUrl: event.url,
  };
}

/**
 * Pure function to get current overall status
 */
export function getOverallStatus(state: DashboardState): 'idle' | 'checking' | 'ready' | 'error' {
  // If any check is running, we're checking
  if (state.checks.some((c) => c.status === 'running')) {
    return 'checking';
  }

  // If any check failed, we're in error
  if (state.checks.some((c) => c.status === 'failed')) {
    return 'error';
  }

  // If SST is ready, we're ready
  if (state.sst.status === 'ready') {
    return 'ready';
  }

  // If SST has error, we're in error
  if (state.sst.status === 'error') {
    return 'error';
  }

  return 'idle';
}

/**
 * Pure function to get checks progress percentage
 */
export function getChecksProgress(state: DashboardState): number {
  if (state.checks.length === 0) return 0;

  const completed = state.checks.filter(
    (c) => c.status === 'passed' || c.status === 'failed' || c.status === 'auto-fixed'
  ).length;

  return Math.round((completed / state.checks.length) * 100);
}

/**
 * Pure function to filter events by type
 */
export function filterEventsByType<T extends DashboardEvent['type']>(
  state: DashboardState,
  type: T
): Extract<DashboardEvent, { type: T }>[] {
  return state.events.filter((e) => e.type === type) as Extract<DashboardEvent, { type: T }>[];
}
