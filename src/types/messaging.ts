/**
 * Messaging Protocol Types for Popup Debug Interface
 *
 * This module defines type-safe messaging protocols between the Popup
 * and Background scripts for debugging and data visualization purposes.
 */

import { z } from 'zod/v4';
import type { EventsLogRecord, AggregatedStatsRecord } from '@/core/db';

// ============================================================================
// Request/Response Schemas
// ============================================================================

/**
 * Schema for tab data request from Popup to Background
 */
export const TabDataRequestSchema = z.object({
  /** Tab ID to get data for */
  tabId: z.number().int().nonnegative(),
});

export type TabDataRequest = z.infer<typeof TabDataRequestSchema>;

/**
 * Schema for successful tab data response from Background to Popup
 */
export const TabDataResponseSchema = z.object({
  /** Events log data for the tab */
  events: z.array(z.unknown()), // Will be EventsLogRecord[] at runtime

  /** Aggregated statistics for the tab's domain */
  stats: z.array(z.unknown()), // Will be AggregatedStatsRecord[] at runtime

  /** Current tab information */
  tabInfo: z.object({
    /** Tab ID */
    id: z.number().int().nonnegative(),

    /** Tab URL */
    url: z.string().url(),

    /** Extracted hostname/origin */
    hostname: z.string(),

    /** Tab title */
    title: z.string().optional(),
  }),
});

export type TabDataResponse = z.infer<typeof TabDataResponseSchema>;

/**
 * Schema for error response from Background to Popup
 */
export const TabDataErrorResponseSchema = z.object({
  /** Error message */
  error: z.string(),

  /** Error code for categorization */
  code: z.enum(['TAB_NOT_FOUND', 'DATABASE_ERROR', 'PERMISSION_DENIED', 'UNKNOWN_ERROR']),
});

export type TabDataErrorResponse = z.infer<typeof TabDataErrorResponseSchema>;

// ============================================================================
// Protocol Map Definition
// ============================================================================

/**
 * Schema for manual aggregation request
 */
export const ManualAggregationRequestSchema = z.object({
  /** Optional force flag to bypass locks */
  force: z.boolean().optional(),
});

export type ManualAggregationRequest = z.infer<typeof ManualAggregationRequestSchema>;

/**
 * Schema for manual aggregation response
 */
export const ManualAggregationResponseSchema = z.object({
  /** Whether the aggregation was successful */
  success: z.boolean(),

  /** Number of events processed */
  processedEvents: z.number().optional(),

  /** Duration in milliseconds */
  duration: z.number().optional(),

  /** Error message if failed */
  error: z.string().optional(),
});

export type ManualAggregationResponse = z.infer<typeof ManualAggregationResponseSchema>;

/**
 * Protocol map for Popup debugging interface messaging
 * Extends the existing TrackerProtocolMap with debug-specific messages
 */
export interface PopupDebugProtocolMap {
  /** Popup requests tab data from Background */
  getTabDataRequest: (data: TabDataRequest) => Promise<TabDataResponse | TabDataErrorResponse>;

  /** Popup requests manual aggregation from Background */
  triggerManualAggregation: (data: ManualAggregationRequest) => Promise<ManualAggregationResponse>;
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isTabDataErrorResponse(
  response: TabDataResponse | TabDataErrorResponse
): response is TabDataErrorResponse {
  return 'error' in response;
}

/**
 * Type guard to check if response is successful
 */
export function isTabDataResponse(
  response: TabDataResponse | TabDataErrorResponse
): response is TabDataResponse {
  return 'events' in response && 'stats' in response;
}

// ============================================================================
// Runtime Type Definitions
// ============================================================================

/**
 * Runtime type for events data (properly typed)
 */
export interface EventsData extends Omit<TabDataResponse, 'events'> {
  events: EventsLogRecord[];
}

/**
 * Runtime type for stats data (properly typed)
 */
export interface StatsData extends Omit<TabDataResponse, 'stats'> {
  stats: AggregatedStatsRecord[];
}

/**
 * Complete runtime type for tab data response
 */
export interface CompleteTabDataResponse {
  events: EventsLogRecord[];
  stats: AggregatedStatsRecord[];
  tabInfo: {
    id: number;
    url: string;
    hostname: string;
    title?: string;
  };
}
