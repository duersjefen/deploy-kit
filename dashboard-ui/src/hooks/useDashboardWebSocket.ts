/**
 * WebSocket Hook for Dashboard
 * Manages real-time event streaming from backend
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashboardEvent, DashboardState, WsMessage } from '../lib/types';

interface UseDashboardWebSocketResult {
  state: DashboardState;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

/**
 * Initial dashboard state
 */
const initialState: DashboardState = {
  checks: [],
  checksSummary: null,
  sst: {
    status: 'idle',
    urls: {},
    outputLines: [],
  },
  events: [],
};

/**
 * Apply event to state (pure function, mirrors backend logic)
 */
function applyEvent(state: DashboardState, event: DashboardEvent): DashboardState {
  // Add event to history
  const newState: DashboardState = {
    ...state,
    events: [...state.events, event],
  };

  switch (event.type) {
    case 'check:start': {
      const existingCheck = newState.checks.find((c) => c.name === event.checkName);
      if (existingCheck) {
        return {
          ...newState,
          checks: newState.checks.map((c) =>
            c.name === event.checkName
              ? { ...c, status: 'running' as const, startTime: event.timestamp }
              : c
          ),
        };
      }
      return {
        ...newState,
        checks: [
          ...newState.checks,
          {
            name: event.checkName,
            status: 'running',
            startTime: event.timestamp,
          },
        ],
      };
    }

    case 'check:complete':
      return {
        ...newState,
        checks: newState.checks.map((c) =>
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

    case 'checks:summary':
      return {
        ...newState,
        checksSummary: {
          total: event.total,
          passed: event.passed,
          failed: event.failed,
          autoFixed: event.autoFixed,
          totalDuration: event.totalDuration,
        },
      };

    case 'sst:starting':
      return {
        ...newState,
        sst: {
          ...newState.sst,
          status: 'starting',
          port: event.port,
        },
      };

    case 'sst:ready':
      return {
        ...newState,
        sst: {
          ...newState.sst,
          status: 'ready',
          urls: {
            ...newState.sst.urls,
            ...event.urls,
          },
        },
      };

    case 'sst:output': {
      const outputLines = [
        ...newState.sst.outputLines,
        {
          line: event.line,
          level: event.level,
          timestamp: event.timestamp,
        },
      ].slice(-1000); // Keep last 1000 lines

      return {
        ...newState,
        sst: {
          ...newState.sst,
          outputLines,
        },
      };
    }

    case 'sst:error':
      return {
        ...newState,
        sst: {
          ...newState.sst,
          status: 'error',
          errorMessage: event.error,
        },
      };

    case 'dashboard:ready':
      return {
        ...newState,
        dashboardUrl: event.url,
      };

    default:
      return newState;
  }
}

/**
 * Custom hook for WebSocket connection to dashboard backend
 */
export function useDashboardWebSocket(url: string = 'ws://localhost:5173/ws'): UseDashboardWebSocketResult {
  const [state, setState] = useState<DashboardState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message: WsMessage = JSON.parse(event.data);

          if (message.type === 'event') {
            setState((prevState) => applyEvent(prevState, message.event));
          } else if (message.type === 'state') {
            // Replace entire state with the one from server (on reconnection)
            console.log('Received state from server:', message.state);
            setState(message.state);
          } else if (message.type === 'connection') {
            console.log('Connection acknowledged:', message.status);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);

        // Auto-reconnect after 3 seconds (unless manually closed)
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [url]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setState(initialState);
    connect();
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    state,
    isConnected,
    error,
    reconnect,
  };
}
