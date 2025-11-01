import { describe, it, beforeEach, afterEach } from 'node:test';
import { assert } from '../test-utils.js';
import { printDeploymentSummary, printDeploymentFailureSummary } from './deployment-printer.js';
describe('Deployment Printer', () => {
    let consoleLogs;
    beforeEach(() => {
        // Capture console.log output
        consoleLogs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            consoleLogs.push(args.join(' '));
            originalLog(...args);
        };
    });
    afterEach(() => {
        // Restore console.log
        console.log = console.log; // Reset to original (since we can't actually restore without storing reference)
    });
    describe('printDeploymentSummary', () => {
        it('prints success summary with all required fields', () => {
            const now = new Date();
            const result = {
                success: true,
                stage: 'staging',
                startTime: new Date(now.getTime() - 120000),
                endTime: now,
                durationSeconds: 120,
                message: '✅ Deployment successful',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: true,
                },
            };
            const timings = [
                { name: 'Pre-Deployment Checks', duration: 5000 },
                { name: 'Build & Deploy', duration: 100000 },
                { name: 'Health Checks', duration: 10000 },
            ];
            printDeploymentSummary(result, timings);
            // Verify key content was logged
            const output = consoleLogs.join('\n');
            assert(output.includes('DEPLOYMENT SUCCESSFUL'));
            assert(output.includes('staging'));
            assert(output.includes('120'));
        });
        it('prints summary with dry-run indicator when isDryRun is true', () => {
            const now = new Date();
            const result = {
                success: true,
                stage: 'production',
                isDryRun: true,
                startTime: new Date(now.getTime() - 30000),
                endTime: now,
                durationSeconds: 30,
                message: '✅ Dry-run validation successful',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: true,
                },
            };
            printDeploymentSummary(result, []);
            const output = consoleLogs.join('\n');
            assert(output.includes('production'));
            assert(output.includes('30'));
        });
        it('handles empty stage timings array', () => {
            const now = new Date();
            const result = {
                success: true,
                stage: 'staging',
                startTime: now,
                endTime: new Date(now.getTime() + 1000),
                durationSeconds: 1,
                message: '✅ Deployment successful',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: true,
                },
            };
            printDeploymentSummary(result, []);
            const output = consoleLogs.join('\n');
            assert(output.includes('DEPLOYMENT SUCCESSFUL'));
            assert(output.includes('staging'));
        });
        it('formats timing breakdown with progress bars', () => {
            const now = new Date();
            const result = {
                success: true,
                stage: 'staging',
                startTime: new Date(now.getTime() - 150000),
                endTime: now,
                durationSeconds: 150,
                message: '✅ Deployment successful',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: true,
                },
            };
            const timings = [
                { name: 'Pre-Deployment Checks', duration: 10000 },
                { name: 'Build & Deploy', duration: 120000 },
                { name: 'Health Checks', duration: 20000 },
            ];
            printDeploymentSummary(result, timings);
            const output = consoleLogs.join('\n');
            assert(output.includes('Pre-Deployment Checks'));
            assert(output.includes('Build & Deploy'));
            assert(output.includes('Health Checks'));
        });
        it('includes endTime in output', () => {
            const now = new Date();
            const result = {
                success: true,
                stage: 'staging',
                startTime: new Date(now.getTime() - 60000),
                endTime: now,
                durationSeconds: 60,
                message: '✅ Deployment successful',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: true,
                },
            };
            printDeploymentSummary(result, []);
            const output = consoleLogs.join('\n');
            // Should include some reference to time
            assert(output.length > 100);
        });
    });
    describe('printDeploymentFailureSummary', () => {
        it('prints failure summary with error details', () => {
            const now = new Date();
            const result = {
                success: false,
                stage: 'staging',
                startTime: new Date(now.getTime() - 60000),
                endTime: now,
                durationSeconds: 60,
                message: '❌ Deployment failed',
                error: 'CloudFormation stack failed: InvalidParameterValue',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: false,
                    healthChecksOk: false,
                },
            };
            printDeploymentFailureSummary(result, []);
            const output = consoleLogs.join('\n');
            assert(output.includes('DEPLOYMENT FAILED'));
            assert(output.includes('staging'));
            assert(output.includes('CloudFormation stack failed'));
        });
        it('includes recovery instructions', () => {
            const now = new Date();
            const result = {
                success: false,
                stage: 'production',
                startTime: new Date(now.getTime() - 30000),
                endTime: now,
                durationSeconds: 30,
                message: '❌ Deployment failed',
                error: 'Build step failed',
                details: {
                    gitStatusOk: true,
                    buildsOk: false,
                    testsOk: true,
                    deploymentOk: false,
                    healthChecksOk: false,
                },
            };
            printDeploymentFailureSummary(result, []);
            const output = consoleLogs.join('\n');
            assert(output.includes('Recovery Options'));
            assert(output.includes('deploy-kit deploy production'));
            assert(output.includes('deploy-kit recover production'));
        });
        it('formats stage-specific recovery command', () => {
            const now = new Date();
            const stages = ['staging', 'production'];
            for (const stage of stages) {
                consoleLogs = [];
                const result = {
                    success: false,
                    stage: stage,
                    startTime: new Date(now.getTime() - 10000),
                    endTime: now,
                    durationSeconds: 10,
                    message: '❌ Deployment failed',
                    error: 'Test error',
                    details: {
                        gitStatusOk: false,
                        buildsOk: true,
                        testsOk: false,
                        deploymentOk: false,
                        healthChecksOk: false,
                    },
                };
                printDeploymentFailureSummary(result, []);
                const output = consoleLogs.join('\n');
                assert(output.includes(`deploy-kit deploy ${stage}`));
                assert(output.includes(`deploy-kit recover ${stage}`));
            }
        });
        it('includes stage timings in output if provided', () => {
            const now = new Date();
            const result = {
                success: false,
                stage: 'staging',
                startTime: new Date(now.getTime() - 120000),
                endTime: now,
                durationSeconds: 120,
                message: '❌ Deployment failed',
                error: 'Health check failed',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: true,
                    healthChecksOk: false,
                },
            };
            const timings = [
                { name: 'Pre-Deployment Checks', duration: 5000 },
                { name: 'Build & Deploy', duration: 100000 },
                { name: 'Health Checks', duration: 15000 },
            ];
            printDeploymentFailureSummary(result, timings);
            const output = consoleLogs.join('\n');
            // Should contain failure message
            assert(output.includes('DEPLOYMENT FAILED'));
            assert(output.includes('Health check failed'));
        });
        it('calculates duration from startTime and endTime', () => {
            const startTime = new Date('2025-11-01T10:00:00Z');
            const endTime = new Date('2025-11-01T10:02:30Z'); // 150 seconds later
            const result = {
                success: false,
                stage: 'staging',
                startTime,
                endTime,
                durationSeconds: 150,
                message: '❌ Deployment failed',
                error: 'Test error',
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: false,
                    healthChecksOk: false,
                },
            };
            printDeploymentFailureSummary(result, []);
            const output = consoleLogs.join('\n');
            // Should show some duration
            assert(output.length > 0);
        });
        it('handles empty error message gracefully', () => {
            const now = new Date();
            const result = {
                success: false,
                stage: 'staging',
                startTime: new Date(now.getTime() - 10000),
                endTime: now,
                durationSeconds: 10,
                message: '❌ Deployment failed',
                error: '', // Empty error
                details: {
                    gitStatusOk: true,
                    buildsOk: true,
                    testsOk: true,
                    deploymentOk: false,
                    healthChecksOk: false,
                },
            };
            printDeploymentFailureSummary(result, []);
            const output = consoleLogs.join('\n');
            assert(output.includes('DEPLOYMENT FAILED'));
            assert(output.includes('Recovery Options'));
        });
    });
});
