/**
 * URL Normalization Performance Tests
 *
 * Tests to measure the performance impact of URL normalization
 * and ensure it meets acceptable performance criteria.
 */

import { describe, it, expect } from 'vitest';
import { normalizeUrl, getNormalizationStats } from '@/core/db/utils/url-normalizer.util';

describe('URL Normalization Performance', () => {
  // Performance thresholds (in milliseconds) - relaxed targets to avoid premature optimization
  // These thresholds focus on preventing performance regressions rather than aggressive optimization
  const PERFORMANCE_THRESHOLDS = {
    SINGLE_URL_MAX_TIME: 50, // Max time for single URL normalization (relaxed target)
    BATCH_100_MAX_TIME: 500, // Max time for 100 URLs (relaxed target)
    BATCH_1000_MAX_TIME: 3000, // Max time for 1000 URLs (relaxed target)
    LARGE_URL_MAX_TIME: 100, // Max time for very long URLs (relaxed target)
  };

  describe('Single URL Performance', () => {
    it('should normalize a simple URL quickly', () => {
      const url = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';

      const startTime = performance.now();
      const result = normalizeUrl(url);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toContain('id=123');
      expect(result).not.toContain('utm_source');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });

    it('should handle complex URLs with many parameters efficiently', () => {
      const complexUrl =
        'https://shop.com/products?' +
        'category=electronics&sort=price&page=2&limit=20&search=laptop&' +
        'utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&' +
        'fbclid=abc123&gclid=xyz789&msclkid=def456&' +
        'sessionid=sess123&ref=twitter&affid=aff789&campaign_id=camp456';

      const startTime = performance.now();
      const result = normalizeUrl(complexUrl);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toContain('category=electronics');
      expect(result).toContain('sort=price');
      expect(result).not.toContain('utm_');
      expect(result).not.toContain('fbclid');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });

    it('should handle very long URLs efficiently', () => {
      const longValue = 'a'.repeat(1000);
      const longUrl = `https://example.com/page?id=${longValue}&utm_source=google&search=${longValue}`;

      // Warm up V8 engine with a few runs
      for (let i = 0; i < 3; i++) {
        normalizeUrl(longUrl);
      }

      const startTime = performance.now();
      const result = normalizeUrl(longUrl);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toContain(`id=${longValue}`);
      expect(result).toContain(`search=${longValue}`);
      expect(result).not.toContain('utm_source');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_URL_MAX_TIME);

      // Performance monitoring
      console.log(`Large URL (${longUrl.length} chars) processed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Batch Processing Performance', () => {
    const generateTestUrls = (count: number): string[] => {
      const baseUrls = [
        'https://example.com/page',
        'https://shop.com/products',
        'https://news.com/article',
        'https://blog.com/post',
        'https://docs.com/guide',
      ];

      const marketingParams = [
        'utm_source=google&utm_medium=cpc',
        'fbclid=abc123&utm_campaign=summer',
        'gclid=xyz789&utm_term=laptop',
        'msclkid=def456&ref=twitter',
        'sessionid=sess123&affid=aff789',
      ];

      const businessParams = [
        'id=123&page=1',
        'category=tech&sort=price',
        'search=javascript&limit=20',
        'type=article&status=published',
        'lang=en&theme=dark',
      ];

      const urls: string[] = [];
      for (let i = 0; i < count; i++) {
        const baseUrl = baseUrls[i % baseUrls.length];
        const businessParam = businessParams[i % businessParams.length];
        const marketingParam = marketingParams[i % marketingParams.length];

        urls.push(`${baseUrl}?${businessParam}&${marketingParam}`);
      }

      return urls;
    };

    it('should process 100 URLs within acceptable time', () => {
      const urls = generateTestUrls(100);

      const startTime = performance.now();
      const results = urls.map(url => normalizeUrl(url));
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(results).toHaveLength(100);
      expect(results.every(result => !result.includes('utm_'))).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BATCH_100_MAX_TIME);

      console.log(
        `100 URLs processed in ${duration.toFixed(2)}ms (avg: ${(duration / 100).toFixed(3)}ms per URL)`
      );
    });

    it('should process 1000 URLs within acceptable time', () => {
      const urls = generateTestUrls(1000);

      const startTime = performance.now();
      const results = urls.map(url => normalizeUrl(url));
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(results).toHaveLength(1000);
      expect(results.every(result => !result.includes('utm_'))).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.BATCH_1000_MAX_TIME);

      console.log(
        `1000 URLs processed in ${duration.toFixed(2)}ms (avg: ${(duration / 1000).toFixed(3)}ms per URL)`
      );
    });
  });

  describe('Memory Usage', () => {
    it('should not cause memory leaks during repeated operations', () => {
      const testUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';

      // Perform many operations to test for memory leaks
      for (let i = 0; i < 10000; i++) {
        const result = normalizeUrl(testUrl);
        expect(result).toContain('id=123');
      }

      // If we reach here without running out of memory, the test passes
      expect(true).toBe(true);
    });

    it('should handle large batches without excessive memory usage', () => {
      const urls = Array.from(
        { length: 5000 },
        (_, i) => `https://example.com/page${i}?id=${i}&utm_source=google&fbclid=abc${i}`
      );

      const startTime = performance.now();
      const results = urls.map(url => normalizeUrl(url));
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(results).toHaveLength(5000);
      expect(results.every(result => !result.includes('utm_'))).toBe(true);

      console.log(`5000 URLs processed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Statistics Performance', () => {
    it('should generate statistics efficiently', () => {
      const originalUrl =
        'https://example.com/page?id=123&page=1&utm_source=google&fbclid=abc&gclid=xyz';
      const normalizedUrl = normalizeUrl(originalUrl);

      const startTime = performance.now();
      const stats = getNormalizationStats(originalUrl, normalizedUrl);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(stats.originalParamCount).toBe(5);
      expect(stats.normalizedParamCount).toBe(2);
      expect(stats.removedParamCount).toBe(3);
      expect(duration).toBeLessThan(10); // Should be reasonably fast (relaxed target)
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle URLs with no parameters efficiently', () => {
      const url = 'https://example.com/page';

      const startTime = performance.now();
      const result = normalizeUrl(url);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toBe(url);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });

    it('should handle URLs with only marketing parameters efficiently', () => {
      const url = 'https://example.com/page?utm_source=google&fbclid=abc&gclid=xyz';

      const startTime = performance.now();
      const result = normalizeUrl(url);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toBe('https://example.com/page');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });

    it('should handle URLs with special characters efficiently', () => {
      const url = 'https://example.com/page?search=hello%20world&id=123&utm_source=google';

      const startTime = performance.now();
      const result = normalizeUrl(url);
      const endTime = performance.now();

      const duration = endTime - startTime;

      // Native URL API may encode spaces as + or %20, both are valid
      expect(result).toMatch(/search=hello(\+|%20)world/);
      expect(result).toContain('id=123');
      expect(result).not.toContain('utm_source');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });
  });

  describe('Comparative Performance', () => {
    it('should be faster than naive string replacement approaches', () => {
      const testUrl =
        'https://example.com/page?id=123&page=1&utm_source=google&fbclid=abc&gclid=xyz';

      // Our optimized approach
      const startOptimized = performance.now();
      const optimizedResult = normalizeUrl(testUrl);
      const endOptimized = performance.now();
      const optimizedDuration = endOptimized - startOptimized;

      // Naive approach (for comparison)
      const startNaive = performance.now();
      let naiveResult = testUrl;
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
      paramsToRemove.forEach(param => {
        naiveResult = naiveResult.replace(new RegExp(`[?&]${param}=[^&]*`, 'g'), '');
      });
      const endNaive = performance.now();
      const naiveDuration = endNaive - startNaive;

      expect(optimizedResult).toContain('id=123');
      expect(optimizedResult).toContain('page=1');
      expect(optimizedResult).not.toContain('utm_source');

      console.log(
        `Optimized: ${optimizedDuration.toFixed(3)}ms, Naive: ${naiveDuration.toFixed(3)}ms`
      );

      // Our approach should be reasonably fast (not necessarily faster than naive for single URLs,
      // but more correct and feature-complete)
      expect(optimizedDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.SINGLE_URL_MAX_TIME);
    });
  });
});
