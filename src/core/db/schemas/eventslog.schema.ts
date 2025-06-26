/**
 * Events Log Schema Definition
 *
 * This file defines the schema for the eventslog table based on LLD specification.
 * The table stores raw domain events as the source of truth for the system.
 */

/**
 * Event type enumeration based on LLD specification
 */
export type EventType =
  | 'open_time_start'
  | 'open_time_end'
  | 'active_time_start'
  | 'active_time_end'
  | 'checkpoint';

/**
 * Resolution type for special event source markers
 */
export type ResolutionType = 'crash_recovery';

/**
 * Events log table record interface
 *
 * This interface defines the structure of records stored in the `eventslog` table.
 * It serves as the source of truth for raw domain events within the system.
 *
 * @property {number} [id] - Primary key, auto-increment.
 * @property {number} timestamp - Event occurrence timestamp (Unix timestamp in milliseconds).
 * @property {EventType} eventType - Event type enumeration.
 * @property {number} tabId - Associated browser tab ID.
 * @property {string} url - Complete URL (including path and parameters).
 * @property {string} visitId - Unique visit identifier (UUID), bound to Open Time lifecycle.
 * @property {string | null} activityId - Unique activity interval identifier (UUID), bound to Active Time lifecycle. Can be null for events not associated with activity.
 * @property {0 | 1} isProcessed - Whether processed by aggregator (0 = false, 1 = true). Indexed field for fast query of unprocessed events.
 * @property {ResolutionType} [resolution] - Optional special event source marker. Used for events like crash recovery.
 */
export interface EventsLogRecord {
  /**
   * Primary key, auto-increment
   */
  id?: number;

  /**
   * Event occurrence timestamp (Unix timestamp in milliseconds)
   */
  timestamp: number;

  /**
   * Event type enumeration
   */
  eventType: EventType;

  /**
   * Associated browser tab ID
   */
  tabId: number;

  /**
   * Complete URL (path and key parameters)
   */
  url: string;

  /**
   * Unique visit identifier (UUID), bound to Open Time lifecycle
   */
  visitId: string;

  /**
   * Unique activity interval identifier (UUID), bound to Active Time lifecycle
   * Can be null for events not associated with activity
   */
  activityId: string | null;

  /**
   * Whether processed by aggregator (0 = false, 1 = true)
   * Indexed field for fast query of unprocessed events
   */
  isProcessed: 0 | 1;

  /**
   * Optional special event source marker
   * Used for events like crash recovery
   */
  resolution?: ResolutionType;
}

/**
 * Dexie schema string for eventslog table
 *
 * Schema breakdown:
 * - ++id: Auto-increment primary key
 * - isProcessed: Index for fast query of unprocessed events
 * - visitId: Index for grouping by visit session
 * - activityId: Index for grouping by activity interval
 */
export const EVENTSLOG_SCHEMA = '++id, isProcessed, visitId, activityId';

/**
 * Table name constant
 */
export const EVENTSLOG_TABLE_NAME = 'eventslog';
