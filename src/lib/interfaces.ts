/**
 * Interface definitions for dependency injection and extensibility
 */

import type { DNSRecord } from '../types.js';

/**
 * CloudFront service interface for managing distributions and cache invalidation
 */
export interface ICloudFrontService {
  /**
   * List all CloudFront distributions
   */
  listDistributions(): Promise<
    Array<{
      id: string;
      domainName: string;
      status: string;
      enabled: boolean;
    }>
  >;

  /**
   * Get details of a specific CloudFront distribution
   */
  getDistribution(id: string): Promise<{
    id: string;
    domainName: string;
    origins: Array<{ domainName: string }>;
  }>;

  /**
   * Invalidate CloudFront cache for specific paths
   */
  invalidateCache(
    distributionId: string,
    paths: string[]
  ): Promise<{
    invalidationId: string;
    status: string;
  }>;
}

/**
 * Route53 service interface for DNS record management
 */
export interface IRoute53Service {
  /**
   * List all hosted zones in the account
   */
  listHostedZones(): Promise<
    Array<{
      id: string;
      name: string;
      recordCount: number;
    }>
  >;

  /**
   * List all record sets in a hosted zone
   */
  listRecordSets(hostedZoneId: string): Promise<DNSRecord[]>;

  /**
   * Get DNS records for a specific domain
   */
  getDNSRecordsForDomain(domain: string): Promise<DNSRecord[]>;
}

/**
 * Deployment service interface for executing deployments
 */
export interface IDeploymentService {
  /**
   * Execute the deployment
   */
  deploy(): Promise<void>;

  /**
   * Verify health of deployed service
   */
  verifyHealth(): Promise<boolean>;

  /**
   * Rollback to previous deployment (optional)
   */
  rollback?(): Promise<void>;
}
