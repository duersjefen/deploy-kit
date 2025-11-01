import { describe, it } from 'node:test';
import { DeploymentError, ConfigurationError, withErrorHandling, formatError } from './errors.js';
import { assert, assertThrows } from '../test-utils.js';
describe('Error Utilities', () => {
    describe('DeploymentError', () => {
        it('creates DeploymentError with code and details', () => {
            const error = new DeploymentError('Deployment failed', 'DEPLOY_001', {
                stage: 'production',
                region: 'us-east-1',
            });
            assert(error.name === 'DeploymentError');
            assert(error.message === 'Deployment failed');
            assert(error.code === 'DEPLOY_001');
            assert(error.details?.stage === 'production');
            assert(error.details?.region === 'us-east-1');
        });
        it('creates DeploymentError without details', () => {
            const error = new DeploymentError('Deployment failed', 'DEPLOY_002');
            assert(error.name === 'DeploymentError');
            assert(error.code === 'DEPLOY_002');
            assert(error.details === undefined);
        });
    });
    describe('ConfigurationError', () => {
        it('creates ConfigurationError with configPath and validationErrors', () => {
            const error = new ConfigurationError('Invalid config', '/path/to/config.json', ['Missing projectName', 'Invalid AWS region']);
            assert(error.name === 'ConfigurationError');
            assert(error.message === 'Invalid config');
            assert(error.configPath === '/path/to/config.json');
            assert(error.validationErrors?.length === 2);
        });
        it('creates ConfigurationError with minimal params', () => {
            const error = new ConfigurationError('Invalid config');
            assert(error.name === 'ConfigurationError');
            assert(error.configPath === undefined);
            assert(error.validationErrors === undefined);
        });
    });
    describe('withErrorHandling', () => {
        it('returns value on success', () => {
            const result = withErrorHandling(() => 42, {});
            assert(result === 42);
        });
        it('catches and re-throws errors', () => {
            assertThrows(() => withErrorHandling(() => {
                throw new Error('Test error');
            }, { exitOnError: false }));
        });
        it('returns value from function', () => {
            const result = withErrorHandling(() => 'success', {
                exitOnError: false,
            });
            assert(result === 'success');
        });
    });
    describe('formatError', () => {
        it('formats DeploymentError with code', () => {
            const error = new DeploymentError('Deployment failed', 'DEPLOY_001');
            const formatted = formatError(error);
            assert(formatted === '[DEPLOY_001] Deployment failed');
        });
        it('formats regular Error', () => {
            const error = new Error('Regular error');
            const formatted = formatError(error);
            assert(formatted === 'Regular error');
        });
        it('formats non-Error values', () => {
            const formatted = formatError('string error');
            assert(formatted === 'string error');
        });
        it('formats null/undefined', () => {
            assert(formatError(null) === 'null');
            assert(formatError(undefined) === 'undefined');
        });
    });
});
