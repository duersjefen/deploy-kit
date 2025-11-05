/**
 * ExportButton Component
 * Export dashboard data to various formats
 */

import { Download, FileText, FileJson, FileCode } from 'lucide-react';
import type { DashboardState } from '../lib/types';

interface ExportButtonProps {
  state: DashboardState;
}

export function ExportButton({ state }: ExportButtonProps) {
  // Export deployment report as markdown
  const exportMarkdown = () => {
    const lines: string[] = [];

    lines.push('# Deployment Report\n');
    lines.push(`**Generated:** ${new Date().toISOString()}\n`);

    // Checks summary
    if (state.checksSummary) {
      lines.push('## Pre-Flight Checks\n');
      lines.push(`- Total: ${state.checksSummary.total}`);
      lines.push(`- Passed: ${state.checksSummary.passed}`);
      lines.push(`- Failed: ${state.checksSummary.failed}`);
      lines.push(`- Auto-Fixed: ${state.checksSummary.autoFixed}`);
      lines.push(`- Duration: ${state.checksSummary.totalDuration}ms\n`);
    }

    // SST status
    lines.push('## SST Dev Server\n');
    lines.push(`**Status:** ${state.sst.status}`);
    if (state.sst.port) lines.push(`**Port:** ${state.sst.port}`);
    if (state.sst.urls.frontend) lines.push(`**Frontend:** ${state.sst.urls.frontend}`);
    if (state.sst.urls.console) lines.push(`**SST Console:** ${state.sst.urls.console}`);
    lines.push('');

    // Check details
    if (state.checks.length > 0) {
      lines.push('## Check Details\n');
      state.checks.forEach((check) => {
        const icon =
          check.status === 'passed'
            ? '✅'
            : check.status === 'failed'
            ? '❌'
            : check.status === 'auto-fixed'
            ? '🔧'
            : '⏳';
        lines.push(`**${icon} ${check.name}**`);
        lines.push(`- Status: ${check.status}`);
        if (check.duration) lines.push(`- Duration: ${check.duration}ms`);
        if (check.issue) lines.push(`- Issue: ${check.issue}`);
        lines.push('');
      });
    }

    // Recent logs
    if (state.sst.outputLines.length > 0) {
      lines.push('## Recent Logs\n');
      lines.push('```');
      state.sst.outputLines.slice(-20).forEach((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        lines.push(`[${timestamp}] ${log.level.toUpperCase()}: ${log.line}`);
      });
      lines.push('```\n');
    }

    const content = lines.join('\n');
    download(content, 'deployment-report.md', 'text/markdown');
  };

  // Export full state as JSON
  const exportJSON = () => {
    const content = JSON.stringify(state, null, 2);
    download(content, 'dashboard-state.json', 'application/json');
  };

  // Export logs as text
  const exportLogs = () => {
    const content = state.sst.outputLines
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        const level = log.level.toUpperCase().padEnd(5);
        return `[${timestamp}] ${level} ${log.line}`;
      })
      .join('\n');
    download(content, 'logs.txt', 'text/plain');
  };

  // Helper to trigger download
  const download = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group">
      <button className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center space-x-2">
        <Download className="h-4 w-4" />
        <span>Export</span>
      </button>

      <div className="absolute right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
        <button
          onClick={exportMarkdown}
          className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 rounded-t-lg transition-colors flex items-center space-x-3"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">Deployment Report</div>
            <div className="text-xs text-muted-foreground">Markdown format</div>
          </div>
        </button>

        <button
          onClick={exportJSON}
          className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors flex items-center space-x-3"
        >
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">Full State</div>
            <div className="text-xs text-muted-foreground">JSON format</div>
          </div>
        </button>

        <button
          onClick={exportLogs}
          className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50 rounded-b-lg transition-colors flex items-center space-x-3"
        >
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">Logs Only</div>
            <div className="text-xs text-muted-foreground">Plain text</div>
          </div>
        </button>
      </div>
    </div>
  );
}
