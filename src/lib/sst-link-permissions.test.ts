/**
 * Tests for SST Link + Permissions Validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  findLinkPermissionsConflicts,
  findMissingGSIPermissions,
  findPulumiOutputMisuse,
  findS3LifecycleRuleIssues,
  findAWSResourceStringReferences,
  validateSSTConfig,
  formatValidationErrors,
} from './sst-link-permissions.js';

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

    it('detects aws.getCallerIdentityOutput() in template literal', () => {
      const config = `
        new aws.lambda.Permission("Permission", {
          sourceArn: \`arn:aws:events:eu-north-1:\${aws.getCallerIdentityOutput().accountId}:rule/\${stage}-rule\`,
        });
      `;

      const violations = findPulumiOutputMisuse(config);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].type, 'pulumi-output-misuse');
      assert.ok(violations[0].message.includes('Output function call'));
    });

    it('detects .id property in template literal', () => {
      const config = `
        const vpc = \`\${network.id}/subnet\`;
      `;

      const violations = findPulumiOutputMisuse(config);
      assert.strictEqual(violations.length, 1);
      assert.ok(violations[0].message.includes('.id property'));
    });

    it('detects .name property in template literal', () => {
      const config = `
        const ruleName = \`\${rule.name}-target\`;
      `;

      const violations = findPulumiOutputMisuse(config);
      assert.strictEqual(violations.length, 1);
      assert.ok(violations[0].message.includes('.name property'));
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

    it('passes when template literal does not reference outputs', () => {
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

  describe('findS3LifecycleRuleIssues', () => {
    it('detects expiration (object) instead of expirations (array)', () => {
      const config = `
        const bucket = new sst.aws.Bucket("Bucket", {
          transform: {
            bucket: (args) => {
              args.lifecycleRules = [
                {
                  id: "expire-old-files",
                  enabled: true,
                  expiration: { days: 180 },
                }
              ];
            }
          }
        });
      `;

      const violations = findS3LifecycleRuleIssues(config);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].type, 's3-lifecycle-schema');
      assert.strictEqual(violations[0].severity, 'error');
      assert.ok(violations[0].message.includes('expiration'));
      assert.ok(violations[0].suggestion.includes('expirations'));
    });

    it('detects unsupported abortIncompleteMultipartUploads', () => {
      const config = `
        lifecycleRules = [
          {
            id: "cleanup",
            abortIncompleteMultipartUploads: { daysAfterInitiation: 7 }
          }
        ];
      `;

      const violations = findS3LifecycleRuleIssues(config);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].type, 's3-lifecycle-schema');
      assert.ok(violations[0].message.includes('abortIncompleteMultipartUploads'));
      assert.ok(violations[0].suggestion.includes('BucketLifecycleConfigurationV2'));
    });

    it('passes for correct expirations array syntax', () => {
      const config = `
        lifecycleRules = [
          {
            id: "expire-old-files",
            enabled: true,
            expirations: [{ days: 180 }]
          }
        ];
      `;

      const violations = findS3LifecycleRuleIssues(config);
      assert.strictEqual(violations.length, 0);
    });

    it('passes when no lifecycle rules present', () => {
      const config = `
        const bucket = new sst.aws.Bucket("Bucket");
      `;

      const violations = findS3LifecycleRuleIssues(config);
      assert.strictEqual(violations.length, 0);
    });
  });

  describe('findAWSResourceStringReferences', () => {
    it('detects string reference to AWS resource', () => {
      const config = `
        const deletionWarningSchedule = new aws.cloudwatch.EventRule("DeletionWarningSchedule", {
          name: \`\${stage}-deletion-warning-schedule\`,
        });

        new aws.cloudwatch.EventTarget("DeletionWarningTarget", {
          rule: "DeletionWarningSchedule",
          arn: deletionWarningFunction.arn,
        });
      `;

      const violations = findAWSResourceStringReferences(config);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].type, 'aws-resource-string-reference');
      assert.strictEqual(violations[0].severity, 'warning');
      assert.ok(violations[0].message.includes('DeletionWarningSchedule'));
      assert.ok(violations[0].suggestion.includes('resource.name'));
    });

    it('detects multiple string references', () => {
      const config = `
        const rule1 = new aws.cloudwatch.EventRule("Rule1", {});
        const rule2 = new aws.cloudwatch.EventRule("Rule2", {});

        new aws.cloudwatch.EventTarget("Target1", { rule: "Rule1" });
        new aws.cloudwatch.EventTarget("Target2", { rule: "Rule2" });
      `;

      const violations = findAWSResourceStringReferences(config);
      assert.strictEqual(violations.length, 2);
    });

    it('passes when using resource properties', () => {
      const config = `
        const deletionWarningSchedule = new aws.cloudwatch.EventRule("DeletionWarningSchedule", {
          name: \`\${stage}-deletion-warning-schedule\`,
        });

        new aws.cloudwatch.EventTarget("DeletionWarningTarget", {
          rule: deletionWarningSchedule.name,
          arn: deletionWarningFunction.arn,
        });
      `;

      const violations = findAWSResourceStringReferences(config);
      assert.strictEqual(violations.length, 0);
    });

    it('passes when string does not reference a known resource', () => {
      const config = `
        new aws.cloudwatch.EventTarget("Target", {
          rule: "some-external-rule",
          arn: func.arn,
        });
      `;

      const violations = findAWSResourceStringReferences(config);
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
          type: 'pulumi-output-misuse' as const,
          message: 'Error message',
          lineNumber: 10,
          suggestion: 'Fix it',
          severity: 'error' as const,
        },
        {
          type: 'link-permissions-conflict' as const,
          message: 'Warning message',
          lineNumber: 20,
          suggestion: 'Consider this',
          severity: 'warning' as const,
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
          type: 'pulumi-output-misuse' as const,
          message: 'Error message',
          suggestion: 'Fix it',
          severity: 'error' as const,
        },
      ];

      const formatted = formatValidationErrors(violations);
      assert.ok(formatted.includes('❌ SST Config Errors'));
      assert.ok(!formatted.includes('⚠️  SST Config Warnings'));
    });

    it('only shows warnings section when no errors', () => {
      const violations = [
        {
          type: 'link-permissions-conflict' as const,
          message: 'Warning message',
          suggestion: 'Consider this',
          severity: 'warning' as const,
        },
      ];

      const formatted = formatValidationErrors(violations);
      assert.ok(!formatted.includes('❌ SST Config Errors'));
      assert.ok(formatted.includes('⚠️  SST Config Warnings'));
    });
  });
});
