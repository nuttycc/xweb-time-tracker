/**
 * Aggregated Stats Model Definition
 * 
 * This file defines the Zod v4 schema and TypeScript types for the aggregatedstats table,
 * providing runtime validation and type inference for aggregated statistics.
 */

import { z } from 'zod/v4';

/**
 * Aggregated stats record Zod schema
 * 
 * Based on LLD section 3.3 aggregated_stats table structure
 */
export const AggregatedStatsSchema = z.object({
  /**
   * Primary key in format "YYYY-MM-DD:full_url"
   * Ensures uniqueness for each URL per day
   */
  key: z.string().regex(/^\d{4}-\d{2}-\d{2}:.+$/, 'Key must be in format YYYY-MM-DD:url'),

  /**
   * Date in YYYY-MM-DD format (UTC date)
   * Indexed field for date-based queries
   * Must be UTC date as per project rules
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),

  /**
   * Complete URL as minimum aggregation granularity
   */
  url: z.string().url(),

  /**
   * URL hostname for mid-level aggregation
   * Indexed field for hostname-based queries
   */
  hostname: z.string().min(1),

  /**
   * URL parent domain based on PSL (Public Suffix List) calculation
   * Indexed field for top-level aggregation
   */
  parentDomain: z.string().min(1),

  /**
   * Accumulated open time in seconds
   */
  total_open_time: z.number().nonnegative(),

  /**
   * Accumulated active time in seconds
   */
  total_active_time: z.number().nonnegative(),

  /**
   * Last update timestamp (Unix timestamp in milliseconds from Date.now())
   * Key dependency for FR-4C smart merge logic implementation
   * Must be Unix timestamp as per project rules
   */
  last_updated: z.number().int().positive()
});

/**
 * TypeScript type inferred from Zod schema
 */
export type AggregatedStatsRecord = z.infer<typeof AggregatedStatsSchema>;

/**
 * Input type for creating new aggregated stats (without auto-managed fields)
 */
export const CreateAggregatedStatsSchema = AggregatedStatsSchema.omit({ 
  last_updated: true 
}).extend({
  // last_updated will be automatically set by Dexie hooks
  last_updated: z.number().int().positive().optional()
});

/**
 * TypeScript type for creating new aggregated stats
 */
export type CreateAggregatedStatsRecord = z.infer<typeof CreateAggregatedStatsSchema>;

/**
 * Update type for modifying existing aggregated stats
 */
export const UpdateAggregatedStatsSchema = AggregatedStatsSchema.partial().extend({
  // Key is required for updates
  key: z.string().regex(/^\d{4}-\d{2}-\d{2}:.+$/, 'Key must be in format YYYY-MM-DD:url')
});

/**
 * TypeScript type for updating aggregated stats
 */
export type UpdateAggregatedStatsRecord = z.infer<typeof UpdateAggregatedStatsSchema>;

/**
 * Schema for upsert operations (insert or update)
 */
export const UpsertAggregatedStatsSchema = AggregatedStatsSchema.omit({ 
  last_updated: true 
}).extend({
  // last_updated is optional for upsert, will be managed by hooks
  last_updated: z.number().int().positive().optional()
});

/**
 * TypeScript type for upsert operations
 */
export type UpsertAggregatedStatsRecord = z.infer<typeof UpsertAggregatedStatsSchema>;

/**
 * Query schema for date range queries
 */
export const DateRangeQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
}).refine(
  (data) => data.startDate <= data.endDate,
  { message: 'Start date must be less than or equal to end date' }
);

/**
 * TypeScript type for date range queries
 */
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;

/**
 * Validation helper functions
 */
export const AggregatedStatsValidation = {
  /**
   * Validate a complete aggregated stats record
   */
  validateRecord: (data: unknown): AggregatedStatsRecord => {
    return AggregatedStatsSchema.parse(data);
  },

  /**
   * Safely validate a complete aggregated stats record
   */
  safeValidateRecord: (data: unknown) => {
    return AggregatedStatsSchema.safeParse(data);
  },

  /**
   * Validate data for creating new aggregated stats
   */
  validateCreate: (data: unknown): CreateAggregatedStatsRecord => {
    return CreateAggregatedStatsSchema.parse(data);
  },

  /**
   * Safely validate data for creating new aggregated stats
   */
  safeValidateCreate: (data: unknown) => {
    return CreateAggregatedStatsSchema.safeParse(data);
  },

  /**
   * Validate data for updating aggregated stats
   */
  validateUpdate: (data: unknown): UpdateAggregatedStatsRecord => {
    return UpdateAggregatedStatsSchema.parse(data);
  },

  /**
   * Safely validate data for updating aggregated stats
   */
  safeValidateUpdate: (data: unknown) => {
    return UpdateAggregatedStatsSchema.safeParse(data);
  },

  /**
   * Validate data for upsert operations
   */
  validateUpsert: (data: unknown): UpsertAggregatedStatsRecord => {
    return UpsertAggregatedStatsSchema.parse(data);
  },

  /**
   * Safely validate data for upsert operations
   */
  safeValidateUpsert: (data: unknown) => {
    return UpsertAggregatedStatsSchema.safeParse(data);
  },

  /**
   * Validate date range query parameters
   */
  validateDateRange: (data: unknown): DateRangeQuery => {
    return DateRangeQuerySchema.parse(data);
  },

  /**
   * Safely validate date range query parameters
   */
  safeValidateDateRange: (data: unknown) => {
    return DateRangeQuerySchema.safeParse(data);
  }
};
