/**
 * Database Models Module
 * 
 * This module provides Zod v4 schemas and TypeScript types for all database models,
 * ensuring type safety and runtime validation throughout the application.
 */

// Export EventsLog model
export {
  EventsLogSchema,
  CreateEventsLogSchema,
  UpdateEventsLogSchema,
  EventTypeSchema,
  ResolutionTypeSchema,
  EventsLogValidation,
  type EventsLogRecord,
  type CreateEventsLogRecord,
  type UpdateEventsLogRecord
} from './eventslog.model';

// Export AggregatedStats model
export {
  AggregatedStatsSchema,
  CreateAggregatedStatsSchema,
  UpdateAggregatedStatsSchema,
  UpsertAggregatedStatsSchema,
  DateRangeQuerySchema,
  AggregatedStatsValidation,
  type AggregatedStatsRecord,
  type CreateAggregatedStatsRecord,
  type UpdateAggregatedStatsRecord,
  type UpsertAggregatedStatsRecord,
  type DateRangeQuery
} from './aggregatedstats.model';

// Re-export Zod for convenience
export { z } from 'zod/v4';
