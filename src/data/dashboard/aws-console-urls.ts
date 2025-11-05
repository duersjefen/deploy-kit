/**
 * AWS Console URL Generators (Pure Functions - No I/O)
 * Generate deep links to AWS Console for various resource types
 *
 * All functions are pure - same inputs always produce same outputs.
 */

/**
 * AWS regions and their console endpoints
 */
export const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
] as const;

export type AwsRegion = typeof AWS_REGIONS[number];

/**
 * Parse ARN to extract resource information
 */
export interface ParsedArn {
  partition: string;
  service: string;
  region: string;
  accountId: string;
  resourceType?: string;
  resourceId: string;
  qualifier?: string;
}

/**
 * Parse AWS ARN (pure function)
 * Format: arn:partition:service:region:account-id:resource-type/resource-id
 * or: arn:partition:service:region:account-id:resource-type:resource-id
 */
export function parseArn(arn: string): ParsedArn | null {
  const arnPattern = /^arn:([^:]+):([^:]+):([^:]*):([^:]*):(.+)$/;
  const match = arn.match(arnPattern);

  if (!match) {
    return null;
  }

  const [, partition, service, region, accountId, resource] = match;

  // Parse resource part (can be "type/id" or "type:id")
  let resourceType: string | undefined;
  let resourceId: string;
  let qualifier: string | undefined;

  if (resource.includes('/')) {
    const parts = resource.split('/');
    resourceType = parts[0];
    resourceId = parts.slice(1).join('/');
  } else if (resource.includes(':')) {
    const parts = resource.split(':');
    resourceType = parts[0];
    resourceId = parts[1];
    qualifier = parts[2];
  } else {
    resourceId = resource;
  }

  return {
    partition,
    service,
    region,
    accountId,
    resourceType,
    resourceId,
    qualifier,
  };
}

/**
 * Generate Lambda function console URL
 */
export function getLambdaConsoleUrl(
  functionName: string,
  region: string = 'us-east-1'
): string {
  const encodedName = encodeURIComponent(functionName);
  return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${encodedName}`;
}

/**
 * Generate Lambda function console URL from ARN
 */
export function getLambdaConsoleUrlFromArn(arn: string): string | null {
  const parsed = parseArn(arn);
  if (!parsed || parsed.service !== 'lambda') {
    return null;
  }

  return getLambdaConsoleUrl(parsed.resourceId, parsed.region);
}

/**
 * Generate S3 bucket console URL
 */
export function getS3ConsoleUrl(
  bucketName: string,
  region: string = 'us-east-1',
  prefix?: string
): string {
  const encodedBucket = encodeURIComponent(bucketName);
  const baseUrl = `https://s3.console.aws.amazon.com/s3/buckets/${encodedBucket}`;

  if (prefix) {
    const encodedPrefix = encodeURIComponent(prefix);
    return `${baseUrl}?region=${region}&prefix=${encodedPrefix}`;
  }

  return `${baseUrl}?region=${region}`;
}

/**
 * Generate DynamoDB table console URL
 */
export function getDynamoDBConsoleUrl(
  tableName: string,
  region: string = 'us-east-1'
): string {
  const encodedTable = encodeURIComponent(tableName);
  return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${encodedTable}`;
}

/**
 * Generate CloudFront distribution console URL
 */
export function getCloudFrontConsoleUrl(distributionId: string): string {
  return `https://console.aws.amazon.com/cloudfront/v3/home#/distributions/${distributionId}`;
}

/**
 * Generate API Gateway console URL
 */
export function getApiGatewayConsoleUrl(
  apiId: string,
  region: string = 'us-east-1',
  type: 'rest' | 'http' | 'websocket' = 'rest'
): string {
  const apiType = type === 'rest' ? 'apis' : type === 'http' ? 'http-apis' : 'websocket-apis';
  return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/${apiType}/${apiId}`;
}

/**
 * Generate CloudWatch Logs console URL
 */
export function getCloudWatchLogsConsoleUrl(
  logGroupName: string,
  region: string = 'us-east-1',
  logStreamName?: string
): string {
  const encodedGroup = encodeURIComponent(logGroupName);
  const baseUrl = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodedGroup}`;

  if (logStreamName) {
    const encodedStream = encodeURIComponent(logStreamName);
    return `${baseUrl}/log-events/${encodedStream}`;
  }

  return baseUrl;
}

/**
 * Generate IAM role console URL
 */
export function getIAMRoleConsoleUrl(roleName: string): string {
  const encodedRole = encodeURIComponent(roleName);
  return `https://console.aws.amazon.com/iam/home#/roles/${encodedRole}`;
}

/**
 * Generate EC2 instance console URL
 */
export function getEC2ConsoleUrl(
  instanceId: string,
  region: string = 'us-east-1'
): string {
  return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#Instances:instanceId=${instanceId}`;
}

/**
 * Generate RDS instance console URL
 */
export function getRDSConsoleUrl(
  instanceIdentifier: string,
  region: string = 'us-east-1'
): string {
  return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${instanceIdentifier}`;
}

/**
 * Generate console URL from ARN (generic)
 */
export function getConsoleUrlFromArn(arn: string): string | null {
  const parsed = parseArn(arn);
  if (!parsed) {
    return null;
  }

  switch (parsed.service) {
    case 'lambda':
      return getLambdaConsoleUrl(parsed.resourceId, parsed.region);

    case 's3':
      return getS3ConsoleUrl(parsed.resourceId, parsed.region);

    case 'dynamodb':
      if (parsed.resourceType === 'table') {
        return getDynamoDBConsoleUrl(parsed.resourceId, parsed.region);
      }
      return null;

    case 'apigateway':
      return getApiGatewayConsoleUrl(parsed.resourceId, parsed.region);

    case 'logs':
      if (parsed.resourceType === 'log-group') {
        return getCloudWatchLogsConsoleUrl(parsed.resourceId, parsed.region);
      }
      return null;

    case 'iam':
      if (parsed.resourceType === 'role') {
        return getIAMRoleConsoleUrl(parsed.resourceId);
      }
      return null;

    case 'ec2':
      if (parsed.resourceType === 'instance') {
        return getEC2ConsoleUrl(parsed.resourceId, parsed.region);
      }
      return null;

    case 'rds':
      if (parsed.resourceType === 'db') {
        return getRDSConsoleUrl(parsed.resourceId, parsed.region);
      }
      return null;

    case 'cloudfront':
      if (parsed.resourceType === 'distribution') {
        return getCloudFrontConsoleUrl(parsed.resourceId);
      }
      return null;

    default:
      return null;
  }
}

/**
 * Extract region from ARN
 */
export function getRegionFromArn(arn: string): string | null {
  const parsed = parseArn(arn);
  return parsed?.region || null;
}

/**
 * Extract account ID from ARN
 */
export function getAccountIdFromArn(arn: string): string | null {
  const parsed = parseArn(arn);
  return parsed?.accountId || null;
}

/**
 * Check if string is a valid ARN
 */
export function isValidArn(str: string): boolean {
  return /^arn:[^:]+:[^:]+:[^:]*:[^:]*:.+$/.test(str);
}

/**
 * Generate SST Console URL for project
 */
export function getSstConsoleUrl(
  workspaceSlug: string,
  appName: string,
  stage: string
): string {
  return `https://console.sst.dev/${workspaceSlug}/${appName}/${stage}`;
}
