/**
 * Dashboard Types
 * Mirrors backend event schemas for type safety
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
  events: DashboardEvent[];
}

/**
 * Dashboard Events
 */
interface BaseEvent {
  type: string;
  timestamp: number;
  id: string;
}

export interface CheckStartEvent extends BaseEvent {
  type: 'check:start';
  checkName: string;
}

export interface CheckCompleteEvent extends BaseEvent {
  type: 'check:complete';
  checkName: string;
  passed: boolean;
  duration: number;
  issue?: string;
  manualFix?: string;
  autoFixed?: boolean;
}

export interface CheckProgressEvent extends BaseEvent {
  type: 'check:progress';
  checkName: string;
  message: string;
}

export interface ChecksSummaryEvent extends BaseEvent {
  type: 'checks:summary';
  total: number;
  passed: number;
  failed: number;
  autoFixed: number;
  totalDuration: number;
}

export interface SstStartingEvent extends BaseEvent {
  type: 'sst:starting';
  port?: number;
  command: string;
}

export interface SstReadyEvent extends BaseEvent {
  type: 'sst:ready';
  urls: {
    console?: string;
    frontend?: string;
  };
}

export interface SstOutputEvent extends BaseEvent {
  type: 'sst:output';
  line: string;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export interface SstErrorEvent extends BaseEvent {
  type: 'sst:error';
  error: string;
  code?: number;
  recoverable: boolean;
}

export interface DashboardReadyEvent extends BaseEvent {
  type: 'dashboard:ready';
  url: string;
  port: number;
}

export interface ResourceDiscoveredEvent extends BaseEvent {
  type: 'resource:discovered';
  resourceType: 'Lambda' | 'S3' | 'DynamoDB' | 'CloudFront' | 'API';
  name: string;
  arn?: string;
  region?: string;
  consoleUrl?: string;
}

export type DashboardEvent =
  | CheckStartEvent
  | CheckCompleteEvent
  | CheckProgressEvent
  | ChecksSummaryEvent
  | SstStartingEvent
  | SstReadyEvent
  | SstOutputEvent
  | SstErrorEvent
  | DashboardReadyEvent
  | ResourceDiscoveredEvent;

/**
 * WebSocket message types
 */
export interface WsEventMessage {
  type: 'event';
  event: DashboardEvent;
}

export interface WsConnectionMessage {
  type: 'connection';
  status: 'connected';
  timestamp: number;
}

export interface WsStateMessage {
  type: 'state';
  state: DashboardState;
}

export type WsMessage = WsEventMessage | WsConnectionMessage | WsStateMessage;
