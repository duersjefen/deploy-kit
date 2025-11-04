/**
 * Tests for SST Link + Permissions Validation
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { findLinkPermissionsConflicts, findMissingGSIPermissions, findPulumiOutputMisuse, validateSSTConfig, formatValidationErrors, } from './sst-link-permissions.js';
describe('SST Link + Permissions Validation', () => {
    describe('findLinkPermissionsConflicts', () => {
        it('detects link + permissions conflict', () => {
            const config = `
        new sst.aws.Nextjs("Site", {
          link: [table, bucket],
          permissions: [
            { actions: ["ses:SendEmail"], resources: ["*"] }
          ]
        });
      `;
            const violations = findLinkPermissionsConflicts(config);
            assert.strictEqual(violations.length, 1);
            assert.strictEqual(violations[0].type, 'link-permissions-conflict');
            assert.strictEqual(violations[0].severity, 'warning');
            assert.ok(violations[0].message.includes('link permissions will be ignored'));
        });
        it('passes when only link is present', () => {
            const config = `
        new sst.aws.Nextjs("Site", {
          link: [table, bucket]
        });
      `;
            const violations = findLinkPermissionsConflicts(config);
            assert.strictEqual(violations.length, 0);
        });
        it('passes when only permissions is present', () => {
            const config = `
        new sst.aws.Nextjs("Site", {
          permissions: [
            { actions: ["ses:SendEmail"], resources: ["*"] }
          ]
        });
      `;
            const violations = findLinkPermissionsConflicts(config);
            assert.strictEqual(violations.length, 0);
        });
        it('detects multiple conflicts in same file', () => {
            const config = `
        new sst.aws.Nextjs("Site1", {
          link: [table],
          permissions: [{ actions: ["ses:SendEmail"], resources: ["*"] }]
        });

        new sst.aws.Nextjs("Site2", {
          link: [bucket],
          permissions: [{ actions: ["s3:GetObject"], resources: ["*"] }]
        });
      `;
            const violations = findLinkPermissionsConflicts(config);
            assert.strictEqual(violations.length, 2);
        });
    });
    describe('findMissingGSIPermissions', () => {
        it('detects missing GSI permissions for Query', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:Query"],
            resources: [table.arn]
          }
        ]
      `;
            const violations = findMissingGSIPermissions(config);
            assert.strictEqual(violations.length, 1);
            assert.strictEqual(violations[0].type, 'missing-gsi-permissions');
            assert.strictEqual(violations[0].severity, 'warning');
            assert.ok(violations[0].message.includes('GSI'));
        });
        it('detects missing GSI permissions for Scan', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:Scan"],
            resources: [table.arn]
          }
        ]
      `;
            const violations = findMissingGSIPermissions(config);
            assert.strictEqual(violations.length, 1);
        });
        it('passes when GSI pattern is present', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:Query"],
            resources: [table.arn, $interpolate\`\${table.arn}/index/*\`]
          }
        ]
      `;
            const violations = findMissingGSIPermissions(config);
            assert.strictEqual(violations.length, 0);
        });
        it('passes when no DynamoDB Query/Scan actions', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:PutItem"],
            resources: [table.arn]
          }
        ]
      `;
            const violations = findMissingGSIPermissions(config);
            assert.strictEqual(violations.length, 0);
        });
    });
    describe('findPulumiOutputMisuse', () => {
        it('detects template literal with .arn', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:Query"],
            resources: [\`\${table.arn}/index/*\`]
          }
        ]
      `;
            const violations = findPulumiOutputMisuse(config);
            assert.strictEqual(violations.length, 1);
            assert.strictEqual(violations[0].type, 'pulumi-output-misuse');
            assert.strictEqual(violations[0].severity, 'error');
            assert.ok(violations[0].message.includes('Pulumi Output'));
        });
        it('passes when using $interpolate', () => {
            const config = `
        permissions: [
          {
            actions: ["dynamodb:Query"],
            resources: [$interpolate\`\${table.arn}/index/*\`]
          }
        ]
      `;
            const violations = findPulumiOutputMisuse(config);
            assert.strictEqual(violations.length, 0);
        });
        it('passes when template literal does not reference .arn', () => {
            const config = `
        permissions: [
          {
            actions: ["s3:GetObject"],
            resources: [\`arn:aws:s3:::bucket/\${prefix}/*\`]
          }
        ]
      `;
            const violations = findPulumiOutputMisuse(config);
            assert.strictEqual(violations.length, 0);
        });
    });
    describe('validateSSTConfig', () => {
        it('detects multiple violation types', () => {
            const config = `
        new sst.aws.Nextjs("Site", {
          link: [table],
          permissions: [
            {
              actions: ["dynamodb:Query"],
              resources: [\`\${table.arn}/index/*\`]  // Wrong: template literal
            }
          ]
        });
      `;
            const violations = validateSSTConfig(config);
            assert.ok(violations.length >= 2); // At least link conflict + Pulumi misuse
            assert.ok(violations.some(v => v.type === 'link-permissions-conflict'));
            assert.ok(violations.some(v => v.type === 'pulumi-output-misuse'));
        });
        it('passes for valid config', () => {
            const config = `
        new sst.aws.Nextjs("Site", {
          link: [table]
        });
      `;
            const violations = validateSSTConfig(config);
            assert.strictEqual(violations.length, 0);
        });
    });
    describe('formatValidationErrors', () => {
        it('formats errors and warnings separately', () => {
            const violations = [
                {
                    type: 'pulumi-output-misuse',
                    message: 'Error message',
                    lineNumber: 10,
                    suggestion: 'Fix it',
                    severity: 'error',
                },
                {
                    type: 'link-permissions-conflict',
                    message: 'Warning message',
                    lineNumber: 20,
                    suggestion: 'Consider this',
                    severity: 'warning',
                },
            ];
            const formatted = formatValidationErrors(violations);
            assert.ok(formatted.includes('❌ SST Config Errors'));
            assert.ok(formatted.includes('⚠️  SST Config Warnings'));
            assert.ok(formatted.includes('Error message'));
            assert.ok(formatted.includes('Warning message'));
            assert.ok(formatted.includes('line ~10'));
            assert.ok(formatted.includes('line ~20'));
        });
        it('returns empty string for no violations', () => {
            const formatted = formatValidationErrors([]);
            assert.strictEqual(formatted, '');
        });
        it('only shows errors section when no warnings', () => {
            const violations = [
                {
                    type: 'pulumi-output-misuse',
                    message: 'Error message',
                    suggestion: 'Fix it',
                    severity: 'error',
                },
            ];
            const formatted = formatValidationErrors(violations);
            assert.ok(formatted.includes('❌ SST Config Errors'));
            assert.ok(!formatted.includes('⚠️  SST Config Warnings'));
        });
        it('only shows warnings section when no errors', () => {
            const violations = [
                {
                    type: 'link-permissions-conflict',
                    message: 'Warning message',
                    suggestion: 'Consider this',
                    severity: 'warning',
                },
            ];
            const formatted = formatValidationErrors(violations);
            assert.ok(!formatted.includes('❌ SST Config Errors'));
            assert.ok(formatted.includes('⚠️  SST Config Warnings'));
        });
    });
});
