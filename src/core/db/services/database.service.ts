/**
 * Database Service - Core CRUD Operations
 *
 * This service provides a clean, type-safe interface for database operations
 * following the Core Task Plan requirements. It strictly implements CRUD operations
 * without any business logic, maintaining clear separation of concerns.
 */

import { EventsLogRepository, AggregatedStatsRepository } from '../repositories';
import type {
  TimeAggregationData,
  AggregatedStatsQueryOptions,
  RepositoryOptions,
  EventsLogQueryOptions,
} from '../repositories';
import type { EventsLogRecord } from '../models/eventslog.model';
import { CreateEventsLogSchema } from '../models/eventslog.model';
import type { AggregatedStatsRecord } from '../models/aggregatedstats.model';
import type { WebTimeTrackerDB } from '../schemas';
import { getUtcDateString } from '../schemas/aggregatedstats.schema';
import type { ConnectionService } from '../connection/service';
import { createLogger } from '@/utils/logger';

/**
 * Database health information interface
 */
export interface DatabaseHealthInfo {
  isHealthy: boolean;
  unprocessedEventCount: number;
  totalEventCount: number;
  totalStatsCount: number;
  lastProcessedDate?: string;
}

/**
 * Database Service Class
 *
 * Provides pure CRUD operations for database access, strictly following
 * the Core Task Plan architecture boundaries. This service:
 * - Contains NO business logic
 * - Provides only data access operations
 * - Maintains type safety throughout
 * - Handles error propagation from repository layer
 */
export class DatabaseService {
  private eventsLogRepo: EventsLogRepository;
  private aggregatedStatsRepo: AggregatedStatsRepository;
  private static readonly logger = createLogger('DB');

  constructor(db: WebTimeTrackerDB) {
    this.eventsLogRepo = new EventsLogRepository(db);
    this.aggregatedStatsRepo = new AggregatedStatsRepository(db);
  }

  // ==================== EVENT CRUD OPERATIONS ====================

  /**
   * Add a new event to the database
   *
   * @param event - The event data to create (without id, isProcessed will be set to 0)
   * @param options - Repository operation options
   * @returns Promise resolving to the generated event ID
   * @throws {RepositoryError} If database operation fails
   */
  async addEvent(
    event: Omit<EventsLogRecord, 'id' | 'isProcessed'>,
    options: RepositoryOptions = {}
  ): Promise<number> {
    const eventWithProcessed = { ...event, isProcessed: 0 as const };

    try {
      // Validate the event data structure before writing to the database
      CreateEventsLogSchema.parse(eventWithProcessed);
    } catch (error) {
      DatabaseService.logger.error('Event validation failed. Aborting database write.', {
        eventType: event.eventType,
        error, // Zod provides detailed error information
      });
      // Re-throw the error to notify the caller of the invalid data
      throw new Error('Database write aborted due to invalid event data.');
    }

    // Add isProcessed: 0 for new events
    DatabaseService.logger.info('💾 Added single event to eventsLogRepo', { eventType: event.eventType, tabId: event.tabId });
    return this.eventsLogRepo.createEvent(eventWithProcessed, options);
  }

  /**
   * Get unprocessed events for aggregation
   *
   * @param options - Query options for filtering and pagination
   * @returns Promise resolving to array of unprocessed events
   * @throws {RepositoryError} If database query fails
   */
  async getUnprocessedEvents(options: EventsLogQueryOptions = {}): Promise<EventsLogRecord[]> {
    const events = await this.eventsLogRepo.getUnprocessedEvents(options);
    DatabaseService.logger.debug(`🔍 Found ${events.length} unprocessed events`);
    return events;
  }

  /**
   * Mark events as processed by their IDs
   *
   * @param eventIds - Array of event IDs to mark as processed
   * @param options - Repository operation options
   * @returns Promise resolving to the number of updated events
   * @throws {RepositoryError} If database operation fails
   */
  async markEventsAsProcessed(
    eventIds: number[],
    options: RepositoryOptions = {}
  ): Promise<number> {
    DatabaseService.logger.info(`✅ Marked ${eventIds.length} events as processed`);
    return this.eventsLogRepo.markEventsAsProcessed(eventIds, options);
  }

  /**
   * Delete events by their IDs
   *
   * @param eventIds - Array of event IDs to delete
   * @param options - Repository operation options
   * @returns Promise resolving to the number of deleted events
   * @throws {RepositoryError} If database operation fails
   */
  async deleteEventsByIds(eventIds: number[], options: RepositoryOptions = {}): Promise<number> {
    DatabaseService.logger.info(`🗑️ Deleted ${eventIds.length} events`);
    return this.eventsLogRepo.deleteEventsByIds(eventIds, options);
  }

  /**
   * Get processed events older than a given timestamp.
   *
   * @param timestamp - The timestamp to compare against.
   * @param options - Query options for filtering and pagination.
   * @returns Promise resolving to an array of processed events.
   * @throws {RepositoryError} If the database query fails.
   */
  async getProcessedEvents(
    timestamp: number,
    options: EventsLogQueryOptions = {},
  ): Promise<EventsLogRecord[]> {
    const events = await this.eventsLogRepo.getProcessedEventsOlderThan(timestamp, options);
    DatabaseService.logger.debug(`🔍 Found ${events.length} processed events older than ${new Date(timestamp).toISOString()}`);
    return events;
  }

  // ==================== STATS CRUD OPERATIONS ====================

  /**
   * Insert or update aggregated statistics
   *
   * @param data - Time aggregation data for upsert operation
   * @param options - Repository operation options
   * @returns Promise resolving to the primary key
   * @throws {RepositoryError} If database operation fails
   */
  async upsertStat(data: TimeAggregationData, options: RepositoryOptions = {}): Promise<string> {
    DatabaseService.logger.info('💾 Upserted statistics', { hostname: data.hostname, date: data.date });
    return this.aggregatedStatsRepo.upsertTimeAggregation(data, options);
  }

  /**
   * Get aggregated statistics by date range
   *
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @param options - Query options for filtering and pagination
   * @returns Promise resolving to array of aggregated stats
   * @throws {RepositoryError} If database query fails
   */
  async getStatsByDateRange(
    startDate: string,
    endDate: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    DatabaseService.logger.debug('🔍 Getting aggregated statistics by date range', { startDate, endDate });
    return this.aggregatedStatsRepo.getStatsByDateRange(startDate, endDate, options);
  }

  /**
   * Get aggregated statistics by hostname
   *
   * @param hostname - The hostname to filter by
   * @param options - Query options for filtering and pagination
   * @returns Promise resolving to array of aggregated stats
   * @throws {RepositoryError} If database query fails
   */
  async getStatsByHostname(
    hostname: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    return this.aggregatedStatsRepo.getStatsByHostname(hostname, options);
  }

  /**
   * Get aggregated statistics by parent domain
   *
   * @param parentDomain - The parent domain to filter by
   * @param options - Query options for filtering and pagination
   * @returns Promise resolving to array of aggregated stats
   * @throws {RepositoryError} If database query fails
   */
  async getStatsByParentDomain(
    parentDomain: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    return this.aggregatedStatsRepo.getStatsByParentDomain(parentDomain, options);
  }

  /**
   * Get all unprocessed events relevant for recovery in a single query.
   *
   * Fetches all event types needed for orphan detection that are unprocessed
   * and occurred after a specific timestamp.
   *
   * @param startTime - The minimum timestamp for events to fetch.
   * @param options - Additional query options.
   * @returns A promise that resolves to an array of event records.
   */
  async getUnprocessedEventsForRecovery(
    startTime: number,
    options: EventsLogQueryOptions = {},
  ): Promise<EventsLogRecord[]> {
    DatabaseService.logger.debug(
      `🔍 Getting all unprocessed events for recovery since ${new Date(startTime).toISOString()}`,
    );
    return this.eventsLogRepo.getUnprocessedEventsByTimeRange(
      startTime,
      options,
    );
  }

  // ==================== HEALTH CHECK OPERATIONS ====================

  /**
   * Get events by type and time range
   *
   * @param eventType - Type of events to retrieve
   * @param startTime - Start timestamp (inclusive)
   * @param endTime - End timestamp (inclusive)
   * @param options - Query options
   * @returns Promise resolving to array of events
   * @throws {RepositoryError} If query fails
   */
  async getEventsByTypeAndTimeRange(
    eventType:
      | 'open_time_start'
      | 'active_time_start'
      | 'open_time_end'
      | 'active_time_end'
      | 'checkpoint',
    startTime: number,
    endTime: number,
    options?: EventsLogQueryOptions
  ): Promise<EventsLogRecord[]> {
    return this.eventsLogRepo.getEventsByTypeAndTimeRange(eventType, startTime, endTime, options);
  }

  /**
   * Get events by visit ID
   *
   * @param visitId - Visit identifier
   * @param options - Query options
   * @returns Promise resolving to array of events
   * @throws {RepositoryError} If query fails
   */
  async getEventsByVisitId(
    visitId: string,
    options?: EventsLogQueryOptions
  ): Promise<EventsLogRecord[]> {
    return this.eventsLogRepo.getEventsByVisitId(visitId, options);
  }

  /**
   * Get events by activity ID
   *
   * @param activityId - Activity identifier
   * @param options - Query options
   * @returns Promise resolving to array of events
   * @throws {RepositoryError} If query fails
   */
  async getEventsByActivityId(
    activityId: string,
    options?: EventsLogQueryOptions
  ): Promise<EventsLogRecord[]> {
    return this.eventsLogRepo.getEventsByActivityId(activityId, options);
  }

  /**
   * Get comprehensive database health information
   *
   * @returns Promise resolving to database health information
   * @throws {RepositoryError} If health check fails
   */
  async getDatabaseHealth(): Promise<DatabaseHealthInfo> {
    let isHealthy = false;
    let unprocessedCount = 0;
    let totalEvents = 0;
    let totalStats = 0;

    try {
      // Get database operation results
      unprocessedCount = await this.eventsLogRepo.getUnprocessedEventsCount();
      totalEvents = await this.eventsLogRepo.count();
      totalStats = await this.aggregatedStatsRepo.count();

      // If database operations succeeded, consider it healthy
      isHealthy = true;
    } catch (error) {
      console.warn('Database health check failed:', error);
      isHealthy = false;
      // Keep default values (0) for counts when health check fails
    }

    return {
      isHealthy,
      unprocessedEventCount: unprocessedCount,
      totalEventCount: totalEvents,
      totalStatsCount: totalStats,
      lastProcessedDate: getUtcDateString(), // YYYY-MM-DD format using project standard
    };
  }
}

/**
 * Creates a new DatabaseService instance using the given database connection.
 *
 * @returns The initialized DatabaseService
 */
export function createDatabaseService(db: WebTimeTrackerDB): DatabaseService {
  return new DatabaseService(db);
}

/**
 * Singleton instance using the default database
 * Note: This will be initialized lazily when first accessed
 */
let _databaseServiceInstance: DatabaseService | null = null;

export const databaseService = {
  async getInstance(): Promise<DatabaseService> {
    if (!_databaseServiceInstance) {
      const { db } = await import('../schemas');
      _databaseServiceInstance = createDatabaseService(db);
    }
    return _databaseServiceInstance;
  },
};
