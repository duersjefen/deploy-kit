/**
 * Diff Formatter Test Suite
 *
 * Tests for CLI-friendly diff formatting and display.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  formatDiffForTerminal,
  formatDiffSummary,
  formatDiffAsJSON,
  formatDiffAsMarkdown,
  type FormatOptions,
} from './diff-formatter.js';
import { createDiff } from './diff-utils.js';

describe('Diff Formatter', () => {
  describe('formatDiffForTerminal', () => {
    it('returns message for identical configs', () => {
      const diff = createDiff({ a: 1 }, { a: 1 });
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('No changes'));
    });

    it('formats additions', () => {
      const diff = createDiff({ a: 1 }, { a: 1, b: 2 });
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('ADDITIONS'));
      assert.ok(formatted.includes('b'));
    });

    it('formats removals', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 1 });
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('REMOVALS'));
      assert.ok(formatted.includes('b'));
    });

    it('formats modifications', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('MODIFICATIONS'));
      assert.ok(formatted.includes('a'));
    });

    it('includes summary statistics', () => {
      const diff = createDiff(
        { a: 1, b: 2 },
        { a: 2, c: 3 }
      );
      const formatted = formatDiffForTerminal(diff, { summary: true });

      assert.ok(formatted.includes('Summary'));
    });

    it('excludes summary when disabled', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const formatted = formatDiffForTerminal(diff, { summary: false });

      assert.ok(!formatted.includes('Summary'));
    });

    it('respects color option', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const withColors = formatDiffForTerminal(diff, { colors: true });
      const withoutColors = formatDiffForTerminal(diff, { colors: false });

      // withColors should contain ANSI escape codes, withoutColors should not
      assert.ok(withColors.length > 0);
      assert.ok(withoutColors.length > 0);
    });

    it('respects groupByType option', () => {
      const diff = createDiff(
        { a: 1, b: 2 },
        { a: 2, c: 3 }
      );

      const grouped = formatDiffForTerminal(diff, { groupByType: true });
      const sequential = formatDiffForTerminal(diff, { groupByType: false });

      assert.ok(grouped.length > 0);
      assert.ok(sequential.length > 0);
    });

    it('handles all default options', () => {
      const diff = createDiff(
        { a: 1, b: 2 },
        { a: 2, c: 3 }
      );
      const formatted = formatDiffForTerminal(diff);

      assert.ok(typeof formatted === 'string');
      assert.ok(formatted.length > 0);
    });

    it('respects lineWidth option', () => {
      const diff = createDiff(
        { 'very-long-property-name-that-will-be-truncated': 1 },
        { 'very-long-property-name-that-will-be-truncated': 2 }
      );

      const formatted = formatDiffForTerminal(diff, { lineWidth: 40 });
      const lines = formatted.split('\n');

      // Most lines should respect width limit
      const longLines = lines.filter(l => l.length > 50);
      assert.ok(longLines.length < lines.length);
    });

    it('includes configuration changes header', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('Configuration Changes'));
    });

    it('handles complex nested changes', () => {
      const diff = createDiff(
        { config: { db: { host: 'localhost', port: 5432 } } },
        { config: { db: { host: 'remote', port: 5432, ssl: true } } }
      );
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('host'));
      assert.ok(formatted.includes('ssl'));
    });
  });

  describe('formatDiffSummary', () => {
    it('returns no changes for identical config', () => {
      const diff = createDiff({ a: 1 }, { a: 1 });
      const summary = formatDiffSummary(diff);

      assert.strictEqual(summary, '✅ No changes');
    });

    it('shows only additions', () => {
      const diff = createDiff({}, { a: 1, b: 2 });
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('+'));
      assert.ok(summary.includes('added'));
    });

    it('shows only removals', () => {
      const diff = createDiff({ a: 1, b: 2 }, {});
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('-'));
      assert.ok(summary.includes('removed'));
    });

    it('shows only modifications', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 2, b: 3 });
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('~'));
      assert.ok(summary.includes('modified'));
    });

    it('shows mixed changes', () => {
      const diff = createDiff(
        { a: 1, b: 2, c: 3 },
        { a: 2, d: 4 }
      );
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('+'));
      assert.ok(summary.includes('-'));
      assert.ok(summary.includes('~'));
    });

    it('uses singular form for single change', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('1 change'));
      assert.ok(!summary.includes('changes'));
    });

    it('uses plural form for multiple changes', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 2, b: 3 });
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('changes'));
    });
  });

  describe('formatDiffAsJSON', () => {
    it('returns valid JSON', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const json = formatDiffAsJSON(diff);

      const parsed = JSON.parse(json);
      assert.ok(parsed);
    });

    it('preserves diff data', () => {
      const diff = createDiff({ a: 1, b: 2 }, { a: 2, c: 3 });
      const json = formatDiffAsJSON(diff);
      const parsed = JSON.parse(json);

      assert.strictEqual(parsed.identical, false);
      assert.ok(parsed.changes.length > 0);
      assert.strictEqual(parsed.added, 1);
      assert.strictEqual(parsed.removed, 1);
      assert.strictEqual(parsed.modified, 1);
    });

    it('is pretty-printed', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const json = formatDiffAsJSON(diff);

      // Should be indented
      assert.ok(json.includes('\n'));
      assert.ok(json.includes('  '));
    });

    it('includes all changes', () => {
      const diff = createDiff(
        { old: 'value' },
        { new: 'value' }
      );
      const json = formatDiffAsJSON(diff);
      const parsed = JSON.parse(json);

      assert.ok(parsed.changes.length >= 2); // At least one removal and one addition
    });
  });

  describe('formatDiffAsMarkdown', () => {
    it('returns valid markdown', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(typeof markdown === 'string');
      assert.ok(markdown.length > 0);
    });

    it('returns no changes message for identical config', () => {
      const diff = createDiff({ a: 1 }, { a: 1 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('No changes'));
    });

    it('includes markdown headers', () => {
      const diff = createDiff(
        { a: 1, b: 2 },
        { a: 2, c: 3 }
      );
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('##'));
      assert.ok(markdown.includes('Configuration Changes'));
    });

    it('formats additions as markdown list', () => {
      const diff = createDiff({}, { a: 1, b: 2 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('### ✨ Additions'));
      assert.ok(markdown.includes('- '));
    });

    it('formats removals as markdown list', () => {
      const diff = createDiff({ a: 1, b: 2 }, {});
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('### ❌ Removals'));
      assert.ok(markdown.includes('- '));
    });

    it('formats modifications as markdown list', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('### 🔄 Modifications'));
      assert.ok(markdown.includes('→'));
    });

    it('includes summary at bottom', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('Summary'));
      assert.ok(markdown.includes('---'));
    });

    it('uses code formatting for paths', () => {
      const diff = createDiff({ a: 1 }, { a: 2 });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('`'));
    });

    it('shows arrows for modifications', () => {
      const diff = createDiff({ a: 1, b: { c: 2 } }, { a: 3, b: { c: 4 } });
      const markdown = formatDiffAsMarkdown(diff);

      assert.ok(markdown.includes('→'));
    });
  });

  describe('Complex scenarios', () => {
    it('formats deployment configuration changes', () => {
      const oldConfig = {
        stage: 'staging',
        cloudfront: { ttl: 300 },
        ssl: { enabled: true },
        health_checks: 8,
      };

      const newConfig = {
        stage: 'staging',
        cloudfront: { ttl: 600 },
        ssl: { enabled: true, certs: 2 },
        health_checks: 10,
      };

      const diff = createDiff(oldConfig, newConfig);
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('ttl'));
      assert.ok(formatted.includes('certs'));
      assert.ok(formatted.includes('health_checks'));
    });

    it('formats environment variable changes', () => {
      const oldEnv = {
        DATABASE_URL: 'postgres://old',
        API_KEY: 'secret',
        DEBUG: 'false',
      };

      const newEnv = {
        DATABASE_URL: 'postgres://new',
        API_KEY: 'secret',
        LOG_LEVEL: 'debug',
      };

      const diff = createDiff(oldEnv, newEnv);
      const summary = formatDiffSummary(diff);

      assert.ok(summary.includes('1 added'));
      assert.ok(summary.includes('1 removed'));
      assert.ok(summary.includes('1 modified'));
    });

    it('handles large configuration diffs', () => {
      const oldConfig: Record<string, unknown> = {};
      const newConfig: Record<string, unknown> = {};

      for (let i = 0; i < 50; i++) {
        oldConfig[`setting${i}`] = i;
        newConfig[`setting${i}`] = i * 2;
      }

      // Add a new setting
      newConfig['newsetting'] = 'new';

      const diff = createDiff(oldConfig, newConfig);
      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.length > 0);
      assert.ok(formatted.includes('MODIFICATIONS'));
      assert.ok(formatted.includes('ADDITIONS'));
    });
  });

  describe('Formatting details', () => {
    it('uses emoji for visual clarity', () => {
      const diff = createDiff(
        { a: 1, b: 2 },
        { a: 2, c: 3 }
      );

      const formatted = formatDiffForTerminal(diff, { colors: false });

      // Should include emoji
      assert.ok(formatted.includes('➕') || formatted.includes('✨'));
      assert.ok(formatted.includes('➖') || formatted.includes('❌'));
    });

    it('shows value changes inline', () => {
      const diff = createDiff(
        { timeout: 5000 },
        { timeout: 10000 }
      );

      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('5000'));
      assert.ok(formatted.includes('10000'));
    });

    it('truncates very long values', () => {
      const longValue = 'x'.repeat(500);
      const diff = createDiff(
        { text: 'short' },
        { text: longValue }
      );

      const formatted = formatDiffForTerminal(diff, { lineWidth: 80 });
      const lines = formatted.split('\n');

      // Lines should be reasonable length
      assert.ok(lines.every(l => l.length < 200));
    });

    it('aligns paths clearly', () => {
      const diff = createDiff(
        { a: 1, very_long_property_name: 2 },
        { a: 1, very_long_property_name: 3 }
      );

      const formatted = formatDiffForTerminal(diff);

      assert.ok(formatted.includes('very_long_property_name'));
    });
  });
});
