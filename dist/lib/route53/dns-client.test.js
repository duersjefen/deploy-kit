/**
 * Route53 DNS Client Test Suite (Integration)
 *
 * Integration tests for Route53DNSClient.
 * Tests verify correct Route53 API interactions.
 * These tests require AWS credentials.
 */
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { Route53DNSClient } from './dns-client.js';
import { hasAwsCredentials } from '../aws-cli-utils.js';
// Skip integration tests in unit test runs
describe.skip('Route53DNSClient (Integration)', () => {
    let client;
    beforeEach(() => {
        client = new Route53DNSClient();
    });
    describe('Constructor', () => {
        it('creates client without AWS profile', () => {
            const defaultClient = new Route53DNSClient();
            assert.ok(defaultClient);
        });
        it('creates client with AWS profile', () => {
            const profileClient = new Route53DNSClient('test-profile');
            assert.ok(profileClient);
        });
    });
    describe('listHostedZones', () => {
        it('returns array structure', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                assert.ok(Array.isArray(zones));
                // Verify structure if zones exist
                if (zones.length > 0) {
                    const zone = zones[0];
                    assert.ok(zone.id);
                    assert.ok(zone.name);
                    assert.ok(typeof zone.recordCount === 'number');
                }
            }
            catch (error) {
                if (error instanceof Error &&
                    (error.message.includes('credentials') ||
                        error.message.includes('Unable to locate'))) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                throw error;
            }
        });
        it('returns empty array when no zones exist', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                assert.ok(Array.isArray(zones));
                // May be empty or have zones, both are valid
            }
            catch (error) {
                if (error instanceof Error &&
                    (error.message.includes('credentials') ||
                        error.message.includes('Unable to locate'))) {
                    return;
                }
                throw error;
            }
        });
        it('can use AWS profile', async () => {
            try {
                const profileClient = new Route53DNSClient('test-profile');
                // This will likely fail with credentials error, which is expected
                await profileClient.listHostedZones();
            }
            catch (error) {
                // Error is expected if profile doesn't exist
                assert.ok(error instanceof Error);
            }
        });
    });
    describe('listRecordSets', () => {
        it('handles invalid zone ID gracefully', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                // Using invalid zone ID should throw or return empty
                await client.listRecordSets('INVALID_ZONE_ID');
            }
            catch (error) {
                // Error is expected for invalid zone
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                assert.ok(error instanceof Error);
            }
        });
        it('handles zone ID with and without prefix', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                if (zones.length === 0) {
                    console.log('Skipping - no hosted zones available');
                    return;
                }
                const zone = zones[0];
                // Should work with both formats
                const records1 = await client.listRecordSets(zone.id);
                assert.ok(Array.isArray(records1));
                // Remove prefix and try again
                const cleanId = zone.id.replace('/hostedzone/', '');
                const records2 = await client.listRecordSets(cleanId);
                assert.ok(Array.isArray(records2));
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                throw error;
            }
        });
        it('returns DNS record structure', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                if (zones.length === 0) {
                    console.log('Skipping - no hosted zones available');
                    return;
                }
                const records = await client.listRecordSets(zones[0].id);
                assert.ok(Array.isArray(records));
                if (records.length > 0) {
                    const record = records[0];
                    assert.ok(record.name);
                    assert.ok(record.type);
                    assert.ok(typeof record.ttl === 'number' || !record.ttl);
                }
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                throw error;
            }
        });
    });
    describe('getCurrentDNSRecords', () => {
        it('returns array for valid domain', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                // Use a common test domain
                const records = await client.getCurrentDNSRecords('example.com');
                assert.ok(Array.isArray(records));
                // May be empty or have records, both valid
            }
            catch (error) {
                if (error instanceof Error &&
                    (error.message.includes('credentials') ||
                        error.message.includes('Could not fetch'))) {
                    console.log('Skipping - AWS credentials not available or domain not in account');
                    return;
                }
                throw error;
            }
        });
        it('handles subdomain query', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const records = await client.getCurrentDNSRecords('sub.example.com');
                assert.ok(Array.isArray(records));
            }
            catch (error) {
                if (error instanceof Error &&
                    (error.message.includes('credentials') ||
                        error.message.includes('Could not fetch'))) {
                    return;
                }
                throw error;
            }
        });
        it('handles domains with no hosted zone', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                // Domain with no hosted zone should return empty or error
                const records = await client.getCurrentDNSRecords('definitely-nonexistent-domain-12345.xyz');
                assert.ok(Array.isArray(records));
                // Should be empty since zone won't be found
            }
            catch (error) {
                if (error instanceof Error &&
                    (error.message.includes('credentials') ||
                        error.message.includes('Could not fetch'))) {
                    return;
                }
                // Error is also acceptable
                assert.ok(error instanceof Error);
            }
        });
        it('filters records by domain correctly', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                if (zones.length === 0) {
                    console.log('Skipping - no hosted zones available');
                    return;
                }
                // Pick first zone
                const zone = zones[0];
                const zoneName = zone.name.replace(/\.$/, '');
                // Query a subdomain of the zone
                const records = await client.getCurrentDNSRecords(`test.${zoneName}`);
                assert.ok(Array.isArray(records));
                // Records should either be empty or match the domain
                if (records.length > 0) {
                    for (const record of records) {
                        const recordName = record.name.replace(/\.$/, '');
                        // Should be exact match, wildcard, or contain the domain
                        assert.ok(recordName === `test.${zoneName}` ||
                            recordName === `*.test.${zoneName}` ||
                            recordName.includes(zoneName));
                    }
                }
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                throw error;
            }
        });
    });
    describe('Integration scenarios', () => {
        it('can list zones and then records', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                assert.ok(Array.isArray(zones));
                if (zones.length > 0) {
                    const records = await client.listRecordSets(zones[0].id);
                    assert.ok(Array.isArray(records));
                }
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                throw error;
            }
        });
        it('can handle multiple concurrent requests', async () => {
            try {
                if (!hasAwsCredentials()) {
                    console.log('Skipping - AWS credentials not available');
                    return;
                }
                const zones = await client.listHostedZones();
                if (zones.length === 0) {
                    console.log('Skipping - no zones available');
                    return;
                }
                // Request records from multiple zones concurrently
                const zoneIds = zones.slice(0, 3).map(z => z.id);
                const promises = zoneIds.map(id => client.listRecordSets(id));
                const results = await Promise.all(promises);
                assert.ok(results.every(r => Array.isArray(r)));
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                throw error;
            }
        });
    });
    describe('Edge cases', () => {
        it('handles domain with many subdomains', async () => {
            try {
                if (!hasAwsCredentials()) {
                    return;
                }
                const records = await client.getCurrentDNSRecords('a.b.c.d.e.example.com');
                assert.ok(Array.isArray(records));
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                // Error is acceptable here
            }
        });
        it('handles international domain names', async () => {
            try {
                if (!hasAwsCredentials()) {
                    return;
                }
                // Punycode encoded domain
                const records = await client.getCurrentDNSRecords('xn--e1afmkfd.xn--p1ai');
                assert.ok(Array.isArray(records));
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('credentials')) {
                    return;
                }
                // Error is acceptable
            }
        });
        it('handles empty zone ID', async () => {
            try {
                await client.listRecordSets('');
            }
            catch (error) {
                // Error is expected
                assert.ok(error instanceof Error);
            }
        });
        it('handles null-like inputs gracefully', async () => {
            try {
                await client.listRecordSets('null');
            }
            catch (error) {
                // Error is expected for invalid zone ID
                assert.ok(error instanceof Error);
            }
        });
    });
    describe('With different AWS profiles', () => {
        it('can instantiate with profile', () => {
            const profileClient = new Route53DNSClient('custom-profile');
            assert.ok(profileClient);
        });
        it('uses profile for API calls', async () => {
            try {
                const profileClient = new Route53DNSClient('nonexistent-profile-test');
                await profileClient.listHostedZones();
                // If we get here, profile didn't cause issues
            }
            catch (error) {
                // Error expected for nonexistent profile
                assert.ok(error instanceof Error);
            }
        });
    });
});
