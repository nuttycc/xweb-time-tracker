/**
 * Database Utils Module
 *
 * This module provides utility functions and classes for database operations,
 * including health checks, version management, and other common utilities.
 *
 * @module db/utils
 */

// Health Check Utilities
export { HealthCheckUtil } from './health-check.util';
export type { HealthCheckOptions } from './health-check.util';

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
  HealthCheckResult,
  VersionInfo,
  VersionComparison,
  UtilityOptions,
  HealthStatus,
  UtilityErrorType,
} from './types';
export { UtilityError } from './types';

// Note: Type definitions are now imported from ./types.ts
// This provides a clean separation of concerns and better maintainability.
