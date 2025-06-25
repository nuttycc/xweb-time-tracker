/**
 * Database Utils Types
 *
 * Type definitions for database utility functions and classes.
 *
 * @module db/utils/types
 */

/**
 * Utility operation options
 */
export interface UtilityOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry attempts */
  retries?: number;
}

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;
  /** Timestamp of the check */
  timestamp: number;
  /** Database connection status */
  database: {
    connected: boolean;
    version?: string;
    error?: string;
  };
  /** Performance metrics */
  performance?: {
    responseTime: number;
    memoryUsage?: number;
  };
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Version information interface
 */
export interface VersionInfo {
  /** Current database version */
  current: number;
  /** Latest available version */
  latest: number;
  /** Whether upgrade is needed */
  upgradeNeeded: boolean;
  /** Migration path if upgrade needed */
  migrationPath?: string[];
  /** Version history */
  history?: Array<{
    version: number;
    timestamp: number;
    description?: string;
  }>;
}

/**
 * Database health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown',
}

/**
 * Version comparison result
 */
export interface VersionComparison {
  /** Comparison result (-1: older, 0: same, 1: newer) */
  result: -1 | 0 | 1;
  /** Version difference */
  difference: number;
  /** Whether migration is required */
  migrationRequired: boolean;
}

/**
 * Utility error types
 */
export enum UtilityErrorType {
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  VERSION_CHECK_FAILED = 'VERSION_CHECK_FAILED',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Utility error class
 */
export class UtilityError extends Error {
  constructor(
    public type: UtilityErrorType,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UtilityError';
  }
}
