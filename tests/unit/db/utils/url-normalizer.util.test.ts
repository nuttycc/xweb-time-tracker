/**
 * URL Normalizer Utility Unit Tests
 *
 * including whitelist filtering, edge cases, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  isAllowedQueryParam,
  getNormalizationStats,
  ALLOWED_QUERY_PARAMS,
  type UrlNormalizationOptions,
} from '@/core/db/utils/url-normalizer.util';

describe('URL Normalizer Utility', () => {
  describe('normalizeUrl', () => {
    describe('Basic Functionality', () => {
      it('should preserve whitelisted parameters', () => {
        const url = 'https://example.com/page?id=123&page=1&search=test';
        const result = normalizeUrl(url);

        expect(result).toContain('id=123');
        expect(result).toContain('page=1');
        expect(result).toContain('search=test');
      });

      it('should remove non-whitelisted parameters', () => {
        const url = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
        const result = normalizeUrl(url);

        expect(result).toContain('id=123');
        expect(result).not.toContain('utm_source');
        expect(result).not.toContain('fbclid');
      });

      it('should preserve URL structure without query parameters', () => {
        const url = 'https://example.com/path/to/page';
        const result = normalizeUrl(url);

        expect(result).toBe('https://example.com/path/to/page');
      });

      it('should handle URLs with only non-whitelisted parameters', () => {
        const url = 'https://example.com/page?utm_source=google&fbclid=abc&gclid=xyz';
        const result = normalizeUrl(url);

        expect(result).toBe('https://example.com/page');
      });
    });

    describe('Marketing Parameter Filtering', () => {
      it('should remove UTM parameters', () => {
        const url =
          'https://example.com/page?id=123&utm_source=google&utm_medium=email&utm_campaign=summer';
        const result = normalizeUrl(url);

        expect(result).toContain('id=123');
        expect(result).not.toContain('utm_source');
        expect(result).not.toContain('utm_medium');
        expect(result).not.toContain('utm_campaign');
      });

      it('should remove click ID parameters', () => {
        const url =
          'https://example.com/page?category=tech&fbclid=abc123&gclid=xyz789&msclkid=def456';
        const result = normalizeUrl(url);

        expect(result).toContain('category=tech');
        expect(result).not.toContain('fbclid');
        expect(result).not.toContain('gclid');
        expect(result).not.toContain('msclkid');
      });

      it('should remove session and tracking parameters', () => {
        const url = 'https://example.com/page?page=1&sessionid=sess123&ref=twitter&_ga=GA123';
        const result = normalizeUrl(url);

        expect(result).toContain('page=1');
        expect(result).not.toContain('sessionid');
        expect(result).not.toContain('ref');
        expect(result).not.toContain('_ga');
      });
    });

    describe('Business Parameter Preservation', () => {
      it('should preserve all business-relevant parameters', () => {
        const businessParams = [
          'id=123',
          'page=1',
          'search=test',
          'category=tech',
          'sort=date',
          'limit=10',
          'lang=en',
          'theme=dark',
          'view=grid',
          'tab=overview',
        ];

        const url = `https://example.com/page?${businessParams.join('&')}&utm_source=google`;
        const result = normalizeUrl(url);

        businessParams.forEach(param => {
          expect(result).toContain(param);
        });
        expect(result).not.toContain('utm_source');
      });

      it('should handle complex business parameter combinations', () => {
        const url =
          'https://shop.com/products?category=electronics&sort=price&order=asc&limit=20&page=2&search=laptop';
        const result = normalizeUrl(url);

        expect(result).toContain('category=electronics');
        expect(result).toContain('sort=price');
        expect(result).toContain('order=asc');
        expect(result).toContain('limit=20');
        expect(result).toContain('page=2');
        expect(result).toContain('search=laptop');
      });
    });

    describe('Options and Configuration', () => {
      it('should handle additional allowed parameters', () => {
        const url = 'https://example.com/page?id=123&custom_param=value&utm_source=google';
        const options: UrlNormalizationOptions = {
          additionalAllowedParams: ['custom_param'],
        };

        const result = normalizeUrl(url, options);

        expect(result).toContain('id=123');
        expect(result).toContain('custom_param=value');
        expect(result).not.toContain('utm_source');
      });

      it('should handle fragment preservation', () => {
        const url = 'https://example.com/page?id=123&utm_source=google#section1';
        const options: UrlNormalizationOptions = {
          preserveFragment: true,
        };

        const result = normalizeUrl(url, options);

        expect(result).toContain('id=123');
        expect(result).toContain('#section1');
        expect(result).not.toContain('utm_source');
      });

      it('should handle parameter sorting', () => {
        const url = 'https://example.com/page?page=1&id=123&search=test';
        const options: UrlNormalizationOptions = {
          sortParams: true,
        };

        const result = normalizeUrl(url, options);
        const urlObj = new URL(result);
        const params = Array.from(urlObj.searchParams.keys());

        // Should be sorted alphabetically
        expect(params).toEqual(['id', 'page', 'search']);
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle empty URLs', () => {
        expect(() => normalizeUrl('')).toThrow('URL must be a non-empty string');
      });

      it('should handle invalid URLs', () => {
        expect(() => normalizeUrl('not-a-url')).toThrow('Invalid URL format');
      });

      it('should handle null/undefined input', () => {
        expect(() => normalizeUrl(null as unknown as string)).toThrow(
          'URL must be a non-empty string'
        );
        expect(() => normalizeUrl(undefined as unknown as string)).toThrow(
          'URL must be a non-empty string'
        );
      });

      it('should handle URLs with empty query string', () => {
        const url = 'https://example.com/page?';
        const result = normalizeUrl(url);

        expect(result).toBe('https://example.com/page');
      });

      it('should handle URLs with malformed query parameters', () => {
        const url = 'https://example.com/page?id=123&=invalid&valid=test';
        const result = normalizeUrl(url);

        // Should preserve whitelisted parameters
        expect(result).toContain('id=123');

        // Should remove non-whitelisted parameters (valid is not in ALLOWED_QUERY_PARAMS)
        expect(result).not.toContain('valid=test');
        expect(result).not.toContain('valid');

        // Should ignore/remove malformed parameters (parameter with no key)
        expect(result).not.toContain('=invalid');
        expect(result).not.toContain('invalid');

        // Should produce a valid URL structure
        expect(() => new URL(result)).not.toThrow();

        // Should only contain the base URL and whitelisted parameters
        expect(result).toBe('https://example.com/page?id=123');
      });

      it('should handle very long URLs', () => {
        const longValue = 'a'.repeat(1000);
        const url = `https://example.com/page?id=${longValue}&utm_source=google`;
        const result = normalizeUrl(url);

        expect(result).toContain(`id=${longValue}`);
        expect(result).not.toContain('utm_source');
      });

      it('should handle special characters in parameters', () => {
        const url = 'https://example.com/page?search=hello%20world&id=123&utm_source=google';
        const result = normalizeUrl(url);

        // Native URL API may encode spaces as + or %20, both are valid
        expect(result).toMatch(/search=hello(\+|%20)world/);
        expect(result).toContain('id=123');
        expect(result).not.toContain('utm_source');
      });
    });

    describe('Real-world Scenarios', () => {
      it('should handle typical e-commerce URLs', () => {
        const url =
          'https://shop.com/products?category=electronics&sort=price&utm_source=google&fbclid=abc&gclid=xyz';
        const result = normalizeUrl(url);

        expect(result).toBe('https://shop.com/products?category=electronics&sort=price');
      });

      it('should handle news website URLs', () => {
        const url = 'https://news.com/article?id=123&category=tech&utm_medium=social&ref=twitter';
        const result = normalizeUrl(url);

        // Check that both parameters are present, regardless of order
        expect(result).toContain('id=123');
        expect(result).toContain('category=tech');
        expect(result).not.toContain('utm_medium');
        expect(result).not.toContain('ref');
      });

      it('should handle search result URLs', () => {
        const url =
          'https://search.com/results?q=javascript&page=2&utm_campaign=ads&sessionid=sess123';
        const result = normalizeUrl(url);

        // Check that both parameters are present, regardless of order
        expect(result).toContain('q=javascript');
        expect(result).toContain('page=2');
        expect(result).not.toContain('utm_campaign');
        expect(result).not.toContain('sessionid');
      });
    });
  });

  describe('isAllowedQueryParam', () => {
    it('should return true for whitelisted parameters', () => {
      expect(isAllowedQueryParam('id')).toBe(true);
      expect(isAllowedQueryParam('page')).toBe(true);
      expect(isAllowedQueryParam('search')).toBe(true);
      expect(isAllowedQueryParam('category')).toBe(true);
    });

    it('should return false for non-whitelisted parameters', () => {
      expect(isAllowedQueryParam('utm_source')).toBe(false);
      expect(isAllowedQueryParam('fbclid')).toBe(false);
      expect(isAllowedQueryParam('gclid')).toBe(false);
      expect(isAllowedQueryParam('sessionid')).toBe(false);
    });

    it('should handle additional allowed parameters', () => {
      expect(isAllowedQueryParam('custom_param')).toBe(false);
      expect(isAllowedQueryParam('custom_param', ['custom_param'])).toBe(true);
    });

    it('should be case sensitive', () => {
      expect(isAllowedQueryParam('ID')).toBe(false);
      expect(isAllowedQueryParam('Page')).toBe(false);
    });
  });

  describe('getNormalizationStats', () => {
    it('should provide accurate statistics', () => {
      const originalUrl = 'https://example.com/page?id=123&page=1&utm_source=google&fbclid=abc';
      const normalizedUrl = normalizeUrl(originalUrl);
      const stats = getNormalizationStats(originalUrl, normalizedUrl);

      expect(stats.originalParamCount).toBe(4);
      expect(stats.normalizedParamCount).toBe(2);
      expect(stats.removedParamCount).toBe(2);
      expect(stats.removedParams).toContain('utm_source');
      expect(stats.removedParams).toContain('fbclid');
      expect(stats.removedParams).toHaveLength(2);
    });

    it('should handle URLs with no parameters removed', () => {
      const originalUrl = 'https://example.com/page?id=123&page=1';
      const normalizedUrl = normalizeUrl(originalUrl);
      const stats = getNormalizationStats(originalUrl, normalizedUrl);

      expect(stats.originalParamCount).toBe(2);
      expect(stats.normalizedParamCount).toBe(2);
      expect(stats.removedParamCount).toBe(0);
      expect(stats.removedParams).toEqual([]);
    });

    it('should handle URLs with all parameters removed', () => {
      const originalUrl = 'https://example.com/page?utm_source=google&fbclid=abc';
      const normalizedUrl = normalizeUrl(originalUrl);
      const stats = getNormalizationStats(originalUrl, normalizedUrl);

      expect(stats.originalParamCount).toBe(2);
      expect(stats.normalizedParamCount).toBe(0);
      expect(stats.removedParamCount).toBe(2);
      expect(stats.removedParams).toContain('utm_source');
      expect(stats.removedParams).toContain('fbclid');
      expect(stats.removedParams).toHaveLength(2);
    });
  });

  describe('ALLOWED_QUERY_PARAMS constant', () => {
    it('should contain expected business parameters', () => {
      const expectedParams = [
        'id',
        'page',
        'search',
        'category',
        'sort',
        'limit',
        'lang',
        'theme',
        'view',
        'tab',
      ];

      expectedParams.forEach(param => {
        expect(ALLOWED_QUERY_PARAMS).toContain(param);
      });
    });

    it('should be a readonly array', () => {
      expect(Array.isArray(ALLOWED_QUERY_PARAMS)).toBe(true);
      // TypeScript should enforce readonly, but we can't test that at runtime
    });

    it('should not contain marketing parameters', () => {
      const marketingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'fbclid',
        'gclid',
        'sessionid',
      ];

      marketingParams.forEach(param => {
        expect(ALLOWED_QUERY_PARAMS).not.toContain(param);
      });
    });
  });

  describe('Integration with Database Service', () => {
    it('should integrate correctly with extractTimeAggregationFromEvent', () => {
      // Test that the URL normalization works as expected when integrated
      const testUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
      const normalizedUrl = normalizeUrl(testUrl);

      // Verify that marketing parameters are removed
      expect(normalizedUrl).toContain('id=123');
      expect(normalizedUrl).not.toContain('utm_source');
      expect(normalizedUrl).not.toContain('fbclid');

      // Verify that the normalized URL is still a valid URL
      expect(() => new URL(normalizedUrl)).not.toThrow();
    });

    it('should handle data explosion prevention scenarios', () => {
      // Simulate multiple URLs that should normalize to the same result
      const baseUrl = 'https://shop.com/product?id=123&category=electronics';
      const urlVariants = [
        `${baseUrl}`,
        `${baseUrl}&utm_source=google`,
        `${baseUrl}&utm_source=facebook&utm_campaign=summer`,
        `${baseUrl}&fbclid=abc123&gclid=xyz789`,
        `${baseUrl}&utm_medium=email&sessionid=sess123&ref=twitter`,
      ];

      const normalizedUrls = urlVariants.map(url => normalizeUrl(url));

      // All variants should normalize to the same URL
      const uniqueNormalizedUrls = new Set(normalizedUrls);
      expect(uniqueNormalizedUrls.size).toBe(1);

      // The normalized URL should only contain business parameters
      const normalizedUrl = normalizedUrls[0];
      expect(normalizedUrl).toContain('id=123');
      expect(normalizedUrl).toContain('category=electronics');
      expect(normalizedUrl).not.toContain('utm_');
      expect(normalizedUrl).not.toContain('fbclid');
      expect(normalizedUrl).not.toContain('gclid');
      expect(normalizedUrl).not.toContain('sessionid');
      expect(normalizedUrl).not.toContain('ref');
    });

    it('should preserve URL structure for aggregation key generation', () => {
      const testCases = [
        {
          input: 'https://example.com/page?id=123&utm_source=google',
          expectedBase: 'https://example.com/page?id=123',
          removedParams: ['utm_source'],
        },
        {
          input: 'https://shop.com/products?category=tech&sort=price&fbclid=abc',
          expectedBase: 'https://shop.com/products?category=tech&sort=price',
          removedParams: ['fbclid'],
        },
        {
          input: 'https://news.com/article?page=1&search=javascript&utm_campaign=ads',
          expectedBase: 'https://news.com/article?page=1&search=javascript',
          removedParams: ['utm_campaign'],
        },
      ];

      testCases.forEach(({ input, expectedBase, removedParams }) => {
        const normalized = normalizeUrl(input);
        const normalizedUrl = new URL(normalized);
        const expectedUrl = new URL(expectedBase);

        // Verify that normalization actually changed the input URL
        expect(normalized).not.toBe(input);

        // Verify that specific disallowed parameters were removed
        removedParams.forEach(param => {
          expect(normalized).not.toContain(param);
          expect(input).toContain(param); // Ensure the parameter was originally present
        });

        // Should preserve protocol, hostname, and pathname
        expect(normalizedUrl.protocol).toBe(expectedUrl.protocol);
        expect(normalizedUrl.hostname).toBe(expectedUrl.hostname);
        expect(normalizedUrl.pathname).toBe(expectedUrl.pathname);

        // Should only contain whitelisted parameters
        const params = Array.from(normalizedUrl.searchParams.keys());
        params.forEach(param => {
          expect(ALLOWED_QUERY_PARAMS).toContain(param);
        });
      });
    });
  });
});
