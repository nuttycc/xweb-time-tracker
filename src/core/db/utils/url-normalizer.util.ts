/**
 * URL Normalization Utility
 *
 * This module provides URL normalization functionality to prevent data explosion
 * in analytics by preserving only business-relevant query parameters using a
 * whitelist strategy. All parameters not in the whitelist are automatically filtered out.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

// Removed query-string dependency for better performance

/**
 * Business-relevant query parameters that should be preserved
 * These parameters affect the actual content or functionality of the page
 */
export const ALLOWED_QUERY_PARAMS: readonly string[] = [
  // Resource identifiers
  'id',
  'uuid',
  'key',

  // Pagination and navigation
  'page',
  'offset',
  'limit',
  'size',

  // Search and filtering
  'search',
  'q',
  'query',
  'filter',
  'category',
  'type',
  'status',

  // Sorting and ordering
  'sort',
  'order',
  'orderby',
  'direction',

  // Localization
  'lang',
  'locale',
  'language',

  // UI state
  'theme',
  'view',
  'mode',
  'tab',
  'section',

  // Application state
  'state',
  'step',
  'stage',
] as const;

// Create Set for O(1) lookup performance - cached at module level
const ALLOWED_PARAMS_SET = new Set(ALLOWED_QUERY_PARAMS);

// Note: This implementation uses a whitelist approach for better maintainability
// Marketing and tracking parameters are automatically filtered out by not being in the allowed list

/**
 * Configuration options for URL normalization
 */
export interface UrlNormalizationOptions {
  /**
   * Whether to preserve fragment identifiers (hash)
   * @default false
   */
  preserveFragment?: boolean;

  /**
   * Additional parameters to allow beyond the default whitelist
   * @default []
   */
  additionalAllowedParams?: readonly string[];

  /**
   * Whether to sort query parameters alphabetically
   * @default false
   */
  sortParams?: boolean;
}

/**
 * Normalizes a URL by filtering query parameters using a hybrid strategy
 *
 * This function removes known marketing/tracking parameters (blacklist) while
 * preserving business-relevant parameters, providing optimal performance
 * through native URL APIs and Set-based lookups.
 *
 * @param url - The URL to normalize
 * @param options - Configuration options for normalization
 * @returns The normalized URL with filtered query parameters
 *
 * @example
 * ```typescript
 * const originalUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
 * const normalizedUrl = normalizeUrl(originalUrl);
 * // Result: 'https://example.com/page?id=123'
 * ```
 *
 * @example
 * ```typescript
 * const urlWithCustomParams = 'https://example.com/page?id=123&custom_param=value';
 * const normalizedUrl = normalizeUrl(urlWithCustomParams, {
 *   additionalAllowedParams: ['custom_param']
 * });
 * // Result: 'https://example.com/page?id=123&custom_param=value'
 * ```
 */
export function normalizeUrl(url: string, options: UrlNormalizationOptions = {}): string {
  // Validate input
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Parse URL using native API for better performance
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
  parsedUrl.pathname = parsedUrl.pathname.toLowerCase();

  const { preserveFragment = false, additionalAllowedParams = [], sortParams = false } = options;

  // Create additional allowed params set only if needed
  const hasAdditionalParams = additionalAllowedParams.length > 0;
  const additionalParamsSet = hasAdditionalParams ? new Set(additionalAllowedParams) : null;

  // Track if any parameters were removed
  let hasChanges = false;

  // Remove parameters that are not in the allowed list (direct iteration)
  const paramsToDelete: string[] = [];
  for (const [paramName] of parsedUrl.searchParams) {
    const isAllowed =
      ALLOWED_PARAMS_SET.has(paramName) || (additionalParamsSet?.has(paramName) ?? false);

    if (!isAllowed) {
      paramsToDelete.push(paramName);
    }
  }

  // Delete parameters in separate loop to avoid iterator issues
  if (paramsToDelete.length > 0) {
    for (const paramName of paramsToDelete) {
      parsedUrl.searchParams.delete(paramName);
    }
    hasChanges = true;
  }

  // Handle fragment preservation
  if (!preserveFragment) {
    if (parsedUrl.hash) {
      parsedUrl.hash = '';
      hasChanges = true;
    }
  }

  // Sort parameters if requested (optimized)
  if (sortParams && parsedUrl.searchParams.size > 0) {
    const sortedParams = new URLSearchParams();
    // Direct iteration without Array.from conversion
    const entries: [string, string][] = [];
    for (const [key, value] of parsedUrl.searchParams) {
      entries.push([key, value]);
    }
    entries.sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of entries) {
      sortedParams.append(key, value);
    }

    parsedUrl.search = sortedParams.toString();
    hasChanges = true;
  }

  // Clean up empty query string
  if (parsedUrl.search === '?' || parsedUrl.searchParams.size === 0) {
    parsedUrl.search = '';
    hasChanges = true;
  }

  // Return original URL if no changes were made (performance optimization)
  return hasChanges ? parsedUrl.toString() : url;
}

/**
 * Checks if a query parameter should be preserved
 *
 * @param paramName - The name of the query parameter
 * @param additionalAllowed - Additional parameters to consider as allowed
 * @returns True if the parameter should be preserved, false otherwise
 */
export function isAllowedQueryParam(
  paramName: string,
  additionalAllowed: readonly string[] = []
): boolean {
  // Use cached Set for O(1) lookup
  return ALLOWED_PARAMS_SET.has(paramName) || additionalAllowed.includes(paramName);
}

/**
 * Gets statistics about URL normalization
 *
 * @param originalUrl - The original URL
 * @param normalizedUrl - The normalized URL
 * @returns Statistics about the normalization process
 */
export function getNormalizationStats(
  originalUrl: string,
  normalizedUrl: string
): {
  originalParamCount: number;
  normalizedParamCount: number;
  removedParamCount: number;
  removedParams: string[];
} {
  // Use native URL API with optimized iteration
  const originalParsed = new URL(originalUrl);
  const normalizedParsed = new URL(normalizedUrl);

  // Direct iteration without Array.from conversion
  const originalParams: string[] = [];
  const normalizedParamsSet = new Set<string>();

  for (const [key] of originalParsed.searchParams) {
    originalParams.push(key);
  }

  for (const [key] of normalizedParsed.searchParams) {
    normalizedParamsSet.add(key);
  }

  const removedParams = originalParams.filter(param => !normalizedParamsSet.has(param));

  return {
    originalParamCount: originalParams.length,
    normalizedParamCount: normalizedParamsSet.size,
    removedParamCount: removedParams.length,
    removedParams,
  };
}
