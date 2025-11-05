/**
 * SST Output Parser (Pure Functions - No I/O)
 * Parses SST dev server output for dashboard integration
 *
 * This module contains pure functions for parsing SST output lines.
 * All functions are deterministic and side-effect-free for easy testing.
 */

/**
 * Parsed SST line result
 */
export interface ParsedSstLine {
  type: 'state-change' | 'url' | 'error' | 'log' | 'noise';
  data: {
    state?: 'starting' | 'building' | 'ready';
    urls?: {
      console?: string;
      frontend?: string;
    };
    error?: {
      message: string;
      code?: number;
      recoverable: boolean;
    };
    log?: {
      line: string;
      level: 'info' | 'warn' | 'error' | 'debug';
    };
  };
}

/**
 * SST state detection patterns
 */
const STATE_PATTERNS = {
  starting: [
    /SST.*starting/i,
    /Starting.*SST/i,
    /Initializing.*SST/i,
  ],
  building: [
    /Building/i,
    /Compiling/i,
    /Bundling/i,
  ],
  ready: [
    /SST.*ready/i,
    /Ready/i,
    /Server.*running/i,
    /Dev.*server.*started/i,
  ],
};

/**
 * URL extraction patterns
 */
const URL_PATTERNS = {
  // SST Console URLs
  console: /https:\/\/console\.sst\.dev\/[^\s\)\]]+/,
  ionConsole: /https:\/\/console\.ion\.sst\.dev\/[^\s\)\]]+/,

  // Frontend URLs (localhost or deployed)
  frontend: /https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^\s\)\]]*)?/,
  deployedFrontend: /https:\/\/[a-z0-9-]+\.(?:vercel\.app|netlify\.app|cloudfront\.net)(?:\/[^\s\)\]]*)?/,
};

/**
 * Error detection patterns with recoverability
 */
const ERROR_PATTERNS = [
  {
    pattern: /Error: Cannot find module ['"]([^'"]+)['"]/,
    recoverable: false,
    extract: (match: RegExpMatchArray) => `Missing module: ${match[1]}`,
  },
  {
    pattern: /Port (\d+) is already in use/i,
    recoverable: true,
    extract: (match: RegExpMatchArray) => `Port ${match[1]} is already in use`,
  },
  {
    pattern: /EADDRINUSE.*?(?:port |:)(\d+)/i,
    recoverable: true,
    extract: (match: RegExpMatchArray) => `Port ${match[1]} is already in use`,
  },
  {
    pattern: /AWS.*credentials/i,
    recoverable: true,
    extract: () => 'AWS credentials not configured',
  },
  {
    pattern: /Pulumi.*locked/i,
    recoverable: true,
    extract: () => 'Pulumi state is locked',
  },
  {
    pattern: /ENOENT.*no such file or directory/i,
    recoverable: false,
    extract: (match: RegExpMatchArray) => match[0],
  },
  {
    pattern: /Error:/i,
    recoverable: false,
    extract: (match: RegExpMatchArray) => match[0],
  },
];

/**
 * Noise patterns to filter out
 */
const NOISE_PATTERNS = [
  /^\s*$/,  // Empty lines
  /^[\s\-=_+|]*$/,  // Lines with only whitespace/separators
  /^\s*\[.*\]\s*$/,  // Lines with only timestamps
  /File change detected/i,
  /Watching.*files/i,
];

/**
 * Strip ANSI escape codes from a string
 * Handles colors, cursor movements, and other terminal control sequences
 *
 * @param line - Raw line with potential ANSI codes
 * @returns Clean line without ANSI codes
 */
export function stripAnsiCodes(line: string): string {
  return line
    // Remove ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other control characters except newline/tab
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize whitespace
    .trim();
}

/**
 * Detect SST state from output line
 *
 * @param line - Clean output line (ANSI codes already stripped)
 * @returns Detected state or null
 */
export function detectSstState(line: string): 'starting' | 'building' | 'ready' | null {
  for (const [state, patterns] of Object.entries(STATE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        return state as 'starting' | 'building' | 'ready';
      }
    }
  }
  return null;
}

/**
 * Extract URLs from output line
 *
 * @param line - Clean output line (ANSI codes already stripped)
 * @returns Extracted URLs or null
 */
export function extractUrls(line: string): { console?: string; frontend?: string } | null {
  const urls: { console?: string; frontend?: string } = {};

  // Check for SST Console URLs
  const consoleMatch = line.match(URL_PATTERNS.console) || line.match(URL_PATTERNS.ionConsole);
  if (consoleMatch) {
    urls.console = consoleMatch[0];
  }

  // Check for frontend URLs
  const frontendMatch = line.match(URL_PATTERNS.frontend) || line.match(URL_PATTERNS.deployedFrontend);
  if (frontendMatch) {
    urls.frontend = frontendMatch[0];
  }

  return Object.keys(urls).length > 0 ? urls : null;
}

/**
 * Detect error from output line
 *
 * @param line - Clean output line (ANSI codes already stripped)
 * @returns Error information or null
 */
export function detectError(line: string): {
  message: string;
  code?: number;
  recoverable: boolean;
} | null {
  for (const errorPattern of ERROR_PATTERNS) {
    const match = line.match(errorPattern.pattern);
    if (match) {
      const message = errorPattern.extract(match);

      // Extract error code if present
      const codeMatch = line.match(/code[:\s]+(\d+)/i);
      const code = codeMatch ? parseInt(codeMatch[1]) : undefined;

      return {
        message,
        code,
        recoverable: errorPattern.recoverable,
      };
    }
  }
  return null;
}

/**
 * Check if line should be filtered out (noise)
 *
 * @param line - Clean output line (ANSI codes already stripped)
 * @returns True if line should be filtered
 */
export function shouldFilterLine(line: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Infer log level from line content
 *
 * @param line - Clean output line (ANSI codes already stripped)
 * @returns Log level
 */
export function inferLogLevel(line: string): 'info' | 'warn' | 'error' | 'debug' {
  const lower = line.toLowerCase();

  if (lower.includes('error') || lower.includes('fail') || lower.includes('✗')) {
    return 'error';
  }

  if (lower.includes('warn') || lower.includes('warning') || lower.includes('⚠')) {
    return 'warn';
  }

  if (lower.includes('debug') || lower.includes('verbose') || lower.includes('trace')) {
    return 'debug';
  }

  return 'info';
}

/**
 * Main parsing function - combines all parsing logic
 *
 * @param rawLine - Raw line from SST output (may contain ANSI codes)
 * @returns Parsed result with type discrimination
 */
export function parseSstLine(rawLine: string): ParsedSstLine {
  // Strip ANSI codes first
  const line = stripAnsiCodes(rawLine);

  // Check if noise
  if (shouldFilterLine(line)) {
    return { type: 'noise', data: {} };
  }

  // Check for errors first (more specific than state changes)
  const error = detectError(line);
  if (error) {
    return {
      type: 'error',
      data: { error },
    };
  }

  // Check for state changes
  const state = detectSstState(line);
  if (state) {
    return {
      type: 'state-change',
      data: { state },
    };
  }

  // Check for URLs
  const urls = extractUrls(line);
  if (urls) {
    return {
      type: 'url',
      data: { urls },
    };
  }

  // Default: treat as log line
  return {
    type: 'log',
    data: {
      log: {
        line,
        level: inferLogLevel(line),
      },
    },
  };
}

/**
 * Detect SST version from output
 * Useful for adjusting parsing patterns for different SST versions
 *
 * @param line - Clean output line
 * @returns Version string or null
 */
export function detectSstVersion(line: string): string | null {
  const versionMatch = line.match(/SST\s+v?(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)/i);
  if (versionMatch) {
    return versionMatch[1];
  }
  return null;
}

/**
 * Check if SST is using Ion (next-gen SST)
 *
 * @param line - Clean output line
 * @returns True if Ion detected
 */
export function isIonMode(line: string): boolean {
  return /ion/i.test(line) || /console\.ion\.sst\.dev/.test(line);
}
