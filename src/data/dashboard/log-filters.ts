/**
 * Log Filtering Utilities (Pure Functions - No I/O)
 * Filter and search log entries based on various criteria
 *
 * All functions are pure - same inputs always produce same outputs.
 */

export interface LogEntry {
  line: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp: number;
}

/**
 * Filter logs by text search (case-insensitive)
 */
export function filterLogsByText(
  logs: LogEntry[],
  searchText: string
): LogEntry[] {
  if (!searchText.trim()) {
    return logs;
  }

  const lowerSearch = searchText.toLowerCase();
  return logs.filter((log) =>
    log.line.toLowerCase().includes(lowerSearch)
  );
}

/**
 * Filter logs by log level
 */
export function filterLogsByLevel(
  logs: LogEntry[],
  levels: Array<'info' | 'warn' | 'error' | 'debug'>
): LogEntry[] {
  if (levels.length === 0 || levels.length === 4) {
    return logs; // No filter or all levels selected
  }

  return logs.filter((log) => levels.includes(log.level));
}

/**
 * Filter logs by time range
 */
export function filterLogsByTimeRange(
  logs: LogEntry[],
  startTime: number,
  endTime: number
): LogEntry[] {
  return logs.filter(
    (log) => log.timestamp >= startTime && log.timestamp <= endTime
  );
}

/**
 * Filter logs by regex pattern
 */
export function filterLogsByRegex(
  logs: LogEntry[],
  pattern: string
): LogEntry[] {
  if (!pattern.trim()) {
    return logs;
  }

  try {
    const regex = new RegExp(pattern, 'i');
    return logs.filter((log) => regex.test(log.line));
  } catch (error) {
    // Invalid regex, return all logs
    return logs;
  }
}

/**
 * Combine multiple filters
 */
export function applyLogFilters(
  logs: LogEntry[],
  filters: {
    searchText?: string;
    levels?: Array<'info' | 'warn' | 'error' | 'debug'>;
    startTime?: number;
    endTime?: number;
    regex?: string;
  }
): LogEntry[] {
  let filtered = logs;

  if (filters.searchText) {
    filtered = filterLogsByText(filtered, filters.searchText);
  }

  if (filters.levels && filters.levels.length > 0) {
    filtered = filterLogsByLevel(filtered, filters.levels);
  }

  if (filters.startTime !== undefined && filters.endTime !== undefined) {
    filtered = filterLogsByTimeRange(filtered, filters.startTime, filters.endTime);
  }

  if (filters.regex) {
    filtered = filterLogsByRegex(filtered, filters.regex);
  }

  return filtered;
}

/**
 * Group logs by time interval (for aggregation/charts)
 */
export function groupLogsByInterval(
  logs: LogEntry[],
  intervalMs: number
): Map<number, LogEntry[]> {
  const groups = new Map<number, LogEntry[]>();

  logs.forEach((log) => {
    const intervalStart = Math.floor(log.timestamp / intervalMs) * intervalMs;
    const group = groups.get(intervalStart) || [];
    group.push(log);
    groups.set(intervalStart, group);
  });

  return groups;
}

/**
 * Count logs by level
 */
export function countLogsByLevel(logs: LogEntry[]): Record<string, number> {
  return logs.reduce((counts, log) => {
    counts[log.level] = (counts[log.level] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

/**
 * Get log statistics
 */
export interface LogStats {
  total: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  durationMs: number | null;
}

export function getLogStats(logs: LogEntry[]): LogStats {
  if (logs.length === 0) {
    return {
      total: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      durationMs: null,
    };
  }

  const counts = countLogsByLevel(logs);
  const timestamps = logs.map((l) => l.timestamp);
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);

  return {
    total: logs.length,
    info: counts.info || 0,
    warn: counts.warn || 0,
    error: counts.error || 0,
    debug: counts.debug || 0,
    firstTimestamp,
    lastTimestamp,
    durationMs: lastTimestamp - firstTimestamp,
  };
}

/**
 * Highlight search text in log line (returns array of parts for rendering)
 */
export interface HighlightedPart {
  text: string;
  isHighlighted: boolean;
}

export function highlightSearchText(
  line: string,
  searchText: string
): HighlightedPart[] {
  if (!searchText.trim()) {
    return [{ text: line, isHighlighted: false }];
  }

  const lowerLine = line.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  const parts: HighlightedPart[] = [];
  let lastIndex = 0;

  let index = lowerLine.indexOf(lowerSearch);
  while (index !== -1) {
    // Add non-highlighted part before match
    if (index > lastIndex) {
      parts.push({
        text: line.substring(lastIndex, index),
        isHighlighted: false,
      });
    }

    // Add highlighted match
    parts.push({
      text: line.substring(index, index + searchText.length),
      isHighlighted: true,
    });

    lastIndex = index + searchText.length;
    index = lowerLine.indexOf(lowerSearch, lastIndex);
  }

  // Add remaining non-highlighted part
  if (lastIndex < line.length) {
    parts.push({
      text: line.substring(lastIndex),
      isHighlighted: false,
    });
  }

  return parts;
}

/**
 * Sort logs by timestamp
 */
export function sortLogsByTimestamp(
  logs: LogEntry[],
  order: 'asc' | 'desc' = 'asc'
): LogEntry[] {
  return [...logs].sort((a, b) => {
    return order === 'asc'
      ? a.timestamp - b.timestamp
      : b.timestamp - a.timestamp;
  });
}

/**
 * Get unique log levels from logs
 */
export function getUniqueLevels(logs: LogEntry[]): Array<'info' | 'warn' | 'error' | 'debug'> {
  const levels = new Set(logs.map((log) => log.level));
  return Array.from(levels);
}

/**
 * Paginate logs
 */
export function paginateLogs(
  logs: LogEntry[],
  page: number,
  pageSize: number
): { logs: LogEntry[]; totalPages: number; currentPage: number } {
  const totalPages = Math.ceil(logs.length / pageSize);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    logs: logs.slice(startIndex, endIndex),
    totalPages,
    currentPage,
  };
}
