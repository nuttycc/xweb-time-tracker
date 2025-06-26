/**
 * Database Models Module
 *
 * This module provides Zod v4 schemas and TypeScript types for all database models,
 * ensuring type safety and runtime validation throughout the application.
 */

// Export EventsLog model
export {
  // Constants (single source of truth)
  EVENT_TYPES,
  RESOLUTION_TYPES,
  // Schemas
  EventsLogSchema,
  CreateEventsLogSchema,
  UpdateEventsLogSchema,
  EventTypeSchema,
  ResolutionTypeSchema,
  // Types
  type EventType,
  type ResolutionType,
  type EventsLogRecord,
  type CreateEventsLogRecord,
  type UpdateEventsLogRecord,
  // Validation helpers
  EventsLogValidation,
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
  type DateRangeQuery,
} from './aggregatedstats.model';

// Re-export Zod for convenience
export { z } from 'zod/v4';
