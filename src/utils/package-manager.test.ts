import { test } from 'node:test';
import assert from 'node:assert';
import { detectPackageManager, formatCommand, getPackageManagerExamples } from './package-manager.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

test('detectPackageManager - detects pnpm', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = detectPackageManager(tempDir);
    assert.strictEqual(result.name, 'pnpm');
    assert.strictEqual(result.installCommand, 'pnpm install');
    assert.strictEqual(result.runCommand, 'pnpm');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('detectPackageManager - detects yarn', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    const result = detectPackageManager(tempDir);
    assert.strictEqual(result.name, 'yarn');
    assert.strictEqual(result.installCommand, 'yarn install');
    assert.strictEqual(result.runCommand, 'yarn');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('detectPackageManager - detects bun', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'bun.lockb'), '');
    const result = detectPackageManager(tempDir);
    assert.strictEqual(result.name, 'bun');
    assert.strictEqual(result.installCommand, 'bun install');
    assert.strictEqual(result.runCommand, 'bun');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('detectPackageManager - defaults to npm', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    const result = detectPackageManager(tempDir);
    assert.strictEqual(result.name, 'npm');
    assert.strictEqual(result.installCommand, 'npm install');
    assert.strictEqual(result.runCommand, 'npm run');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('detectPackageManager - prefers pnpm over yarn', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    const result = detectPackageManager(tempDir);
    assert.strictEqual(result.name, 'pnpm');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('formatCommand - converts npm install', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = formatCommand('npm install -D husky', tempDir);
    assert.strictEqual(result, 'pnpm install -D husky');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('formatCommand - converts npm run', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = formatCommand('npm run build', tempDir);
    assert.strictEqual(result, 'pnpm build');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('formatCommand - handles npm with yarn', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    const result = formatCommand('npm install', tempDir);
    assert.strictEqual(result, 'yarn install');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('getPackageManagerExamples - generates correct examples', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-'));
  try {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const examples = getPackageManagerExamples(tempDir);
    assert.strictEqual(examples.install, 'pnpm install');
    assert.strictEqual(examples.run('dev'), 'pnpm dev');
    assert.strictEqual(examples.execute('test'), 'pnpm test');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});
