/**
 * Dashboard HTTP Server (Imperative Shell - I/O)
 * Serves static dashboard UI and provides REST API for historical data
 *
 * This is the main server that:
 * 1. Serves the Vite-built dashboard UI
 * 2. Provides WebSocket endpoint for real-time events
 * 3. Provides REST API for dashboard state
 */

import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { DashboardEvent } from '../data/dashboard/event-schemas.js';
import {
  createInitialState,
  applyEvent,
  type DashboardState,
} from '../data/dashboard/dashboard-state.js';
import { DashboardWebSocketServer } from './websocket.js';
import { getEventEmitter } from './event-emitter.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * MIME types for static file serving
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Dashboard server configuration
 */
export interface DashboardServerOptions {
  port?: number;
  host?: string;
  uiDistPath?: string; // Path to built UI (default: dashboard-ui/dist)
}

/**
 * Dashboard HTTP server
 */
export class DashboardServer {
  private httpServer: HttpServer | null = null;
  private wsServer: DashboardWebSocketServer | null = null;
  private state: DashboardState = createInitialState();
  private options: Required<DashboardServerOptions>;
  private eventListener: ((event: DashboardEvent) => void) | null = null;

  constructor(options: DashboardServerOptions = {}) {
    this.options = {
      port: options.port || 5173,
      host: options.host || 'localhost',
      uiDistPath: options.uiDistPath || join(__dirname, '../../dashboard-ui/dist'),
    };
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<{ url: string; port: number }> {
    // Check if UI is built
    if (!existsSync(this.options.uiDistPath)) {
      throw new Error(
        chalk.red('Dashboard UI not found!\n') +
        chalk.yellow(`Expected location: ${this.options.uiDistPath}\n\n`) +
        chalk.gray('The dashboard UI needs to be built. If you installed deploy-kit from npm,\n') +
        chalk.gray('this is a package issue. Please report it.\n\n') +
        chalk.gray('If you\'re developing deploy-kit, run: pnpm build')
      );
    }

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    // Set up WebSocket server
    this.wsServer = new DashboardWebSocketServer(this.httpServer);

    // Subscribe to events and update state
    this.setupStateManagement();

    // Start listening
    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.options.port, this.options.host, () => {
        const url = `http://${this.options.host}:${this.options.port}`;
        console.log(chalk.bold.green(`\n📊 Dashboard ready: ${url}\n`));
        resolve({ url, port: this.options.port });
      });

      this.httpServer!.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.options.port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Set up state management (listen to events and update state)
   */
  private setupStateManagement(): void {
    const emitter = getEventEmitter();

    this.eventListener = (event: DashboardEvent) => {
      // Apply event to state (pure function)
      this.state = applyEvent(this.state, event);
    };

    emitter.onEvent(this.eventListener);
  }

  /**
   * Handle HTTP requests
   */
  private handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    const url = req.url || '/';

    // API endpoints
    if (url.startsWith('/api/')) {
      this.handleApiRequest(url, req, res);
      return;
    }

    // Static file serving
    this.serveStaticFile(url, res);
  }

  /**
   * Handle API requests
   */
  private handleApiRequest(
    url: string,
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    // Enable CORS for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (url === '/api/state') {
      // Return current dashboard state
      res.statusCode = 200;
      res.end(JSON.stringify(this.state));
      return;
    }

    if (url === '/api/health') {
      // Health check endpoint
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok', clients: this.wsServer?.getClientCount() || 0 }));
      return;
    }

    // 404 for unknown API endpoints
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Serve static files from UI dist directory
   */
  private serveStaticFile(url: string, res: ServerResponse): void {
    // Default to index.html for root and client-side routes
    let filePath = url === '/' ? '/index.html' : url;

    // Remove query strings
    filePath = filePath.split('?')[0];

    const fullPath = join(this.options.uiDistPath, filePath);

    // Security: Prevent directory traversal
    if (!fullPath.startsWith(this.options.uiDistPath)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      // For SPA routing, serve index.html for non-API routes
      if (!url.startsWith('/api/')) {
        const indexPath = join(this.options.uiDistPath, 'index.html');
        if (existsSync(indexPath)) {
          this.sendFile(indexPath, res, '.html');
          return;
        }
      }

      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    // Serve the file
    this.sendFile(fullPath, res, extname(fullPath));
  }

  /**
   * Send file with appropriate MIME type
   */
  private sendFile(filePath: string, res: ServerResponse, ext: string): void {
    try {
      const content = readFileSync(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.end(content);
    } catch (error) {
      console.error(chalk.red(`Error serving file ${filePath}:`), error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    // Remove event listener
    if (this.eventListener) {
      const emitter = getEventEmitter();
      emitter.offEvent(this.eventListener);
      this.eventListener = null;
    }

    // Close WebSocket server
    if (this.wsServer) {
      await this.wsServer.close();
      this.wsServer = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close((error) => {
          if (error) {
            reject(error);
          } else {
            this.httpServer = null;
            resolve();
          }
        });
      });
    }
  }

  /**
   * Get current state (for testing)
   */
  getState(): DashboardState {
    return this.state;
  }
}
