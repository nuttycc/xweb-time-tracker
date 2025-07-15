/**
 * Database Utils Module
 *
 * This module provides utility functions and classes for database operations,
 * including version management, and other common utilities.
 *
 * @module db/utils
 */

// Version Management Utilities
export { VersionManagerUtil } from './version-manager.util';
export type { VersionManagerOptions } from './version-manager.util';

// URL Normalization Utilities
export {
  normalizeUrl,
  isAllowedQueryParam,
  getNormalizationStats,
  ALLOWED_QUERY_PARAMS,
} from './url-normalizer.util';
export type { UrlNormalizationOptions } from './url-normalizer.util';

// Re-export common types and interfaces
export type {
  VersionInfo,
  VersionComparison,
  UtilityOptions,
  UtilityErrorType,
} from './types';
export { UtilityError } from './types';

// Note: Type definitions are now imported from ./types.ts
// This provides a clean separation of concerns and better maintainability.
