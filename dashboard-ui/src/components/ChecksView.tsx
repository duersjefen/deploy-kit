/**
 * ChecksView Component
 * Displays real-time pre-flight check status
 */

import { CheckCircle2, XCircle, Circle, Loader2, Wrench } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import { formatDuration } from '../lib/utils';
import type { CheckState } from '../lib/types';

interface ChecksViewProps {
  checks: CheckState[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    autoFixed: number;
    totalDuration: number;
  } | null;
}

function CheckStatusIcon({ status }: { status: CheckState['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'passed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'auto-fixed':
      return <Wrench className="h-5 w-5 text-yellow-500" />;
    case 'pending':
    default:
      return <Circle className="h-5 w-5 text-gray-400" />;
  }
}

function CheckItem({ check }: { check: CheckState }) {
  return (
    <div className="flex items-start space-x-3 p-3 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <CheckStatusIcon status={check.status} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground truncate">
            {check.name}
          </p>
          {check.duration !== undefined && (
            <span className="text-xs text-muted-foreground ml-2">
              {formatDuration(check.duration)}
            </span>
          )}
        </div>

        {check.issue && (
          <p className="text-sm text-destructive mt-1">
            {check.issue}
          </p>
        )}

        {check.manualFix && (
          <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 p-2 rounded">
            Fix: {check.manualFix}
          </p>
        )}

        {check.status === 'auto-fixed' && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            ✓ Automatically fixed
          </p>
        )}
      </div>
    </div>
  );
}

export function ChecksView({ checks, summary }: ChecksViewProps) {
  const hasChecks = checks.length > 0;
  const isRunning = checks.some((c) => c.status === 'running');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pre-Flight Checks</CardTitle>
            <CardDescription>
              Development environment validation
            </CardDescription>
          </div>
          {isRunning && (
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!hasChecks && (
          <div className="text-center py-8 text-muted-foreground">
            <Circle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Waiting for checks to start...</p>
          </div>
        )}

        {hasChecks && (
          <div className="space-y-0 border border-border rounded-lg overflow-hidden">
            {checks.map((check) => (
              <CheckItem key={check.name} check={check} />
            ))}
          </div>
        )}

        {summary && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{summary.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-500">{summary.passed}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{summary.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500">{summary.autoFixed}</p>
                <p className="text-xs text-muted-foreground">Auto-Fixed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {formatDuration(summary.totalDuration)}
                </p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
