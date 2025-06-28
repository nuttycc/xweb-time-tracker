/**
 * URL Processor for Time Tracking
 *
 * Extends the existing URL normalization functionality to support CSPEC requirements.
 * This processor integrates with the existing url-normalizer.util.ts and adds support
 * for hostname filtering (IGNORED_HOSTNAMES_DEFAULT) and additional query parameter
 * filtering (IGNORED_QUERY_PARAMS_DEFAULT). It provides methods for URL validation,
 * normalization, and filtering specifically for time tracking purposes.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { normalizeUrl, isAllowedQueryParam, ALLOWED_QUERY_PARAMS } from '../../db/utils/url-normalizer.util';
import { IGNORED_HOSTNAMES_DEFAULT } from '../../../config/constants';
import { z } from 'zod/v4';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * URL processing options
 */
export interface URLProcessingOptions {
  /** Additional hostnames to ignore beyond defaults */
  additionalIgnoredHostnames?: string[];

  /** Additional query parameters to allow beyond the default whitelist */
  additionalAllowedParams?: string[];

  /** Whether to preserve fragment (hash) in URLs */
  preserveFragment?: boolean;

  /** Whether to sort query parameters for consistency */
  sortParams?: boolean;
}

/**
 * URL validation result
 */
export interface URLValidationResult {
  /** Whether the URL is valid for tracking */
  isValid: boolean;

  /** Reason for invalidity (if applicable) */
  reason?: string;

  /** Normalized URL (if valid) */
  normalizedUrl?: string;

  /** Extracted hostname */
  hostname?: string;

  /** Whether hostname should be ignored */
  isIgnoredHostname?: boolean;
}

/**
 * Schema for URL processing options
 */
export const URLProcessingOptionsSchema = z.object({
  additionalIgnoredHostnames: z.array(z.string()).optional(),
  additionalAllowedParams: z.array(z.string()).optional(),
  preserveFragment: z.boolean().optional(),
  sortParams: z.boolean().optional(),
});

// ============================================================================
// URL Processor Class
// ============================================================================

/**
 * URL Processor for Time Tracking
 *
 * Provides comprehensive URL processing capabilities for the time tracking system,
 * including validation, normalization, and filtering based on CSPEC requirements.
 */
export class URLProcessor {
  private ignoredHostnamesSet: Set<string>;
  private options: URLProcessingOptions;

  constructor(options: URLProcessingOptions = {}) {
    this.options = URLProcessingOptionsSchema.parse(options);

    // Build ignored hostnames set
    this.ignoredHostnamesSet = new Set([
      ...IGNORED_HOSTNAMES_DEFAULT,
      ...(this.options.additionalIgnoredHostnames || []),
    ]);
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Validates and processes a URL for time tracking
   *
   * @param url - URL to process
   * @returns Validation result with normalized URL if valid
   */
  processUrl(url: string): URLValidationResult {
    try {
      // Basic URL validation
      const parsedUrl = new URL(url);
      const hostname = this.extractHostname(parsedUrl.hostname);

      // Check if hostname should be ignored
      if (this.shouldIgnoreHostname(hostname)) {
        return {
          isValid: false,
          reason: 'Hostname is in ignored list',
          hostname,
          isIgnoredHostname: true,
        };
      }

      // Check for special protocols that should be ignored
      if (this.shouldIgnoreProtocol(parsedUrl.protocol)) {
        return {
          isValid: false,
          reason: 'Protocol not supported for tracking',
          hostname,
        };
      }

      // Normalize the URL
      const normalizedUrl = this.normalizeUrlForTracking(url);

      return {
        isValid: true,
        normalizedUrl,
        hostname,
        isIgnoredHostname: false,
      };
    } catch (error) {
      return {
        isValid: false,
        reason: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Checks if a hostname should be ignored for tracking
   *
   * @param hostname - Hostname to check
   * @returns True if hostname should be ignored
   */
  shouldIgnoreHostname(hostname: string): boolean {
    const normalizedHostname = this.extractHostname(hostname);
    return this.ignoredHostnamesSet.has(normalizedHostname);
  }

  /**
   * Normalizes a URL specifically for time tracking purposes
   *
   * @param url - URL to normalize
   * @returns Normalized URL
   */
  normalizeUrlForTracking(url: string): string {
    try {
      const parsedUrl = new URL(url);

      // Remove ignored query parameters
      const filteredParams = new URLSearchParams();

      for (const [key, value] of parsedUrl.searchParams) {
        if (!this.shouldIgnoreQueryParam(key)) {
          filteredParams.append(key, value);
        }
      }

      // Rebuild URL with filtered parameters
      parsedUrl.search = filteredParams.toString();

      // Use existing normalizer for additional processing
      const baseNormalizedUrl = normalizeUrl(parsedUrl.toString(), {
        preserveFragment: this.options.preserveFragment,
        sortParams: this.options.sortParams,
        additionalAllowedParams: this.options.additionalAllowedParams,
      });

      return baseNormalizedUrl;
    } catch (error) {
      // Fallback to original URL if normalization fails
      console.warn('URL normalization failed:', error);
      return url;
    }
  }

  /**
   * Checks if a URL is valid for tracking
   *
   * @param url - URL to validate
   * @returns True if URL is valid for tracking
   */
  isValidTrackingUrl(url: string): boolean {
    const result = this.processUrl(url);
    return result.isValid;
  }

  /**
   * Gets the list of ignored hostnames
   *
   * @returns Array of ignored hostnames
   */
  getIgnoredHostnames(): string[] {
    return Array.from(this.ignoredHostnamesSet);
  }

  /**
   * Gets the current list of allowed query parameters
   *
   * @returns Array of allowed query parameters (default whitelist + additional)
   */
  getAllowedQueryParams(): string[] {
    return [...ALLOWED_QUERY_PARAMS, ...(this.options.additionalAllowedParams || [])];
  }

  /**
   * Updates the processor configuration
   *
   * @param newOptions - New options to merge with existing ones
   */
  updateOptions(newOptions: Partial<URLProcessingOptions>): void {
    this.options = { ...this.options, ...newOptions };

    // Rebuild hostname set if changed
    if (newOptions.additionalIgnoredHostnames) {
      this.ignoredHostnamesSet = new Set([
        ...IGNORED_HOSTNAMES_DEFAULT,
        ...newOptions.additionalIgnoredHostnames,
      ]);
    }

    // Note: additionalAllowedParams are used directly from options,
    // no need to rebuild a separate set
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extracts and normalizes hostname from URL
   *
   * @param hostname - Raw hostname
   * @returns Normalized hostname
   */
  private extractHostname(hostname: string): string {
    // Remove www prefix for consistency
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  /**
   * Checks if a query parameter should be ignored
   *
   * Uses whitelist approach: parameters are ignored unless they are explicitly allowed.
   * This method integrates with the existing url-normalizer whitelist system.
   *
   * @param paramName - Parameter name to check
   * @returns True if parameter should be ignored (not in whitelist)
   */
  private shouldIgnoreQueryParam(paramName: string): boolean {
    // Use whitelist approach: ignore parameters that are not explicitly allowed
    return !isAllowedQueryParam(paramName, this.options.additionalAllowedParams || []);
  }

  /**
   * Checks if a protocol should be ignored for tracking
   *
   * @param protocol - URL protocol
   * @returns True if protocol should be ignored
   */
  private shouldIgnoreProtocol(protocol: string): boolean {
    const ignoredProtocols = [
      'chrome:',
      'chrome-extension:',
      'moz-extension:',
      'safari-extension:',
      'edge-extension:',
      'file:',
      'data:',
      'blob:',
      'about:',
      'javascript:',
    ];

    return ignoredProtocols.includes(protocol.toLowerCase());
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a URLProcessor instance preconfigured for time tracking, with optional overrides.
 *
 * By default, fragments are not preserved and query parameters are sorted. Additional options can customize ignored hostnames, allowed query parameters, fragment handling, or parameter sorting.
 *
 * @returns A URLProcessor configured with default and custom options
 */
export function createDefaultURLProcessor(
  additionalOptions: URLProcessingOptions = {}
): URLProcessor {
  return new URLProcessor({
    preserveFragment: false,
    sortParams: true,
    ...additionalOptions,
  });
}

/**
 * Checks if a URL is valid for time tracking using default processing rules.
 *
 * Returns true if the URL is accepted after applying default hostname, protocol, and query parameter filters.
 *
 * @param url - The URL to check for tracking eligibility
 * @returns True if the URL is valid for tracking; otherwise, false
 */
export function isValidTrackingUrl(url: string): boolean {
  const processor = createDefaultURLProcessor();
  return processor.isValidTrackingUrl(url);
}

/**
 * Returns a normalized version of the given URL for time tracking, filtering out disallowed query parameters and applying standard normalization.
 *
 * If normalization fails, the original URL is returned.
 *
 * @param url - The URL to be normalized for tracking
 * @returns The normalized tracking URL, or the original URL if normalization is unsuccessful
 */
export function normalizeTrackingUrl(url: string): string {
  const processor = createDefaultURLProcessor();
  const result = processor.processUrl(url);
  return result.normalizedUrl || url;
}

/**
 * Validation helpers
 */
export const URLProcessorValidation = {
  /**
   * Validates URL processing options
   */
  validateOptions: (options: unknown): URLProcessingOptions => {
    return URLProcessingOptionsSchema.parse(options);
  },

  /**
   * Validates a URL string
   */
  validateUrl: (url: unknown): string => {
    if (typeof url !== 'string') {
      throw new Error('URL must be a string');
    }

    try {
      new URL(url);
      return url;
    } catch {
      throw new Error('Invalid URL format');
    }
  },
};
