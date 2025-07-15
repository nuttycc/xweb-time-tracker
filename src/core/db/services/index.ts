/**
 * Database Services Module
 *
 * This module provides pure CRUD database services following
 * the Core Task Plan architecture boundaries.
 */

// Export specific service implementations
export {
  DatabaseService,
  createDatabaseService,
  databaseService,
  type DatabaseHealthInfo,
} from './database.service';

export {
  ErrorHandlerService,
  errorHandlerService,
  BusinessLogicError,
  DatabaseConnectionError,
  QuotaExceededError,
  ErrorSeverity,
  ErrorCategory,
  type ErrorInfo,
  type ErrorHandlingOptions,
  type RecoveryResult,
} from './error-handler.service';

// Re-export repository layer for convenience
export * from '../repositories';
