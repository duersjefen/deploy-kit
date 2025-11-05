/**
 * Dashboard WebSocket Server (Imperative Shell - I/O)
 * Real-time event streaming to dashboard UI
 *
 * Broadcasts dashboard events to all connected WebSocket clients.
 * Handles client connections, disconnections, and message broadcasting.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { DashboardEvent } from '../data/dashboard/event-schemas.js';
import type { DashboardState } from '../data/dashboard/dashboard-state.js';
import { getEventEmitter } from './event-emitter.js';
import chalk from 'chalk';

/**
 * WebSocket message types
 */
interface WsMessage {
  type: 'ping' | 'subscribe' | 'unsubscribe';
}

interface WsEventMessage {
  type: 'event';
  event: DashboardEvent;
}

interface WsStateMessage {
  type: 'state';
  state: DashboardState;
}

/**
 * WebSocket server wrapper
 */
export class DashboardWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private eventListener: ((event: DashboardEvent) => void) | null = null;
  private getState: (() => DashboardState) | null = null;

  constructor(httpServer: HttpServer, getState?: () => DashboardState) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.getState = getState || null;
    this.setupEventBroadcasting();
    this.setupWebSocketHandlers();
  }

  /**
   * Set up event broadcasting from event emitter to WebSocket clients
   */
  private setupEventBroadcasting(): void {
    const emitter = getEventEmitter();

    this.eventListener = (event: DashboardEvent) => {
      this.broadcast(event);
    };

    emitter.onEvent(this.eventListener);
  }

  /**
   * Set up WebSocket connection handlers
   */
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log(chalk.gray('📡 Dashboard client connected'));
      this.clients.add(ws);

      // Send initial connection success message
      this.sendToClient(ws, {
        type: 'connection',
        status: 'connected',
        timestamp: Date.now(),
      });

      // Send current state to the newly connected client
      if (this.getState) {
        const currentState = this.getState();
        const stateMessage: WsStateMessage = {
          type: 'state',
          state: currentState,
        };
        this.sendToClient(ws, stateMessage);
        console.log(chalk.gray('📡 Sent current state to client'));
      }

      // Handle client messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WsMessage;
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error(chalk.yellow('Invalid WebSocket message:'), error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(chalk.gray('📡 Dashboard client disconnected'));
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error(chalk.red('WebSocket error:'), error);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Handle client messages (ping, subscribe, etc.)
   */
  private handleClientMessage(ws: WebSocket, message: WsMessage): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'subscribe':
        // Already subscribed by default, but acknowledge
        this.sendToClient(ws, { type: 'subscribed', timestamp: Date.now() });
        break;

      case 'unsubscribe':
        // Keep connection but stop sending events (future feature)
        this.sendToClient(ws, { type: 'unsubscribed', timestamp: Date.now() });
        break;

      default:
        console.log(chalk.yellow('Unknown WebSocket message type'));
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  private broadcast(event: DashboardEvent): void {
    const message: WsEventMessage = {
      type: 'event',
      event,
    };

    const data = JSON.stringify(message);
    let successCount = 0;
    let failCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
          successCount++;
        } catch (error) {
          console.error(chalk.red('Failed to send to client:'), error);
          failCount++;
          this.clients.delete(client);
        }
      }
    });

    // Log broadcast stats (only for important events, to avoid spam)
    if (event.type === 'checks:summary' || event.type === 'sst:ready' || event.type === 'sst:error') {
      console.log(
        chalk.gray(
          `📡 Broadcast ${event.type} to ${successCount} client(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`
        )
      );
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close WebSocket server and cleanup
   */
  async close(): Promise<void> {
    // Remove event listener
    if (this.eventListener) {
      const emitter = getEventEmitter();
      emitter.offEvent(this.eventListener);
      this.eventListener = null;
    }

    // Close all client connections
    this.clients.forEach((client) => {
      client.close(1000, 'Server shutting down');
    });
    this.clients.clear();

    // Close WebSocket server
    return new Promise((resolve, reject) => {
      this.wss.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
