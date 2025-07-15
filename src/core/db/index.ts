/**
 * Database Module - Main Entry Point (WIP)
 *
 * This is the main entry point for the database module, providing a unified
 * interface to all database-related functionality including repositories,
 * services, utilities, and type definitions.
 *
 * @module db
 *
 * @example
 * // Recommended import patterns:
 *
 * // For basic database operations:
 * import { businessDatabaseService } from '@/core/db';
 *
 * // For specific repositories:
 * import { EventsLogRepository, AggregatedStatsRepository } from '@/core/db';
 *
 * // For utilities:
 * import { VersionManagerUtil } from '@/core/db';
 *
 * // For types only:
 * import type { EventsLogRecord } from '@/core/db';
 *
 * // For advanced use cases:
 * import { DatabaseConnectionManager, createBusinessDatabaseService } from '@/core/db';
 */

// ============================================================================
// DATABASE SCHEMAS AND CONNECTION
// ============================================================================

// Export database instance and core schemas
export { WebTimeTrackerDB, DATABASE_NAME, DATABASE_VERSION } from './schemas';
export type { EventsLogRecord, AggregatedStatsRecord } from './schemas';

// ============================================================================
// REPOSITORY LAYER
// ============================================================================

// Export repository classes and base functionality
export { BaseRepository, EventsLogRepository, AggregatedStatsRepository } from './repositories';

// Export repository types and interfaces
export type {
  BaseEntity,
  InsertType,
  RepositoryOptions,
  ValidationError,
  NotFoundError,
} from './repositories';

// ============================================================================
// SERVICES LAYER
// ============================================================================

// Export service classes
export {
  DatabaseService,
  createDatabaseService,
  databaseService,
  ErrorHandlerService,
} from './services';

// Export service types and interfaces
export type {
  DatabaseHealthInfo,
  ErrorInfo,
  ErrorHandlingOptions,
  RecoveryResult,
} from './services';

// Export service enums and errors
export {
  ErrorSeverity,
  ErrorCategory,
  BusinessLogicError,
  DatabaseConnectionError,
  QuotaExceededError,
} from './services';

// ============================================================================
// UTILITIES LAYER
// ============================================================================

// Export utility classes
export { VersionManagerUtil } from './utils';

// Export utility types and interfaces
export type {
  VersionInfo,
  VersionManagerOptions,
  VersionComparison,
  UtilityOptions,
} from './utils';

// Export utility enums and errors
export { UtilityError, UtilityErrorType } from './utils';

// ============================================================================
// MODEL TYPES
// ============================================================================

// Export model types for external use
export type {
  CreateEventsLogRecord,
  CreateAggregatedStatsRecord,
  UpsertAggregatedStatsRecord,
} from './models';

// Export validation utilities
export { EventsLogValidation, AggregatedStatsValidation } from './models';

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

// Export connection management (for advanced use cases)
export { DatabaseConnectionManager, DefaultDatabaseFactory } from './connection';

// Export connection types
export type {
  ConnectionState,
  ConnectionManagerOptions,
  DatabaseFactory,
  DatabaseOperationOptions,
  TransactionCallback,
} from './connection';

// ============================================================================
// CONVENIENCE EXPORTS AND ALIASES
// ============================================================================

// Provide convenient aliases for commonly used services
export { databaseService as dbService } from './services';
export { connectionService } from './connection';

// Re-export database instance for direct access
export { db as database } from './schemas';
