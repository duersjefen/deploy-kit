/**
 * Export Utilities (Pure Functions - No I/O)
 * Export dashboard data to various formats
 *
 * All functions are pure - same inputs always produce same outputs.
 * Actual file writing happens in imperative shell (UI layer).
 */

import type { DashboardEvent } from './event-schemas.js';
import type { DashboardState, CheckState } from './dashboard-state.js';
import type { LogEntry } from './log-filters.js';

/**
 * Export logs to plain text format
 */
export function exportLogsToText(logs: LogEntry[]): string {
  return logs
    .map((log) => {
      const timestamp = new Date(log.timestamp).toISOString();
      const level = log.level.toUpperCase().padEnd(5);
      return `[${timestamp}] ${level} ${log.line}`;
    })
    .join('\n');
}

/**
 * Export logs to JSON format
 */
export function exportLogsToJSON(logs: LogEntry[]): string {
  return JSON.stringify(logs, null, 2);
}

/**
 * Export logs to CSV format
 */
export function exportLogsToCSV(logs: LogEntry[]): string {
  const header = 'Timestamp,Level,Message\n';
  const rows = logs.map((log) => {
    const timestamp = new Date(log.timestamp).toISOString();
    const message = log.line.replace(/"/g, '""'); // Escape quotes
    return `"${timestamp}","${log.level}","${message}"`;
  });

  return header + rows.join('\n');
}

/**
 * Export events to JSON format
 */
export function exportEventsToJSON(events: DashboardEvent[]): string {
  return JSON.stringify(events, null, 2);
}

/**
 * Export checks summary to markdown
 */
export function exportChecksSummaryToMarkdown(checks: CheckState[]): string {
  const lines: string[] = [];

  lines.push('# Pre-Flight Checks Summary\n');
  lines.push(`**Total Checks:** ${checks.length}\n`);

  const passed = checks.filter((c) => c.status === 'passed').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const autoFixed = checks.filter((c) => c.status === 'auto-fixed').length;

  lines.push(`**Passed:** ${passed}`);
  lines.push(`**Failed:** ${failed}`);
  lines.push(`**Auto-Fixed:** ${autoFixed}\n`);

  lines.push('## Check Details\n');

  checks.forEach((check) => {
    const icon = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : check.status === 'auto-fixed' ? '🔧' : '⏳';
    lines.push(`### ${icon} ${check.name}\n`);
    lines.push(`**Status:** ${check.status}`);

    if (check.duration !== undefined) {
      lines.push(`**Duration:** ${check.duration}ms`);
    }

    if (check.issue) {
      lines.push(`**Issue:** ${check.issue}`);
    }

    if (check.manualFix) {
      lines.push(`**Fix:** \`${check.manualFix}\``);
    }

    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Export deployment report (comprehensive)
 */
export function exportDeploymentReport(state: DashboardState): string {
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

  if (state.sst.port) {
    lines.push(`**Port:** ${state.sst.port}`);
  }

  if (state.sst.urls.frontend) {
    lines.push(`**Frontend:** ${state.sst.urls.frontend}`);
  }

  if (state.sst.urls.console) {
    lines.push(`**SST Console:** ${state.sst.urls.console}`);
  }

  if (state.sst.errorMessage) {
    lines.push(`**Error:** ${state.sst.errorMessage}`);
  }

  lines.push('');

  // Check details
  if (state.checks.length > 0) {
    lines.push('## Check Details\n');
    state.checks.forEach((check) => {
      const icon = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : check.status === 'auto-fixed' ? '🔧' : '⏳';
      lines.push(`**${icon} ${check.name}**`);
      lines.push(`- Status: ${check.status}`);

      if (check.duration) {
        lines.push(`- Duration: ${check.duration}ms`);
      }

      if (check.issue) {
        lines.push(`- Issue: ${check.issue}`);
      }

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

  // Event summary
  lines.push('## Event Summary\n');
  lines.push(`**Total Events:** ${state.events.length}`);

  const eventTypes = state.events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  Object.entries(eventTypes).forEach(([type, count]) => {
    lines.push(`- ${type}: ${count}`);
  });

  return lines.join('\n');
}

/**
 * Create downloadable file blob (for browser downloads)
 * Returns data URL that can be used in <a> href
 */
export function createDownloadableFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): { url: string; filename: string } {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  return {
    url,
    filename,
  };
}

/**
 * Generate filename with timestamp
 */
export function generateFilename(prefix: string, extension: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Estimate export size (approximate)
 */
export function estimateExportSize(content: string): number {
  // Rough estimate: UTF-8 characters * 1 byte
  // (can be more for special characters, but close enough)
  return new Blob([content]).size;
}
