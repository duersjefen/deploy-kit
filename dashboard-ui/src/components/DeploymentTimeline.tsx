/**
 * DeploymentTimeline Component
 * Visual timeline of deployment events
 */

import { useMemo } from 'react';
import { Clock, CheckCircle2, XCircle, Wrench, Circle, Server } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import { formatTime, formatDuration } from '../lib/utils';
import type { DashboardEvent } from '../lib/types';

interface DeploymentTimelineProps {
  events: DashboardEvent[];
}

interface TimelineItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: number;
  status: 'success' | 'error' | 'info' | 'warning';
  icon: React.ReactNode;
  duration?: number;
}

export function DeploymentTimeline({ events }: DeploymentTimelineProps) {
  // Convert events to timeline items
  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];

    events.forEach((event) => {
      switch (event.type) {
        case 'check:start':
          items.push({
            id: event.id,
            type: 'check:start',
            title: `Check started: ${event.checkName}`,
            timestamp: event.timestamp,
            status: 'info',
            icon: <Circle className="h-4 w-4" />,
          });
          break;

        case 'check:complete':
          items.push({
            id: event.id,
            type: 'check:complete',
            title: `Check ${event.passed ? 'passed' : 'failed'}: ${event.checkName}`,
            description: event.issue || (event.autoFixed ? 'Auto-fixed successfully' : undefined),
            timestamp: event.timestamp,
            status: event.passed ? 'success' : 'error',
            icon: event.autoFixed ? (
              <Wrench className="h-4 w-4" />
            ) : event.passed ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            ),
            duration: event.duration,
          });
          break;

        case 'checks:summary':
          items.push({
            id: event.id,
            type: 'checks:summary',
            title: 'Pre-flight checks completed',
            description: `${event.passed} passed, ${event.failed} failed, ${event.autoFixed} auto-fixed`,
            timestamp: event.timestamp,
            status: event.failed === 0 ? 'success' : 'error',
            icon: event.failed === 0 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            ),
            duration: event.totalDuration,
          });
          break;

        case 'sst:starting':
          items.push({
            id: event.id,
            type: 'sst:starting',
            title: 'SST dev server starting',
            description: event.port ? `Port: ${event.port}` : undefined,
            timestamp: event.timestamp,
            status: 'info',
            icon: <Server className="h-4 w-4" />,
          });
          break;

        case 'sst:ready':
          items.push({
            id: event.id,
            type: 'sst:ready',
            title: 'SST dev server ready',
            description: event.urls.frontend || event.urls.console || 'Server is ready',
            timestamp: event.timestamp,
            status: 'success',
            icon: <CheckCircle2 className="h-4 w-4" />,
          });
          break;

        case 'sst:error':
          items.push({
            id: event.id,
            type: 'sst:error',
            title: 'SST dev server error',
            description: event.error,
            timestamp: event.timestamp,
            status: 'error',
            icon: <XCircle className="h-4 w-4" />,
          });
          break;

        case 'dashboard:ready':
          items.push({
            id: event.id,
            type: 'dashboard:ready',
            title: 'Dashboard server started',
            description: `Available at ${event.url}`,
            timestamp: event.timestamp,
            status: 'success',
            icon: <CheckCircle2 className="h-4 w-4" />,
          });
          break;
      }
    });

    // Sort by timestamp (newest first for timeline view)
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);

  // Get status color
  const getStatusColor = (status: TimelineItem['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-500 border-green-500';
      case 'error':
        return 'text-red-500 border-red-500';
      case 'warning':
        return 'text-yellow-500 border-yellow-500';
      default:
        return 'text-blue-500 border-blue-500';
    }
  };

  const getStatusBg = (status: TimelineItem['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10';
      case 'error':
        return 'bg-red-500/10';
      case 'warning':
        return 'bg-yellow-500/10';
      default:
        return 'bg-blue-500/10';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Deployment Timeline</CardTitle>
            <CardDescription>Chronological view of deployment events</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {timelineItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No events yet</p>
          </div>
        )}

        {timelineItems.length > 0 && (
          <div className="space-y-4 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            {timelineItems.map((item, index) => (
              <div key={item.id} className="flex items-start space-x-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${getStatusColor(
                      item.status
                    )} ${getStatusBg(item.status)}`}
                  >
                    {item.icon}
                  </div>
                  {index < timelineItems.length - 1 && (
                    <div className="w-0.5 h-full min-h-[40px] bg-border mt-2" />
                  )}
                </div>

                {/* Event content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      {item.duration !== undefined && (
                        <span className="px-2 py-0.5 bg-muted rounded">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  )}

                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline stats */}
        {timelineItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-2xl font-bold text-foreground">{timelineItems.length}</p>
                <p className="text-xs text-muted-foreground">Total Events</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">
                  {timelineItems.filter((i) => i.status === 'success').length}
                </p>
                <p className="text-xs text-muted-foreground">Success</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">
                  {timelineItems.filter((i) => i.status === 'error').length}
                </p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
