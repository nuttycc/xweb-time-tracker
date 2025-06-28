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
import type { WebTimeTrackerDB } from '../schemas';
import { getUtcDateString } from '../schemas/aggregatedstats.schema';
import type { ConnectionService } from '../connection/service';

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
 * Health checker interface for dependency injection
 */
export interface HealthChecker {
  getHealthStatus(): Promise<{ isHealthy: boolean }>;
}

/**
 * Connection service health checker adapter
 */
export class ConnectionServiceHealthChecker implements HealthChecker {
  constructor(private connectionService: ConnectionService) {}

  async getHealthStatus(): Promise<{ isHealthy: boolean }> {
    const health = await this.connectionService.getHealthStatus();
    return { isHealthy: health.isHealthy };
  }
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
  private healthChecker?: HealthChecker;

  constructor(db: WebTimeTrackerDB, healthChecker?: HealthChecker) {
    this.eventsLogRepo = new EventsLogRepository(db);
    this.aggregatedStatsRepo = new AggregatedStatsRepository(db);
    this.healthChecker = healthChecker;
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
    event: Omit<CreateEventsLogRecord, 'id' | 'isProcessed'>,
    options: RepositoryOptions = {}
  ): Promise<number> {
    // Add isProcessed: 0 for new events
    const eventWithProcessed = { ...event, isProcessed: 0 as const };
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
      // Get database operation results first
      unprocessedCount = await this.eventsLogRepo.getUnprocessedEventsCount();
      totalEvents = await this.eventsLogRepo.count();
      totalStats = await this.aggregatedStatsRepo.count();

      // Check health using injected health checker
      if (this.healthChecker) {
        const connectionHealth = await this.healthChecker.getHealthStatus();
        isHealthy = connectionHealth.isHealthy;
      } else {
        // No health checker provided - perform basic health check
        // If database operations succeeded, consider it healthy
        isHealthy = true;
      }
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
 * Creates a new DatabaseService instance with optional health checker integration.
 *
 * If a health checker is provided, it will be used for health status queries; otherwise, default health checks are used.
 *
 * @returns A DatabaseService instance configured with the given database and optional health checker.
 */
export function createDatabaseService(db: WebTimeTrackerDB, healthChecker?: HealthChecker): DatabaseService {
  return new DatabaseService(db, healthChecker);
}

/**
 * Creates a `DatabaseService` instance configured with a health checker that uses the provided connection service.
 *
 * The returned service supports health monitoring by delegating health checks to the given connection service.
 *
 * @returns A `DatabaseService` instance with integrated health checking.
 */
export function createDatabaseServiceWithHealthChecker(db: WebTimeTrackerDB, connectionService: ConnectionService): DatabaseService {
  const healthChecker = new ConnectionServiceHealthChecker(connectionService);
  return new DatabaseService(db, healthChecker);
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
      const { connectionService } = await import('../connection');
      _databaseServiceInstance = createDatabaseServiceWithHealthChecker(db, connectionService);
    }
    return _databaseServiceInstance;
  },
};
