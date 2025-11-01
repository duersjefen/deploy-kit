import { describe, it } from 'node:test';
import { extractRootDomain, validateDomain, extractSubdomain } from './domain-utils.js';
import { assert, assertThrows } from '../test-utils.js';

describe('Domain Utilities', () => {
  describe('extractRootDomain', () => {
    it('extracts root domain from subdomain', () => {
      assert(extractRootDomain('staging.example.com') === 'example.com');
      assert(extractRootDomain('api.staging.example.com') === 'example.com');
    });

    it('returns domain if already root', () => {
      assert(extractRootDomain('example.com') === 'example.com');
    });

    it('handles multi-level subdomains', () => {
      assert(extractRootDomain('a.b.c.example.com') === 'example.com');
    });
  });

  describe('validateDomain', () => {
    it('validates well-formed domains', () => {
      validateDomain('example.com'); // Should not throw
      validateDomain('staging.example.com'); // Should not throw
      validateDomain('api-staging.example.com'); // Should not throw
    });

    it('throws on invalid domains', () => {
      assertThrows(() => validateDomain(''));
      assertThrows(() => validateDomain('not a domain'));
      assertThrows(() => validateDomain('no-tld'));
    });

    it('validates domains with numbers', () => {
      validateDomain('api1.example.com'); // Should not throw
      validateDomain('example123.com'); // Should not throw
    });
  });

  describe('extractSubdomain', () => {
    it('extracts subdomain correctly', () => {
      assert(extractSubdomain('staging.example.com', 'example.com') === 'staging');
      assert(extractSubdomain('api.staging.example.com', 'example.com') === 'api.staging');
    });

    it('returns empty string for root domain', () => {
      assert(extractSubdomain('example.com', 'example.com') === '');
    });

    it('handles single-level subdomains', () => {
      assert(extractSubdomain('www.example.com', 'example.com') === 'www');
    });
  });
});
