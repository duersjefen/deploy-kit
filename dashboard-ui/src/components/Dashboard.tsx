/**
 * Dashboard Component
 * Main dashboard layout with real-time updates and Phase 2 features
 */

import { useState } from 'react';
import { Wifi, WifiOff, LayoutDashboard, FileText, Clock, Boxes, ExternalLink } from 'lucide-react';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';
import { ChecksView } from './ChecksView';
import { SstStatusView } from './SstStatusView';
import { LogViewer } from './LogViewer';
import { DeploymentTimeline } from './DeploymentTimeline';
import { ResourceExplorer } from './ResourceExplorer';
import { ExportButton } from './ExportButton';

type TabView = 'overview' | 'logs' | 'timeline' | 'resources';

export function Dashboard() {
  const { state, isConnected, error } = useDashboardWebSocket();
  const [activeTab, setActiveTab] = useState<TabView>('overview');

  const tabs = [
    { id: 'overview' as TabView, label: 'Overview', icon: LayoutDashboard },
    { id: 'logs' as TabView, label: 'Logs', icon: FileText },
    { id: 'timeline' as TabView, label: 'Timeline', icon: Clock },
    { id: 'resources' as TabView, label: 'Resources', icon: Boxes },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Deploy-Kit Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time development environment monitoring • Phase 2
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <ExportButton state={state} />

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

          {/* Tabs */}
          <div className="flex items-center space-x-2 mt-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-sm text-destructive">
              <strong>Connection Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Big CTA button for dev server */}
            {state.sst.status === 'ready' && state.sst.urls.frontend && (
              <a
                href={state.sst.urls.frontend}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center space-x-3 p-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-lg shadow-lg transition-all hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="text-xl font-bold">Open Your Application</span>
                <ExternalLink className="h-6 w-6" />
              </a>
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

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-3xl font-bold text-foreground mt-1">{state.events.length}</p>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Checks Run</p>
                <p className="text-3xl font-bold text-foreground mt-1">{state.checks.length}</p>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Log Entries</p>
                <p className="text-3xl font-bold text-foreground mt-1">
                  {state.sst.outputLines.length}
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">SST Status</p>
                <p className="text-3xl font-bold text-foreground mt-1 capitalize">
                  {state.sst.status}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && <LogViewer sst={state.sst} />}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && <DeploymentTimeline events={state.events} />}

        {/* Resources Tab */}
        {activeTab === 'resources' && <ResourceExplorer />}

        {/* Event Stream Debug (optional, for development) */}
        {import.meta.env.DEV && state.events.length > 0 && activeTab === 'overview' && (
          <div className="mt-6">
            <details className="bg-card border border-border rounded-lg">
              <summary className="p-4 cursor-pointer font-medium text-foreground hover:bg-muted/50 transition-colors">
                Event Stream Debug ({state.events.length} events)
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
      <footer className="border-t border-border">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-muted-foreground">
            Deploy-Kit v2.10.0 • Development Dashboard • Phase 2
          </p>
        </div>
      </footer>
    </div>
  );
}
