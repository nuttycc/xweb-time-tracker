/**
 * Database Repositories Module
 *
 * This module provides data access layer abstractions for all database tables,
 * implementing the Repository pattern with type safety and error handling.
 */

// Export base repository classes and interfaces
export {
  BaseRepository,
  type BaseEntity,
  type InsertType,
  type RepositoryOptions,
  RepositoryError,
  ValidationError,
  NotFoundError,
} from './base.repository';

// Export specific repository implementations
export { EventsLogRepository, type EventsLogQueryOptions } from './eventslog.repository';

export {
  AggregatedStatsRepository,
  type AggregatedStatsQueryOptions,
  type TimeAggregationData,
} from './aggregatedstats.repository';

// Re-export database schemas and models for convenience
// Note: Only re-export specific items to avoid naming conflicts
export { WebTimeTrackerDB, db, DATABASE_NAME, DATABASE_VERSION } from '../schemas';
export {
  generateAggregatedStatsKey,
  getUtcDateString,
  EVENTSLOG_TABLE_NAME,
  AGGREGATEDSTATS_TABLE_NAME,
  EVENTSLOG_SCHEMA,
  AGGREGATEDSTATS_SCHEMA,
} from '../schemas';

export {
  EventsLogValidation,
  AggregatedStatsValidation,
  EventTypeSchema,
  ResolutionTypeSchema,
} from '../models';
