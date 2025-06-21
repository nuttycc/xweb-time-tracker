/**
 * Events Log Model Definition
 *
 * This file defines the Zod v4 schema and TypeScript types for the eventslog table,
 * providing runtime validation and type inference for domain events.
 */

import { z } from 'zod/v4';

/**
 * Event type enumeration schema
 */
export const EventTypeSchema = z.enum([
  'open_time_start',
  'open_time_end',
  'active_time_start',
  'active_time_end',
  'checkpoint',
]);

/**
 * Resolution type enumeration schema for special event source markers
 */
export const ResolutionTypeSchema = z.enum(['crash_recovery']);

/**
 * Events log record Zod schema
 *
 * Based on LLD section 3.2 events_log table structure
 */
export const EventsLogSchema = z.object({
  /**
   * Primary key, auto-increment (optional for creation)
   */
  id: z.number().int().positive().optional(),

  /**
   * Event occurrence timestamp (Unix timestamp in milliseconds from Date.now())
   * Must be Unix timestamp as per project rules
   */
  timestamp: z.number().int().positive(),

  /**
   * Event type enumeration
   */
  eventType: EventTypeSchema,

  /**
   * Associated browser tab ID
   */
  tabId: z.number().int().nonnegative(),

  /**
   * Complete URL (path and key parameters)
   */
  url: z.string().url(),

  /**
   * Unique visit identifier (UUID), bound to Open Time lifecycle
   */
  visitId: z.string().uuid(),

  /**
   * Unique activity interval identifier (UUID), bound to Active Time lifecycle
   * Can be null for events not associated with activity
   */
  activityId: z.string().uuid().nullable(),

  /**
   * Whether processed by aggregator (0 = false, 1 = true)
   * Indexed field for fast query of unprocessed events
   */
  isProcessed: z.union([z.literal(0), z.literal(1)]),

  /**
   * Optional special event source marker
   * Used for events like crash recovery
   */
  resolution: ResolutionTypeSchema.optional(),
});

/**
 * TypeScript type inferred from Zod schema
 */
export type EventsLogRecord = z.infer<typeof EventsLogSchema>;

/**
 * Input type for creating new events (without auto-generated fields)
 */
export const CreateEventsLogSchema = EventsLogSchema.omit({
  id: true,
  isProcessed: true,
}).extend({
  // isProcessed defaults to 0 (unprocessed) for new events
  isProcessed: z.literal(0).default(0),
});

/**
 * TypeScript type for creating new events
 */
export type CreateEventsLogRecord = z.infer<typeof CreateEventsLogSchema>;

/**
 * Update type for modifying existing events
 */
export const UpdateEventsLogSchema = EventsLogSchema.partial().extend({
  // ID is required for updates
  id: z.number().int().positive(),
});

/**
 * TypeScript type for updating events
 */
export type UpdateEventsLogRecord = z.infer<typeof UpdateEventsLogSchema>;

/**
 * Validation helper functions
 */
export const EventsLogValidation = {
  /**
   * Validate a complete events log record
   */
  validateRecord: (data: unknown): EventsLogRecord => {
    return EventsLogSchema.parse(data);
  },

  /**
   * Safely validate a complete events log record
   */
  safeValidateRecord: (data: unknown) => {
    return EventsLogSchema.safeParse(data);
  },

  /**
   * Validate data for creating a new event
   */
  validateCreate: (data: unknown): CreateEventsLogRecord => {
    return CreateEventsLogSchema.parse(data);
  },

  /**
   * Safely validate data for creating a new event
   */
  safeValidateCreate: (data: unknown) => {
    return CreateEventsLogSchema.safeParse(data);
  },

  /**
   * Validate data for updating an event
   */
  validateUpdate: (data: unknown): UpdateEventsLogRecord => {
    return UpdateEventsLogSchema.parse(data);
  },

  /**
   * Safely validate data for updating an event
   */
  safeValidateUpdate: (data: unknown) => {
    return UpdateEventsLogSchema.safeParse(data);
  },
};
