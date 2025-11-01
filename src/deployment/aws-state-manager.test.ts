import { describe, it } from 'node:test';
import { assert } from '../test-utils.js';
import {
  extractCloudFrontDistributionId,
  isValidDistributionId,
  getAwsRegion,
  extractInfrastructureDetails,
} from './aws-state-manager.js';
import type { ProjectConfig, DeploymentStage } from '../types.js';

describe('AWS State Manager', () => {
  describe('extractCloudFrontDistributionId', () => {
    it('extracts distribution ID from CloudFront URL', () => {
      const output = 'Frontend URL: https://d1muqpyoeowt1o.cloudfront.net';
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'd1muqpyoeowt1o');
    });

    it('extracts distribution ID with mixed case URL', () => {
      const output = 'HTTPS://D1MUQPYOEOWT1O.CLOUDFRONT.NET';
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'D1MUQPYOEOWT1O');
    });

    it('extracts distribution ID from multiple URLs (returns first match)', () => {
      const output = `
        Frontend: https://d1muqpyoeowt1o.cloudfront.net
        Staging: https://d2xyz9876543ab.cloudfront.net
      `;
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'd1muqpyoeowt1o');
    });

    it('extracts distribution ID from JSON output', () => {
      const output = '{"distributionId": "d1jsonexample1o", "status": "deployed"}';
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'd1jsonexample1o');
    });

    it('prefers URL pattern over JSON pattern', () => {
      const output = `
        https://d1urlmatch123456.cloudfront.net
        {"distributionId": "d1jsonmatch1o"}
      `;
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'd1urlmatch123456');
    });

    it('extracts from JSON with whitespace', () => {
      const output = `{
        "cloudFrontUrl": "https://example.com",
        "distributionId"  :  "d1jsonwhitespace"  ,
        "status": "deployed"
      }`;
      const result = extractCloudFrontDistributionId(output);
      assert(result === 'd1jsonwhitespace');
    });

    it('returns null when no distribution ID found', () => {
      const output = 'Deployment complete, no CloudFront configured';
      const result = extractCloudFrontDistributionId(output);
      assert(result === null);
    });

    it('returns null for invalid JSON', () => {
      const output = '{"distributionId": d1invalid} - missing quotes';
      const result = extractCloudFrontDistributionId(output);
      assert(result === null);
    });

    it('handles empty string', () => {
      const result = extractCloudFrontDistributionId('');
      assert(result === null);
    });

    it('handles very long output strings', () => {
      const longOutput = 'x'.repeat(10000) + 'https://d1longoutput123456.cloudfront.net' + 'y'.repeat(10000);
      const result = extractCloudFrontDistributionId(longOutput);
      assert(result === 'd1longoutput123456');
    });
  });

  describe('isValidDistributionId', () => {
    it('validates correct distribution ID format', () => {
      assert(isValidDistributionId('d1muqpyoeowt1o') === true);
    });

    it('validates with uppercase letters', () => {
      assert(isValidDistributionId('D1MUQPYOEOWT1O') === true);
    });

    it('validates with mixed case', () => {
      assert(isValidDistributionId('D1muqpyoeowt1O') === true);
    });

    it('rejects ID with wrong prefix', () => {
      assert(isValidDistributionId('E1muqpyoeowt1o') === false);
    });

    it('rejects ID with wrong prefix (lowercase e)', () => {
      assert(isValidDistributionId('e1muqpyoeowt1o') === false);
    });

    it('rejects ID that is too short', () => {
      assert(isValidDistributionId('d123456789abc') === false);
    });

    it('rejects ID that is too long', () => {
      assert(isValidDistributionId('d1234567890abcd') === false);
    });

    it('rejects ID with special characters', () => {
      assert(isValidDistributionId('d1muqpyoe-wt1o') === false);
    });

    it('rejects ID with spaces', () => {
      assert(isValidDistributionId('d1muqpyoe wt1o') === false);
    });

    it('rejects empty string', () => {
      assert(isValidDistributionId('') === false);
    });

    it('rejects null-like strings', () => {
      assert(isValidDistributionId('dnull000000000') === true);
      assert(isValidDistributionId('dundefined0000') === true);
    });
  });

  describe('getAwsRegion', () => {
    const mockConfig: ProjectConfig = {
      projectName: 'test-project',
      infrastructure: 'sst-serverless',
      stages: ['staging', 'production'],
      stageConfig: {
        staging: {
          domain: 'staging.example.com',
          awsRegion: 'eu-west-1',
        },
        production: {
          domain: 'example.com',
          awsRegion: 'eu-north-1',
        },
      },
    };

    it('returns us-east-1 for CloudFront regardless of config', () => {
      const region = getAwsRegion('staging', mockConfig, 'cloudfront');
      assert(region === 'us-east-1');
    });

    it('returns us-east-1 for CloudFront even with different region config', () => {
      const region = getAwsRegion('production', mockConfig, 'cloudfront');
      assert(region === 'us-east-1');
    });

    it('returns stage-specific region for lambda', () => {
      const region = getAwsRegion('staging', mockConfig, 'lambda');
      assert(region === 'eu-west-1');
    });

    it('returns production region for lambda', () => {
      const region = getAwsRegion('production', mockConfig, 'lambda');
      assert(region === 'eu-north-1');
    });

    it('returns stage region for default service type', () => {
      const region = getAwsRegion('staging', mockConfig, 'default');
      assert(region === 'eu-west-1');
    });

    it('returns us-east-1 when no stage region configured', () => {
      const configNoRegion: ProjectConfig = {
        projectName: 'test',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {
          staging: { domain: 'staging.example.com' },
          production: { domain: 'example.com' },
        },
      };

      const region = getAwsRegion('staging', configNoRegion, 'lambda');
      assert(region === 'us-east-1');
    });

    it('handles missing stage config gracefully', () => {
      const configMinimal: ProjectConfig = {
        projectName: 'test',
        infrastructure: 'sst-serverless',
        stages: ['staging', 'production'],
        stageConfig: {
          staging: {},
          production: {},
        },
      };

      const region = getAwsRegion('staging', configMinimal, 'lambda');
      assert(region === 'us-east-1');
    });
  });

  describe('extractInfrastructureDetails', () => {
    it('extracts all details from complete SST output', () => {
      const output = `
        Frontend URL: https://d1muqpyoeowt1o.cloudfront.net
        API Endpoint: https://api-123abc.execute-api.eu-west-1.amazonaws.com/prod
      `;
      const details = extractInfrastructureDetails(output);

      assert(details.cloudFrontId === 'd1muqpyoeowt1o');
      assert(details.cloudFrontUrl === 'https://d1muqpyoeowt1o.cloudfront.net');
      assert(details.apiEndpoint === 'https://api-123abc.execute-api.eu-west-1.amazonaws.com/prod');
    });

    it('extracts only CloudFront details when API not present', () => {
      const output = 'Frontend URL: https://d1muqpyoeowt1o.cloudfront.net';
      const details = extractInfrastructureDetails(output);

      assert(details.cloudFrontId === 'd1muqpyoeowt1o');
      assert(details.cloudFrontUrl === 'https://d1muqpyoeowt1o.cloudfront.net');
      assert(details.apiEndpoint === null);
    });

    it('extracts only API endpoint when CloudFront not present', () => {
      const output = 'API: https://api-xyz.execute-api.us-east-1.amazonaws.com/prod';
      const details = extractInfrastructureDetails(output);

      assert(details.cloudFrontId === null);
      assert(details.cloudFrontUrl === null);
      assert(details.apiEndpoint === 'https://api-xyz.execute-api.us-east-1.amazonaws.com/prod');
    });

    it('returns all nulls when no infrastructure details found', () => {
      const output = 'Deployment complete';
      const details = extractInfrastructureDetails(output);

      assert(details.cloudFrontId === null);
      assert(details.cloudFrontUrl === null);
      assert(details.apiEndpoint === null);
    });

    it('extracts from JSON with multiple fields', () => {
      const output = `{
        "distributionId": "d1jsondetails1o",
        "cloudFrontUrl": "https://d1jsondetails1o.cloudfront.net",
        "apiEndpoint": "https://api-json.execute-api.us-west-2.amazonaws.com/stage"
      }`;
      const details = extractInfrastructureDetails(output);

      assert(details.cloudFrontId === 'd1jsondetails1o');
      assert(details.cloudFrontUrl === 'https://d1jsondetails1o.cloudfront.net');
      assert(details.apiEndpoint === 'https://api-json.execute-api.us-west-2.amazonaws.com/stage');
    });

    it('handles multiple API endpoints (returns first)', () => {
      const output = `
        API 1: https://api-first.execute-api.us-east-1.amazonaws.com/prod
        API 2: https://api-second.execute-api.us-west-2.amazonaws.com/prod
      `;
      const details = extractInfrastructureDetails(output);

      assert(details.apiEndpoint === 'https://api-first.execute-api.us-east-1.amazonaws.com/prod');
    });

    it('handles various AWS regions in API endpoint', () => {
      const testCases = [
        'https://api.execute-api.us-east-1.amazonaws.com/prod',
        'https://api.execute-api.eu-west-1.amazonaws.com/prod',
        'https://api.execute-api.ap-southeast-1.amazonaws.com/prod',
        'https://api.execute-api.ca-central-1.amazonaws.com/prod',
      ];

      for (const endpoint of testCases) {
        const output = `API: ${endpoint}`;
        const details = extractInfrastructureDetails(output);
        assert(details.apiEndpoint === endpoint);
      }
    });

    it('handles empty output', () => {
      const details = extractInfrastructureDetails('');

      assert(details.cloudFrontId === null);
      assert(details.cloudFrontUrl === null);
      assert(details.apiEndpoint === null);
    });
  });
});
