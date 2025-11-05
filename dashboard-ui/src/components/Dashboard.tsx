/**
 * Dashboard Component
 * Main dashboard layout with real-time updates
 */

import { Wifi, WifiOff } from 'lucide-react';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';
import { ChecksView } from './ChecksView';
import { SstStatusView } from './SstStatusView';

export function Dashboard() {
  const { state, isConnected, error } = useDashboardWebSocket();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Deploy-Kit Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time development environment monitoring
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {isConnected ? (
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-sm">
                  <Wifi className="h-4 w-4" />
                  <span>Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-sm">
                  <WifiOff className="h-4 w-4" />
                  <span>Disconnected</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-sm text-destructive">
              <strong>Connection Error:</strong> {error}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pre-Flight Checks */}
          <div>
            <ChecksView checks={state.checks} summary={state.checksSummary} />
          </div>

          {/* SST Status */}
          <div>
            <SstStatusView sst={state.sst} />
          </div>
        </div>

        {/* Event Stream Debug (optional, for development) */}
        {import.meta.env.DEV && state.events.length > 0 && (
          <div className="mt-6">
            <details className="bg-card border border-border rounded-lg">
              <summary className="p-4 cursor-pointer font-medium text-foreground hover:bg-muted/50 transition-colors">
                Event Stream ({state.events.length} events)
              </summary>
              <div className="p-4 pt-0 max-h-96 overflow-y-auto scrollbar-thin">
                <pre className="text-xs font-mono text-foreground">
                  {JSON.stringify(state.events.slice(-20), null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-muted-foreground">
            Deploy-Kit v2.10.0 • Development Dashboard
          </p>
        </div>
      </footer>
    </div>
  );
}
