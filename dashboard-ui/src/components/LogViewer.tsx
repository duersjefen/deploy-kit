/**
 * LogViewer Component
 * Advanced log viewing with search, filter, and export
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import type { SstState } from '../lib/types';

interface LogViewerProps {
  sst: SstState;
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function LogViewer({ sst }: LogViewerProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(['info', 'warn', 'error', 'debug']);
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [sst.outputLines, autoScroll]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let logs = sst.outputLines;

    // Filter by level
    if (selectedLevels.length < 4) {
      logs = logs.filter((log) => selectedLevels.includes(log.level));
    }

    // Filter by search text
    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase();
      logs = logs.filter((log) => log.line.toLowerCase().includes(lowerSearch));
    }

    return logs;
  }, [sst.outputLines, selectedLevels, searchText]);

  // Log statistics
  const stats = useMemo(() => {
    const counts = sst.outputLines.reduce(
      (acc, log) => {
        acc[log.level]++;
        acc.total++;
        return acc;
      },
      { total: 0, info: 0, warn: 0, error: 0, debug: 0 }
    );
    return counts;
  }, [sst.outputLines]);

  // Toggle level filter
  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  // Export logs
  const exportLogs = (format: 'text' | 'json') => {
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(filteredLogs, null, 2);
      filename = `logs_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      content = filteredLogs
        .map((log) => {
          const timestamp = new Date(log.timestamp).toISOString();
          const level = log.level.toUpperCase().padEnd(5);
          return `[${timestamp}] ${level} ${log.line}`;
        })
        .join('\n');
      filename = `logs_${new Date().toISOString().split('T')[0]}.txt`;
      mimeType = 'text/plain';
    }

    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear search
  const clearSearch = () => {
    setSearchText('');
  };

  // Get log level color
  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'text-red-500';
      case 'warn':
        return 'text-yellow-500';
      case 'debug':
        return 'text-gray-400';
      default:
        return 'text-foreground';
    }
  };

  // Highlight search text in line
  const highlightText = (line: string) => {
    if (!searchText.trim()) {
      return <span>{line}</span>;
    }

    const lowerLine = line.toLowerCase();
    const lowerSearch = searchText.toLowerCase();
    const parts: React.ReactElement[] = [];
    let lastIndex = 0;

    let index = lowerLine.indexOf(lowerSearch);
    while (index !== -1) {
      // Add non-highlighted part
      if (index > lastIndex) {
        parts.push(<span key={`${lastIndex}-normal`}>{line.substring(lastIndex, index)}</span>);
      }

      // Add highlighted part
      parts.push(
        <mark key={`${index}-highlight`} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
          {line.substring(index, index + searchText.length)}
        </mark>
      );

      lastIndex = index + searchText.length;
      index = lowerLine.indexOf(lowerSearch, lastIndex);
    }

    // Add remaining non-highlighted part
    if (lastIndex < line.length) {
      parts.push(<span key={`${lastIndex}-normal-end`}>{line.substring(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Log Viewer</CardTitle>
            <CardDescription>
              Real-time SST output with search and filter
            </CardDescription>
          </div>

          <div className="flex items-center space-x-2">
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center space-x-1.5"
              title={autoScroll ? 'Pause auto-scroll' : 'Enable auto-scroll'}
            >
              {autoScroll ? (
                <PauseCircle className="h-4 w-4" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              <span>{autoScroll ? 'Auto-scroll' : 'Paused'}</span>
            </button>

            {/* Export dropdown */}
            <div className="relative group">
              <button className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center space-x-1.5">
                <Download className="h-4 w-4" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              <div className="absolute right-0 mt-1 w-32 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => exportLogs('text')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50 rounded-t-lg transition-colors"
                >
                  Export as TXT
                </button>
                <button
                  onClick={() => exportLogs('json')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50 rounded-b-lg transition-colors"
                >
                  Export as JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search and filter bar */}
        <div className="flex items-center space-x-2 mt-4">
          {/* Search input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {searchText && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 border rounded-lg flex items-center space-x-2 transition-colors ${
              showFilters ? 'bg-primary text-primary-foreground' : 'bg-background border-border hover:bg-muted/50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 p-4 bg-muted/50 rounded-lg border border-border">
            <h4 className="text-sm font-medium mb-3">Log Levels</h4>
            <div className="flex flex-wrap gap-2">
              {(['info', 'warn', 'error', 'debug'] as LogLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedLevels.includes(level)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted/50'
                  }`}
                >
                  {level.toUpperCase()} ({stats[level]})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mt-3 flex items-center space-x-4 text-xs text-muted-foreground">
          <span>
            Showing {filteredLogs.length} of {stats.total} logs
          </span>
          {filteredLogs.length !== stats.total && (
            <button
              onClick={() => {
                setSearchText('');
                setSelectedLevels(['info', 'warn', 'error', 'debug']);
              }}
              className="text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Log output */}
        <div
          ref={logContainerRef}
          className="bg-muted/30 rounded-lg p-4 max-h-[500px] overflow-y-auto scrollbar-thin font-mono text-xs"
        >
          {filteredLogs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {stats.total === 0 ? 'No logs yet' : 'No logs match the current filters'}
            </div>
          )}

          {filteredLogs.map((log, index) => (
            <div key={index} className={`py-1 ${getLevelColor(log.level)}`}>
              <span className="text-muted-foreground">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>{' '}
              <span className="font-semibold">{log.level.toUpperCase().padEnd(5)}</span>{' '}
              {highlightText(log.line)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
