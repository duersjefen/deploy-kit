/**
 * Dashboard Event Schemas (Pure - No I/O)
 * Type-safe event definitions using Zod for runtime validation
 *
 * These schemas define the contract between the CLI and dashboard UI.
 * All events follow a consistent structure with type discrimination.
 */

import { z } from 'zod';

/**
 * Base event schema - all events extend this
 */
const BaseEventSchema = z.object({
  type: z.string(),
  timestamp: z.number(),
  id: z.string().uuid(),
});

/**
 * Check lifecycle events
 */
export const CheckStartEventSchema = BaseEventSchema.extend({
  type: z.literal('check:start'),
  checkName: z.string(),
});

export const CheckCompleteEventSchema = BaseEventSchema.extend({
  type: z.literal('check:complete'),
  checkName: z.string(),
  passed: z.boolean(),
  duration: z.number(), // milliseconds
  issue: z.string().optional(),
  manualFix: z.string().optional(),
  autoFixed: z.boolean().optional(),
});

export const CheckProgressEventSchema = BaseEventSchema.extend({
  type: z.literal('check:progress'),
  checkName: z.string(),
  message: z.string(),
});

/**
 * Checks summary event
 */
export const ChecksSummaryEventSchema = BaseEventSchema.extend({
  type: z.literal('checks:summary'),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  autoFixed: z.number(),
  totalDuration: z.number(),
});

/**
 * SST dev server lifecycle events
 */
export const SstStartingEventSchema = BaseEventSchema.extend({
  type: z.literal('sst:starting'),
  port: z.number().optional(),
  command: z.string(),
});

export const SstReadyEventSchema = BaseEventSchema.extend({
  type: z.literal('sst:ready'),
  urls: z.object({
    console: z.string().url().optional(),
    frontend: z.string().url().optional(),
  }),
});

export const SstOutputEventSchema = BaseEventSchema.extend({
  type: z.literal('sst:output'),
  line: z.string(),
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
});

export const SstErrorEventSchema = BaseEventSchema.extend({
  type: z.literal('sst:error'),
  error: z.string(),
  code: z.number().optional(),
  recoverable: z.boolean().default(false),
});

/**
 * Dashboard server events
 */
export const DashboardReadyEventSchema = BaseEventSchema.extend({
  type: z.literal('dashboard:ready'),
  url: z.string().url(),
  port: z.number(),
});

/**
 * Resource discovery events (future phase 2)
 */
export const ResourceDiscoveredEventSchema = BaseEventSchema.extend({
  type: z.literal('resource:discovered'),
  resourceType: z.enum(['Lambda', 'S3', 'DynamoDB', 'CloudFront', 'API']),
  name: z.string(),
  arn: z.string().optional(),
  region: z.string().optional(),
  consoleUrl: z.string().url().optional(),
});

/**
 * Union of all event schemas
 */
export const DashboardEventSchema = z.discriminatedUnion('type', [
  CheckStartEventSchema,
  CheckCompleteEventSchema,
  CheckProgressEventSchema,
  ChecksSummaryEventSchema,
  SstStartingEventSchema,
  SstReadyEventSchema,
  SstOutputEventSchema,
  SstErrorEventSchema,
  DashboardReadyEventSchema,
  ResourceDiscoveredEventSchema,
]);

/**
 * TypeScript types inferred from schemas
 */
export type CheckStartEvent = z.infer<typeof CheckStartEventSchema>;
export type CheckCompleteEvent = z.infer<typeof CheckCompleteEventSchema>;
export type CheckProgressEvent = z.infer<typeof CheckProgressEventSchema>;
export type ChecksSummaryEvent = z.infer<typeof ChecksSummaryEventSchema>;
export type SstStartingEvent = z.infer<typeof SstStartingEventSchema>;
export type SstReadyEvent = z.infer<typeof SstReadyEventSchema>;
export type SstOutputEvent = z.infer<typeof SstOutputEventSchema>;
export type SstErrorEvent = z.infer<typeof SstErrorEventSchema>;
export type DashboardReadyEvent = z.infer<typeof DashboardReadyEventSchema>;
export type ResourceDiscoveredEvent = z.infer<typeof ResourceDiscoveredEventSchema>;

export type DashboardEvent = z.infer<typeof DashboardEventSchema>;

/**
 * Event validation helper (pure function)
 * @param event - Raw event object to validate
 * @returns Validated event or throws ZodError
 */
export function validateEvent(event: unknown): DashboardEvent {
  return DashboardEventSchema.parse(event);
}

/**
 * Type guard for event discrimination (pure function)
 */
export function isCheckStartEvent(event: DashboardEvent): event is CheckStartEvent {
  return event.type === 'check:start';
}

export function isCheckCompleteEvent(event: DashboardEvent): event is CheckCompleteEvent {
  return event.type === 'check:complete';
}

export function isSstReadyEvent(event: DashboardEvent): event is SstReadyEvent {
  return event.type === 'sst:ready';
}

export function isSstErrorEvent(event: DashboardEvent): event is SstErrorEvent {
  return event.type === 'sst:error';
}

export function isDashboardReadyEvent(event: DashboardEvent): event is DashboardReadyEvent {
  return event.type === 'dashboard:ready';
}
