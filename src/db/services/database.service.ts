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
import type { EventsLogRecord, CreateEventsLogRecord } from '../models/eventslog.model';
import type { AggregatedStatsRecord } from '../models/aggregatedstats.model';
import { connectionService } from '../connection';
import type { WebTimeTrackerDB } from '../schemas';
import { getUtcDateString } from '../schemas/aggregatedstats.schema';

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

  constructor(db: WebTimeTrackerDB) {
    this.eventsLogRepo = new EventsLogRepository(db);
    this.aggregatedStatsRepo = new AggregatedStatsRepository(db);
  }

  // ==================== EVENT CRUD OPERATIONS ====================

  /**
   * Add a new event to the database
   *
   * @param event - The event data to create (without id and isProcessed)
   * @param options - Repository operation options
   * @returns Promise resolving to the generated event ID
   * @throws {RepositoryError} If database operation fails
   */
  async addEvent(
    event: Omit<CreateEventsLogRecord, 'isProcessed'>,
    options: RepositoryOptions = {}
  ): Promise<number> {
    return this.eventsLogRepo.createEvent(event, options);
  }

  /**
   * Get unprocessed events for aggregation
   *
   * @param options - Query options for filtering and pagination
   * @returns Promise resolving to array of unprocessed events
   * @throws {RepositoryError} If database query fails
   */
  async getUnprocessedEvents(options: EventsLogQueryOptions = {}): Promise<EventsLogRecord[]> {
    return this.eventsLogRepo.getUnprocessedEvents(options);
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
    return this.eventsLogRepo.deleteEventsByIds(eventIds, options);
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

  // ==================== HEALTH CHECK OPERATIONS ====================

  /**
   * Get comprehensive database health information
   *
   * @returns Promise resolving to database health information
   * @throws {RepositoryError} If health check fails
   */
  async getDatabaseHealth(): Promise<DatabaseHealthInfo> {
    const healthStatus = await connectionService.getHealthStatus();
    const unprocessedCount = await this.eventsLogRepo.getUnprocessedEventsCount();
    const totalEvents = await this.eventsLogRepo.count();
    const totalStats = await this.aggregatedStatsRepo.count();

    return {
      isHealthy: healthStatus.isHealthy,
      unprocessedEventCount: unprocessedCount,
      totalEventCount: totalEvents,
      totalStatsCount: totalStats,
      lastProcessedDate: getUtcDateString(), // YYYY-MM-DD format using project standard
    };
  }
}

/**
 * Create a database service instance
 *
 * @param db - Database instance
 * @returns Database service instance
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
