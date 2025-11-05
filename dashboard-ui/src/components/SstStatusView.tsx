/**
 * SstStatusView Component
 * Displays SST dev server status and URLs
 */

import { Server, ExternalLink, Loader2, XCircle, CheckCircle2, Circle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import type { SstState } from '../lib/types';

interface SstStatusViewProps {
  sst: SstState;
}

function StatusBadge({ status }: { status: SstState['status'] }) {
  switch (status) {
    case 'ready':
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          <span>Ready</span>
        </div>
      );
    case 'starting':
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Starting...</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-sm font-medium">
          <XCircle className="h-4 w-4" />
          <span>Error</span>
        </div>
      );
    case 'idle':
    default:
      return (
        <div className="flex items-center space-x-2 px-3 py-1 bg-gray-500/10 text-gray-500 rounded-full text-sm font-medium">
          <Circle className="h-4 w-4" />
          <span>Idle</span>
        </div>
      );
  }
}

function UrlLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground font-mono mt-1">{url}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </a>
  );
}

export function SstStatusView({ sst }: SstStatusViewProps) {
  const hasUrls = sst.urls.console || sst.urls.frontend;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Server className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>SST Dev Server</CardTitle>
              <CardDescription>
                {sst.port ? `Running on port ${sst.port}` : 'Development server status'}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={sst.status} />
        </div>
      </CardHeader>

      <CardContent>
        {sst.status === 'idle' && (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>SST dev server not started yet</p>
          </div>
        )}

        {sst.status === 'starting' && (
          <div className="text-center py-8">
            <Loader2 className="h-12 w-12 mx-auto mb-2 text-blue-500 animate-spin" />
            <p className="text-foreground font-medium">Starting SST dev server...</p>
            <p className="text-sm text-muted-foreground mt-1">This may take a few moments</p>
          </div>
        )}

        {sst.status === 'error' && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
            <div className="flex items-start space-x-3">
              <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">SST Dev Error</p>
                <p className="text-sm text-foreground mt-1">{sst.errorMessage || 'Unknown error occurred'}</p>
              </div>
            </div>
          </div>
        )}

        {sst.status === 'ready' && hasUrls && (
          <div className="space-y-3">
            {sst.urls.frontend && (
              <UrlLink url={sst.urls.frontend} label="Frontend Application" />
            )}
            {sst.urls.console && (
              <UrlLink url={sst.urls.console} label="SST Console" />
            )}
          </div>
        )}

        {sst.status === 'ready' && !hasUrls && (
          <div className="text-center py-6">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p className="text-foreground font-medium">SST Dev Server Ready</p>
            <p className="text-sm text-muted-foreground mt-1">Waiting for URLs to be detected</p>
          </div>
        )}

        {/* Output logs preview */}
        {sst.outputLines.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-foreground">Recent Output</h4>
              <span className="text-xs text-muted-foreground">
                Last {Math.min(sst.outputLines.length, 10)} lines
              </span>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto scrollbar-thin font-mono text-xs">
              {sst.outputLines.slice(-10).map((output, index) => (
                <div
                  key={index}
                  className={`py-1 ${
                    output.level === 'error'
                      ? 'text-red-500'
                      : output.level === 'warn'
                      ? 'text-yellow-500'
                      : 'text-foreground'
                  }`}
                >
                  {output.line}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
