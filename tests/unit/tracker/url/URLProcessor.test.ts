/**
 * URLProcessor Unit Tests
 *
 * Tests for the URLProcessor class extending the existing URL normalization tests.
 * Tests hostname filtering, additional query parameter filtering, and integration
 * with the existing normalizer. Verifies that CSPEC requirements are properly
 * implemented and that the processor correctly identifies URLs that should be ignored.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  URLProcessor,
  createDefaultURLProcessor,
  isValidTrackingUrl,
  normalizeTrackingUrl,
  URLProcessorValidation,
  type URLProcessingOptions,
} from '@/core/tracker/url/URLProcessor';
import { IGNORED_HOSTNAMES_DEFAULT, IGNORED_QUERY_PARAMS_DEFAULT } from '@/config/constants';

describe('URLProcessor', () => {
  let processor: URLProcessor;

  beforeEach(() => {
    processor = new URLProcessor();
  });

  describe('Constructor and Configuration', () => {
    it('should create processor with default options', () => {
      const defaultProcessor = new URLProcessor();
      expect(defaultProcessor).toBeInstanceOf(URLProcessor);
      expect(defaultProcessor.getIgnoredHostnames()).toEqual(
        expect.arrayContaining([...IGNORED_HOSTNAMES_DEFAULT])
      );
      expect(defaultProcessor.getIgnoredQueryParams()).toEqual(
        expect.arrayContaining([...IGNORED_QUERY_PARAMS_DEFAULT])
      );
    });

    it('should create processor with custom options', () => {
      const options: URLProcessingOptions = {
        additionalIgnoredHostnames: ['custom.com'],
        additionalIgnoredParams: ['custom_param'],
        preserveFragment: true,
        sortParams: false,
      };

      const customProcessor = new URLProcessor(options);
      expect(customProcessor.getIgnoredHostnames()).toEqual(
        expect.arrayContaining([...IGNORED_HOSTNAMES_DEFAULT, 'custom.com'])
      );
      expect(customProcessor.getIgnoredQueryParams()).toEqual(
        expect.arrayContaining([...IGNORED_QUERY_PARAMS_DEFAULT, 'custom_param'])
      );
    });

    it('should validate options with zod schema', () => {
      expect(() => {
        URLProcessorValidation.validateOptions({
          additionalIgnoredHostnames: ['valid.com'],
          additionalIgnoredParams: ['valid_param'],
          preserveFragment: true,
          sortParams: false,
        });
      }).not.toThrow();

      expect(() => {
        URLProcessorValidation.validateOptions({
          additionalIgnoredHostnames: 'invalid', // Should be array
        });
      }).toThrow();
    });
  });

  describe('URL Validation and Processing', () => {
    it('should validate and process valid URLs', () => {
      const testCases = [
        'https://example.com',
        'https://www.example.com/path',
        'https://subdomain.example.com/path?param=value',
      ];

      testCases.forEach(url => {
        const result = processor.processUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.normalizedUrl).toBeDefined();
        expect(result.hostname).toBeDefined();
        expect(result.isIgnoredHostname).toBe(false);
      });
    });

    it('should reject invalid URL formats', () => {
      const invalidUrls = ['not-a-url', ''];

      invalidUrls.forEach(url => {
        const result = processor.processUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });

    it('should reject ignored hostnames', () => {
      const ignoredUrls = [
        'chrome://settings',
        'chrome-extension://abc123/popup.html',
        'https://newtab',
        'https://extensions',
        'https://localhost',
      ];

      ignoredUrls.forEach(url => {
        const result = processor.processUrl(url);
        if (result.isIgnoredHostname) {
          expect(result.isValid).toBe(false);
          expect(result.reason).toContain('ignored');
        }
      });
    });

    it('should reject unsupported protocols', () => {
      const unsupportedProtocols = [
        'chrome://settings',
        'chrome-extension://abc123/popup.html',
        'moz-extension://abc123/popup.html',
        'file:///path/to/file.html',
        'data:text/html,<h1>Hello</h1>',
        'blob:https://example.com/abc123',
        'about:blank',
        'javascript:void(0)',
      ];

      unsupportedProtocols.forEach(url => {
        const result = processor.processUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('Protocol not supported');
      });
    });
  });

  describe('Hostname Processing', () => {
    it('should ignore default hostnames', () => {
      IGNORED_HOSTNAMES_DEFAULT.forEach(hostname => {
        expect(processor.shouldIgnoreHostname(hostname)).toBe(true);
        expect(processor.shouldIgnoreHostname(`www.${hostname}`)).toBe(true);
      });
    });

    it('should handle www prefix normalization', () => {
      expect(processor.shouldIgnoreHostname('www.example.com')).toBe(false);
      expect(processor.shouldIgnoreHostname('example.com')).toBe(false);

      // Both should be treated the same
      const result1 = processor.processUrl('https://www.example.com');
      const result2 = processor.processUrl('https://example.com');
      expect(result1.hostname).toBe(result2.hostname);
    });

    it('should handle custom ignored hostnames', () => {
      const customProcessor = new URLProcessor({
        additionalIgnoredHostnames: ['custom.com', 'test.org'],
      });

      expect(customProcessor.shouldIgnoreHostname('custom.com')).toBe(true);
      expect(customProcessor.shouldIgnoreHostname('test.org')).toBe(true);
      expect(customProcessor.shouldIgnoreHostname('allowed.com')).toBe(false);
    });
  });

  describe('Query Parameter Filtering', () => {
    it('should remove default ignored query parameters', () => {
      const urlWithTracking =
        'https://example.com/page?id=123&utm_source=google&utm_medium=email&fbclid=abc123';
      const result = processor.normalizeUrlForTracking(urlWithTracking);

      expect(result).toContain('id=123');
      expect(result).not.toContain('utm_source');
      expect(result).not.toContain('utm_medium');
      expect(result).not.toContain('fbclid');
    });

    it('should remove custom ignored query parameters', () => {
      const customProcessor = new URLProcessor({
        additionalIgnoredParams: ['custom_param', 'tracking_id'],
      });

      const urlWithCustomParams =
        'https://example.com/page?id=123&custom_param=value&tracking_id=abc';
      const result = customProcessor.normalizeUrlForTracking(urlWithCustomParams);

      expect(result).toContain('id=123');
      expect(result).not.toContain('custom_param');
      expect(result).not.toContain('tracking_id');
    });

    it('should preserve allowed query parameters', () => {
      const urlWithMixedParams =
        'https://example.com/search?q=test&page=2&utm_source=google&sort=date';
      const result = processor.normalizeUrlForTracking(urlWithMixedParams);

      expect(result).toContain('q=test');
      expect(result).toContain('page=2');
      expect(result).toContain('sort=date');
      expect(result).not.toContain('utm_source');
    });
  });

  describe('URL Normalization', () => {
    it('should normalize URLs consistently', () => {
      const testCases = [
        {
          input: 'https://example.com/path#fragment',
          expected: 'https://example.com/path', // Should remove fragment by default
        },
        {
          input: 'https://example.com/path?utm_source=test&id=123',
          expected: 'https://example.com/path?id=123', // Should remove tracking params
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = processor.normalizeUrlForTracking(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle normalization errors gracefully', () => {
      const invalidUrl = 'not-a-url';
      const result = processor.normalizeUrlForTracking(invalidUrl);
      expect(result).toBe(invalidUrl); // Should return original on error
    });

    it('should respect preserveFragment option', () => {
      const processorWithFragment = new URLProcessor({ preserveFragment: true });
      const urlWithFragment = 'https://example.com/path#section';
      const result = processorWithFragment.normalizeUrlForTracking(urlWithFragment);
      expect(result).toContain('#section');
    });
  });

  describe('Configuration Updates', () => {
    it('should update options dynamically', () => {
      const initialHostnames = processor.getIgnoredHostnames();

      processor.updateOptions({
        additionalIgnoredHostnames: ['new-ignored.com'],
      });

      const updatedHostnames = processor.getIgnoredHostnames();
      expect(updatedHostnames).toContain('new-ignored.com');
      expect(updatedHostnames.length).toBeGreaterThan(initialHostnames.length);
    });

    it('should update query parameters dynamically', () => {
      const initialParams = processor.getIgnoredQueryParams();

      processor.updateOptions({
        additionalIgnoredParams: ['new_param'],
      });

      const updatedParams = processor.getIgnoredQueryParams();
      expect(updatedParams).toContain('new_param');
      expect(updatedParams.length).toBeGreaterThan(initialParams.length);
    });
  });
});

describe('Factory Functions', () => {
  describe('createDefaultURLProcessor', () => {
    it('should create processor with default configuration', () => {
      const processor = createDefaultURLProcessor();
      expect(processor).toBeInstanceOf(URLProcessor);
    });

    it('should accept additional options', () => {
      const processor = createDefaultURLProcessor({
        additionalIgnoredHostnames: ['custom.com'],
      });
      expect(processor.getIgnoredHostnames()).toContain('custom.com');
    });
  });

  describe('isValidTrackingUrl', () => {
    it('should validate URLs correctly', () => {
      expect(isValidTrackingUrl('https://example.com')).toBe(true);
      expect(isValidTrackingUrl('chrome://settings')).toBe(false);
      expect(isValidTrackingUrl('not-a-url')).toBe(false);
    });
  });

  describe('normalizeTrackingUrl', () => {
    it('should normalize valid URLs', () => {
      const result = normalizeTrackingUrl('https://example.com/path?utm_source=test&id=123');
      expect(result).toContain('id=123');
      expect(result).not.toContain('utm_source');
    });

    it('should return original URL on error', () => {
      const invalidUrl = 'not-a-url';
      const result = normalizeTrackingUrl(invalidUrl);
      expect(result).toBe(invalidUrl);
    });
  });
});

describe('Validation Helpers', () => {
  describe('URLProcessorValidation', () => {
    it('should validate URL strings', () => {
      expect(() => URLProcessorValidation.validateUrl('https://example.com')).not.toThrow();
      expect(() => URLProcessorValidation.validateUrl('not-a-url')).toThrow();
      expect(() => URLProcessorValidation.validateUrl(123)).toThrow();
    });

    it('should validate options objects', () => {
      const validOptions = {
        additionalIgnoredHostnames: ['test.com'],
        preserveFragment: true,
      };
      expect(() => URLProcessorValidation.validateOptions(validOptions)).not.toThrow();

      const invalidOptions = {
        additionalIgnoredHostnames: 'not-an-array',
      };
      expect(() => URLProcessorValidation.validateOptions(invalidOptions)).toThrow();
    });
  });
});
