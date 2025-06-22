/**
 * Database Connection Module
 *
 * This module provides database connection management, health monitoring,
 * and high-level service interfaces for the WebTime Tracker application.
 */

// Export connection manager
export {
  DatabaseConnectionManager,
  ConnectionState,
  connectionManager,
  type HealthCheckResult,
  type ConnectionManagerOptions,
} from './manager';

// Export database service
export {
  DatabaseService,
  databaseService,
  type DatabaseOperationOptions,
  type TransactionCallback,
} from './service';

// Re-export database schemas for convenience
export * from '../schemas';
