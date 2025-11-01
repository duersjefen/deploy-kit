/**
 * Tests for Lambda Reserved Environment Variables Validator
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isReservedLambdaVar, getSuggestionForReservedVar, findReservedVarsInSstConfig, formatReservedVarError, } from './lambda-reserved-vars.js';
describe('Lambda Reserved Variables Validator', () => {
    describe('isReservedLambdaVar', () => {
        it('identifies AWS_REGION as reserved', () => {
            assert.strictEqual(isReservedLambdaVar('AWS_REGION'), true);
        });
        it('identifies AWS_ACCESS_KEY_ID as reserved', () => {
            assert.strictEqual(isReservedLambdaVar('AWS_ACCESS_KEY_ID'), true);
        });
        it('identifies AWS_LAMBDA_FUNCTION_NAME as reserved', () => {
            assert.strictEqual(isReservedLambdaVar('AWS_LAMBDA_FUNCTION_NAME'), true);
        });
        it('identifies non-reserved variables', () => {
            assert.strictEqual(isReservedLambdaVar('MY_CUSTOM_VAR'), false);
            assert.strictEqual(isReservedLambdaVar('DATABASE_URL'), false);
            assert.strictEqual(isReservedLambdaVar('API_KEY'), false);
        });
    });
    describe('getSuggestionForReservedVar', () => {
        it('provides suggestion for AWS_REGION', () => {
            const suggestion = getSuggestionForReservedVar('AWS_REGION');
            assert.ok(suggestion);
            assert.ok(suggestion.includes('providers.aws.region'));
        });
        it('provides suggestion for AWS_ACCESS_KEY_ID', () => {
            const suggestion = getSuggestionForReservedVar('AWS_ACCESS_KEY_ID');
            assert.ok(suggestion);
            assert.ok(suggestion.includes('execution role'));
        });
        it('returns undefined for variables without specific suggestions', () => {
            const suggestion = getSuggestionForReservedVar('LAMBDA_TASK_ROOT');
            assert.strictEqual(suggestion, undefined);
        });
    });
    describe('findReservedVarsInSstConfig', () => {
        it('detects AWS_REGION in environment block', () => {
            const configContent = `
export default {
  config(input) {
    return {
      name: "my-app",
    };
  },
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "MyFunction", {
        handler: "index.handler",
        environment: {
          AWS_REGION: "us-east-1",
          MY_VAR: "value",
        },
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 1);
            assert.strictEqual(violations[0].varName, 'AWS_REGION');
            assert.ok(violations[0].lineNumber);
        });
        it('detects multiple reserved variables', () => {
            const configContent = `
export default {
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "MyFunction", {
        handler: "index.handler",
        environment: {
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: "fake-key",
          MY_VAR: "value",
          AWS_SECRET_ACCESS_KEY: "fake-secret",
        },
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 3);
            const varNames = violations.map(v => v.varName);
            assert.ok(varNames.includes('AWS_REGION'));
            assert.ok(varNames.includes('AWS_ACCESS_KEY_ID'));
            assert.ok(varNames.includes('AWS_SECRET_ACCESS_KEY'));
        });
        it('detects reserved variables with quoted keys', () => {
            const configContent = `
export default {
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "MyFunction", {
        handler: "index.handler",
        environment: {
          "AWS_REGION": "us-east-1",
          'AWS_ACCESS_KEY_ID': "fake-key",
        },
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 2);
        });
        it('returns empty array when no reserved variables found', () => {
            const configContent = `
export default {
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "MyFunction", {
        handler: "index.handler",
        environment: {
          DATABASE_URL: "postgres://...",
          API_KEY: "secret",
          NODE_ENV: "production",
        },
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 0);
        });
        it('handles config without environment blocks', () => {
            const configContent = `
export default {
  config(input) {
    return {
      name: "my-app",
    };
  },
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "MyFunction", {
        handler: "index.handler",
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 0);
        });
        it('detects variables in multiple environment blocks', () => {
            const configContent = `
export default {
  stacks(app) {
    app.stack(function MyStack({ stack }) {
      new Function(stack, "Function1", {
        handler: "index.handler",
        environment: {
          AWS_REGION: "us-east-1",
        },
      });

      new Function(stack, "Function2", {
        handler: "index.handler",
        environment: {
          AWS_LAMBDA_FUNCTION_NAME: "my-function",
        },
      });
    });
  },
};`;
            const violations = findReservedVarsInSstConfig(configContent);
            assert.strictEqual(violations.length, 2);
            const varNames = violations.map(v => v.varName);
            assert.ok(varNames.includes('AWS_REGION'));
            assert.ok(varNames.includes('AWS_LAMBDA_FUNCTION_NAME'));
        });
    });
    describe('formatReservedVarError', () => {
        it('formats single violation with suggestion', () => {
            const violations = [
                { varName: 'AWS_REGION', lineNumber: 10, suggestion: 'Use providers.aws.region' },
            ];
            const message = formatReservedVarError(violations);
            assert.ok(message.includes('AWS_REGION'));
            assert.ok(message.includes('line ~10'));
            assert.ok(message.includes('Use providers.aws.region'));
            assert.ok(message.includes('https://docs.aws.amazon.com'));
        });
        it('formats multiple violations', () => {
            const violations = [
                { varName: 'AWS_REGION', lineNumber: 10, suggestion: 'Use providers.aws.region' },
                { varName: 'AWS_ACCESS_KEY_ID', lineNumber: 11 },
            ];
            const message = formatReservedVarError(violations);
            assert.ok(message.includes('AWS_REGION'));
            assert.ok(message.includes('AWS_ACCESS_KEY_ID'));
            assert.ok(message.includes('line ~10'));
            assert.ok(message.includes('line ~11'));
        });
        it('formats violation without line number', () => {
            const violations = [
                { varName: 'AWS_REGION', suggestion: 'Use providers.aws.region' },
            ];
            const message = formatReservedVarError(violations);
            assert.ok(message.includes('AWS_REGION'));
            assert.ok(!message.includes('line'));
        });
    });
});
