import { test } from 'node:test';
import assert from 'node:assert';
import {
  stripAnsiCodes,
  detectSstState,
  extractUrls,
  detectError,
  shouldFilterLine,
  inferLogLevel,
  parseSstLine,
  detectSstVersion,
  isIonMode,
} from './sst-output-parser.js';

// Test stripAnsiCodes
test('stripAnsiCodes - removes ANSI color codes', () => {
  const input = '\x1b[32mSuccess\x1b[0m';
  const result = stripAnsiCodes(input);
  assert.strictEqual(result, 'Success');
});

test('stripAnsiCodes - removes multiple ANSI codes', () => {
  const input = '\x1b[1m\x1b[32mBold Green\x1b[0m\x1b[0m';
  const result = stripAnsiCodes(input);
  assert.strictEqual(result, 'Bold Green');
});

test('stripAnsiCodes - handles plain text', () => {
  const input = 'Plain text';
  const result = stripAnsiCodes(input);
  assert.strictEqual(result, 'Plain text');
});

test('stripAnsiCodes - removes cursor movement codes', () => {
  const input = '\x1b[2K\x1b[0GLoading...';
  const result = stripAnsiCodes(input);
  assert.strictEqual(result, 'Loading...');
});

// Test detectSstState
test('detectSstState - detects starting state', () => {
  assert.strictEqual(detectSstState('SST v3.0.0 starting...'), 'starting');
  assert.strictEqual(detectSstState('Starting SST dev server'), 'starting');
  assert.strictEqual(detectSstState('Initializing SST'), 'starting');
});

test('detectSstState - detects building state', () => {
  assert.strictEqual(detectSstState('Building application...'), 'building');
  assert.strictEqual(detectSstState('Compiling TypeScript'), 'building');
  assert.strictEqual(detectSstState('Bundling functions'), 'building');
});

test('detectSstState - detects ready state', () => {
  assert.strictEqual(detectSstState('SST v3.0.0 ready!'), 'ready');
  assert.strictEqual(detectSstState('Dev server started'), 'ready');
  assert.strictEqual(detectSstState('Server running on port 3000'), 'ready');
});

test('detectSstState - returns null for unrecognized lines', () => {
  assert.strictEqual(detectSstState('Some random log line'), null);
  assert.strictEqual(detectSstState(''), null);
});

// Test extractUrls
test('extractUrls - extracts SST console URL', () => {
  const line = 'Console: https://console.sst.dev/local/my-app/stages/dev';
  const result = extractUrls(line);
  assert.deepStrictEqual(result, {
    console: 'https://console.sst.dev/local/my-app/stages/dev',
  });
});

test('extractUrls - extracts Ion console URL', () => {
  const line = 'Console: https://console.ion.sst.dev/my-app';
  const result = extractUrls(line);
  assert.deepStrictEqual(result, {
    console: 'https://console.ion.sst.dev/my-app',
  });
});

test('extractUrls - extracts localhost frontend URL', () => {
  const line = 'Frontend running at http://localhost:3000';
  const result = extractUrls(line);
  assert.deepStrictEqual(result, {
    frontend: 'http://localhost:3000',
  });
});

test('extractUrls - extracts both URLs', () => {
  const line = 'Console: https://console.sst.dev/app | Frontend: http://localhost:3000';
  const result = extractUrls(line);
  assert.deepStrictEqual(result, {
    console: 'https://console.sst.dev/app',
    frontend: 'http://localhost:3000',
  });
});

test('extractUrls - returns null when no URLs found', () => {
  const line = 'Just some log text without URLs';
  const result = extractUrls(line);
  assert.strictEqual(result, null);
});

// Test detectError
test('detectError - detects missing module error', () => {
  const line = "Error: Cannot find module 'aws-sdk'";
  const result = detectError(line);
  assert.ok(result);
  assert.strictEqual(result.message, "Missing module: aws-sdk");
  assert.strictEqual(result.recoverable, false);
});

test('detectError - detects port in use error', () => {
  const line = 'Error: EADDRINUSE - Port 3000 is already in use';
  const result = detectError(line);
  assert.ok(result);
  assert.strictEqual(result.message, 'Port 3000 is already in use');
  assert.strictEqual(result.recoverable, true);
});

test('detectError - detects AWS credentials error', () => {
  const line = 'Error: AWS credentials not configured';
  const result = detectError(line);
  assert.ok(result);
  assert.strictEqual(result.message, 'AWS credentials not configured');
  assert.strictEqual(result.recoverable, true);
});

test('detectError - detects Pulumi lock error', () => {
  const line = 'Error: Pulumi stack is locked';
  const result = detectError(line);
  assert.ok(result);
  assert.strictEqual(result.message, 'Pulumi state is locked');
  assert.strictEqual(result.recoverable, true);
});

test('detectError - returns null for non-error lines', () => {
  const line = 'Everything is working fine';
  const result = detectError(line);
  assert.strictEqual(result, null);
});

// Test shouldFilterLine
test('shouldFilterLine - filters empty lines', () => {
  assert.strictEqual(shouldFilterLine(''), true);
  assert.strictEqual(shouldFilterLine('   '), true);
  assert.strictEqual(shouldFilterLine('\t\t'), true);
});

test('shouldFilterLine - filters separator lines', () => {
  assert.strictEqual(shouldFilterLine('---'), true);
  assert.strictEqual(shouldFilterLine('==='), true);
  assert.strictEqual(shouldFilterLine('+++'), true);
  assert.strictEqual(shouldFilterLine('|||'), true);
});

test('shouldFilterLine - filters file watcher messages', () => {
  assert.strictEqual(shouldFilterLine('File change detected'), true);
  assert.strictEqual(shouldFilterLine('Watching 123 files'), true);
});

test('shouldFilterLine - does not filter normal lines', () => {
  assert.strictEqual(shouldFilterLine('Starting server...'), false);
  assert.strictEqual(shouldFilterLine('Lambda function deployed'), false);
});

// Test inferLogLevel
test('inferLogLevel - detects error level', () => {
  assert.strictEqual(inferLogLevel('Error: Something went wrong'), 'error');
  assert.strictEqual(inferLogLevel('Failed to deploy'), 'error');
  assert.strictEqual(inferLogLevel('✗ Build failed'), 'error');
});

test('inferLogLevel - detects warn level', () => {
  assert.strictEqual(inferLogLevel('Warning: Deprecated API'), 'warn');
  assert.strictEqual(inferLogLevel('⚠ Memory usage high'), 'warn');
});

test('inferLogLevel - detects debug level', () => {
  assert.strictEqual(inferLogLevel('Debug: Connection established'), 'debug');
  assert.strictEqual(inferLogLevel('Verbose output enabled'), 'debug');
});

test('inferLogLevel - defaults to info level', () => {
  assert.strictEqual(inferLogLevel('Server started'), 'info');
  assert.strictEqual(inferLogLevel('Deployment complete'), 'info');
});

// Test parseSstLine
test('parseSstLine - parses state change', () => {
  const result = parseSstLine('SST v3.0.0 ready!');
  assert.strictEqual(result.type, 'state-change');
  assert.strictEqual(result.data.state, 'ready');
});

test('parseSstLine - parses URL detection', () => {
  const result = parseSstLine('Console: https://console.sst.dev/my-app');
  assert.strictEqual(result.type, 'url');
  assert.ok(result.data.urls);
  assert.strictEqual(result.data.urls.console, 'https://console.sst.dev/my-app');
});

test('parseSstLine - parses error', () => {
  const result = parseSstLine("Error: Cannot find module 'test'");
  assert.strictEqual(result.type, 'error');
  assert.ok(result.data.error);
  assert.strictEqual(result.data.error.message, "Missing module: test");
  assert.strictEqual(result.data.error.recoverable, false);
});

test('parseSstLine - parses log line', () => {
  const result = parseSstLine('Deploying function: api');
  assert.strictEqual(result.type, 'log');
  assert.ok(result.data.log);
  assert.strictEqual(result.data.log.line, 'Deploying function: api');
  assert.strictEqual(result.data.log.level, 'info');
});

test('parseSstLine - filters noise', () => {
  const result = parseSstLine('   ');
  assert.strictEqual(result.type, 'noise');
});

test('parseSstLine - strips ANSI codes before parsing', () => {
  const result = parseSstLine('\x1b[32mSST v3.0.0 ready!\x1b[0m');
  assert.strictEqual(result.type, 'state-change');
  assert.strictEqual(result.data.state, 'ready');
});

// Test detectSstVersion
test('detectSstVersion - detects version with v prefix', () => {
  const result = detectSstVersion('SST v3.1.2 starting...');
  assert.strictEqual(result, '3.1.2');
});

test('detectSstVersion - detects version without v prefix', () => {
  const result = detectSstVersion('SST 3.1.2 starting...');
  assert.strictEqual(result, '3.1.2');
});

test('detectSstVersion - detects pre-release version', () => {
  const result = detectSstVersion('SST v3.1.2-beta.1 starting...');
  assert.strictEqual(result, '3.1.2-beta.1');
});

test('detectSstVersion - returns null when no version found', () => {
  const result = detectSstVersion('Starting server...');
  assert.strictEqual(result, null);
});

// Test isIonMode
test('isIonMode - detects Ion from URL', () => {
  assert.strictEqual(isIonMode('Console: https://console.ion.sst.dev/app'), true);
});

test('isIonMode - detects Ion from text', () => {
  assert.strictEqual(isIonMode('SST Ion v3.0.0'), true);
  assert.strictEqual(isIonMode('Using Ion mode'), true);
});

test('isIonMode - returns false for non-Ion lines', () => {
  assert.strictEqual(isIonMode('Console: https://console.sst.dev/app'), false);
  assert.strictEqual(isIonMode('SST v3.0.0'), false);
});

// Integration tests
test('parseSstLine - real SST output example 1', () => {
  const line = '\x1b[1m\x1b[36mSST v3.0.55\x1b[0m \x1b[32mready!\x1b[0m';
  const result = parseSstLine(line);
  assert.strictEqual(result.type, 'state-change');
  assert.strictEqual(result.data.state, 'ready');
});

test('parseSstLine - real SST output example 2', () => {
  const line = '  Console: https://console.sst.dev/local/my-app/stages/dev';
  const result = parseSstLine(line);
  assert.strictEqual(result.type, 'url');
  assert.ok(result.data.urls);
  assert.strictEqual(result.data.urls.console, 'https://console.sst.dev/local/my-app/stages/dev');
});

test('parseSstLine - real SST output example 3', () => {
  const line = '\x1b[31m✗\x1b[0m \x1b[1mError:\x1b[0m Port 3000 is already in use';
  const result = parseSstLine(line);
  assert.strictEqual(result.type, 'error');
  assert.ok(result.data.error);
  assert.ok(result.data.error.message.includes('Port 3000'));
});
