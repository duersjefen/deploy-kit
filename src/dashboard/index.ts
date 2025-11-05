/**
 * Dashboard Module Main Entry Point
 * Provides simple API for starting/stopping the dashboard
 */

export { DashboardServer } from './server.js';
export { DashboardEventEmitter, getEventEmitter, resetEventEmitter } from './event-emitter.js';
export { DashboardWebSocketServer } from './websocket.js';

// Re-export core types
export type {
  DashboardEvent,
  CheckStartEvent,
  CheckCompleteEvent,
  CheckProgressEvent,
  ChecksSummaryEvent,
  SstStartingEvent,
  SstReadyEvent,
  SstOutputEvent,
  SstErrorEvent,
  DashboardReadyEvent,
} from '../data/dashboard/event-schemas.js';

export type {
  DashboardState,
  CheckState,
  SstState,
} from '../data/dashboard/dashboard-state.js';

// Re-export event transformers for use in dev command
export * from '../data/dashboard/event-transformers.js';
