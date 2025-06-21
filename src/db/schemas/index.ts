import Dexie, { type EntityTable } from 'dexie';

// Import schema definitions
import {
  type EventsLogRecord,
  EVENTSLOG_SCHEMA,
  EVENTSLOG_TABLE_NAME
} from './eventslog.schema';
import {
  type AggregatedStatsRecord,
  AGGREGATEDSTATS_SCHEMA,
  AGGREGATEDSTATS_TABLE_NAME
} from './aggregatedstats.schema';
import {
  aggregatedStatsCreatingHook,
  aggregatedStatsUpdatingHook
} from './hooks';

/**
 * Database name constant
 */
export const DATABASE_NAME = 'WebTimeTracker';

/**
 * Database version constant
 */
export const DATABASE_VERSION = 1;

// Re-export interfaces for external use
export type { EventsLogRecord, AggregatedStatsRecord };
export * from './eventslog.schema';
export * from './aggregatedstats.schema';
export * from './hooks';

/**
 * Database class extending Dexie with typed tables
 */
export class WebTimeTrackerDB extends Dexie {
  // Typed table declarations
  eventslog!: EntityTable<EventsLogRecord, 'id'>;
  aggregatedstats!: EntityTable<AggregatedStatsRecord, 'key'>;

  constructor() {
    super(DATABASE_NAME);

    // Define database schema version 1
    this.version(DATABASE_VERSION).stores({
      // Events log table with auto-increment primary key and indexes
      [EVENTSLOG_TABLE_NAME]: EVENTSLOG_SCHEMA,

      // Aggregated stats table with composite primary key and indexes
      [AGGREGATEDSTATS_TABLE_NAME]: AGGREGATEDSTATS_SCHEMA
    });

    // Register hooks for automatic metadata management
    this.aggregatedstats.hook('creating', aggregatedStatsCreatingHook);
    this.aggregatedstats.hook('updating', aggregatedStatsUpdatingHook);
  }
}

/**
 * Database instance singleton
 */
export const db = new WebTimeTrackerDB();
