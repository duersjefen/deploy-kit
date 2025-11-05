/**
 * Dashboard Event Emitter (Imperative Shell - I/O)
 * Central event bus for dashboard communication
 *
 * This is the I/O layer that coordinates event distribution.
 * Uses Node.js EventEmitter for pub/sub pattern.
 */

import { EventEmitter } from 'events';
import type { DashboardEvent } from '../data/dashboard/event-schemas.js';
import { validateEvent } from '../data/dashboard/event-schemas.js';

/**
 * Type-safe event emitter for dashboard events
 */
export class DashboardEventEmitter extends EventEmitter {
  /**
   * Emit a dashboard event (with validation)
   */
  emitEvent(event: DashboardEvent): void {
    try {
      // Validate event before emitting
      const validatedEvent = validateEvent(event);
      this.emit('dashboard:event', validatedEvent);

      // Also emit type-specific events for easier filtering
      this.emit(validatedEvent.type, validatedEvent);
    } catch (error) {
      console.error('Invalid dashboard event:', error);
      // Don't throw - just log and skip invalid events
    }
  }

  /**
   * Subscribe to all dashboard events
   */
  onEvent(listener: (event: DashboardEvent) => void): void {
    this.on('dashboard:event', listener);
  }

  /**
   * Subscribe to specific event type
   */
  onEventType<T extends DashboardEvent['type']>(
    type: T,
    listener: (event: Extract<DashboardEvent, { type: T }>) => void
  ): void {
    this.on(type, listener);
  }

  /**
   * Remove event listener
   */
  offEvent(listener: (event: DashboardEvent) => void): void {
    this.off('dashboard:event', listener);
  }

  /**
   * Remove all listeners (cleanup)
   */
  removeAllListeners(): this {
    return super.removeAllListeners();
  }
}

/**
 * Singleton instance for global event bus
 */
let globalEmitter: DashboardEventEmitter | null = null;

/**
 * Get or create global event emitter
 */
export function getEventEmitter(): DashboardEventEmitter {
  if (!globalEmitter) {
    globalEmitter = new DashboardEventEmitter();
    globalEmitter.setMaxListeners(50); // Increase for multiple WebSocket clients
  }
  return globalEmitter;
}

/**
 * Reset global emitter (for testing)
 */
export function resetEventEmitter(): void {
  if (globalEmitter) {
    globalEmitter.removeAllListeners();
  }
  globalEmitter = null;
}
