/**
 * EventsLog Repository Implementation
 *
 * This file implements the repository pattern for the eventslog table,
 * providing type-safe CRUD operations and domain-specific query methods.
 */

import {
  BaseRepository,
  ValidationError,
  type RepositoryOptions,
  type InsertType,
} from './base.repository';
import type { IDType } from 'dexie';
import type { WebTimeTrackerDB } from '../schemas';
import type { EventsLogRecord, EventType } from '../schemas/eventslog.schema';
import { EventsLogValidation } from '../models/eventslog.model';

/**
 * Query options for EventsLog operations
 */
export interface EventsLogQueryOptions extends RepositoryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'id';
  orderDirection?: 'asc' | 'desc';
}

/**
 * EventsLog Repository Class
 *
 * Provides data access operations for the eventslog table with type safety,
 * validation, and domain-specific query methods.
 * Uses auto-increment primary key 'id', so InsertType makes 'id' optional.
 */
export class EventsLogRepository extends BaseRepository<EventsLogRecord, 'id'> {
  constructor(db: WebTimeTrackerDB) {
    // Direct use of EntityTable without type assertion
    super(db, db.eventslog, 'eventslog');
  }

  /**
   * Create a new event log entry
   *
   * @param event - The event data to create (without id and with isProcessed defaulting to 0)
   * @param options - Repository operation options
   * @returns Promise resolving to the generated event ID
   */
  async createEvent(
    event: Omit<EventsLogRecord, 'id' | 'isProcessed'>,
    options: RepositoryOptions = {}
  ): Promise<number> {
    const eventWithDefaults: Omit<EventsLogRecord, 'id'> = {
      ...event,
      isProcessed: 0, // New events are always unprocessed
    };

    return this.create(eventWithDefaults, options) as Promise<number>;
  }

  /**
   * Get unprocessed events for aggregation
   *
   * @param options - Query options
   * @returns Promise resolving to array of unprocessed events
   */
  async getUnprocessedEvents(options: EventsLogQueryOptions = {}): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderBy = 'timestamp', orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          let collection = this.table.where('isProcessed').equals(0);

          // Apply ordering
          if (orderBy === 'timestamp') {
            // For timestamp sorting, we need to sort in memory since timestamp is not indexed
            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination for non-timestamp ordering
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          return collection.toArray();
        },
        'getUnprocessedEvents',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getUnprocessedEvents');
    }
  }

  /**
   * Mark events as processed by their IDs
   *
   * @param eventIds - Array of event IDs to mark as processed
   * @param options - Repository operation options
   * @returns Promise resolving to the number of updated events
   */
  async markEventsAsProcessed(
    eventIds: number[],
    options: RepositoryOptions = {}
  ): Promise<number> {
    try {
      if (eventIds.length === 0) {
        return 0;
      }

      const result = await this.executeWithRetry(
        async () => {
          return this.db.transaction('rw', 'eventslog', async () => {
            let updatedCount = 0;
            for (const id of eventIds) {
              const updateResult = await this.table.update(id, { isProcessed: 1 });
              updatedCount += updateResult;
            }
            return updatedCount;
          });
        },
        'markEventsAsProcessed',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'markEventsAsProcessed');
    }
  }

  /**
   * Get events by visit ID
   *
   * @param visitId - The visit identifier
   * @param options - Query options
   * @returns Promise resolving to array of events for the visit
   */
  async getEventsByVisitId(
    visitId: string,
    options: EventsLogQueryOptions = {}
  ): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderBy = 'timestamp', orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          let collection = this.table.where('visitId').equals(visitId);

          // Apply ordering
          if (orderBy === 'timestamp') {
            // For timestamp sorting, we need to sort in memory since timestamp is not indexed
            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination for non-timestamp ordering
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          return collection.toArray();
        },
        'getEventsByVisitId',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getEventsByVisitId');
    }
  }

  /**
   * Get events by activity ID
   *
   * @param activityId - The activity identifier
   * @param options - Query options
   * @returns Promise resolving to array of events for the activity
   */
  async getEventsByActivityId(
    activityId: string,
    options: EventsLogQueryOptions = {}
  ): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderBy = 'timestamp', orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          let collection = this.table.where('activityId').equals(activityId);

          // Apply ordering
          if (orderBy === 'timestamp') {
            // For timestamp sorting, we need to sort in memory since timestamp is not indexed
            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination for non-timestamp ordering
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          return collection.toArray();
        },
        'getEventsByActivityId',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getEventsByActivityId');
    }
  }

  /**
   * Get events by type within a time range
   *
   * @param eventType - The event type to filter by
   * @param startTime - Start timestamp (inclusive)
   * @param endTime - End timestamp (inclusive)
   * @param options - Query options
   * @returns Promise resolving to array of events
   */
  async getEventsByTypeAndTimeRange(
    eventType: EventType,
    startTime: number,
    endTime: number,
    options: EventsLogQueryOptions = {}
  ): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          let collection = this.table
            .where('timestamp')
            .between(startTime, endTime, true, true)
            .filter((event: EventsLogRecord) => event.eventType === eventType);

          // Apply ordering
          collection = orderDirection === 'desc' ? collection.reverse() : collection;

          // Apply pagination
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          return collection.toArray();
        },
        'getEventsByTypeAndTimeRange',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getEventsByTypeAndTimeRange');
    }
  }

  /**
   * Get unprocessed events within a specific time range.
   *
   * @param startTime - The minimum timestamp for events to fetch (inclusive).
   * @param options - Query options, such as limit and offset.
   * @returns A promise that resolves to an array of unprocessed event records.
   */
  async getUnprocessedEventsByTimeRange(
    startTime: number,
    options: EventsLogQueryOptions = {}
  ): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderBy = 'timestamp', orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          const collection = this.table
            .where('isProcessed')
            .equals(0)
            .and(event => event.timestamp >= startTime);

          // Manual sorting for timestamp since it's not a primary index for this compound query
          const results = await collection.toArray();
          const sorted = this.sortRecords(results, orderBy, orderDirection);

          // Apply pagination manually
          const start = offset;
          const end = limit ? start + limit : undefined;
          return sorted.slice(start, end);
        },
        'getUnprocessedEventsByTimeRange',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getUnprocessedEventsByTimeRange');
    }
  }

  /**
   * Delete events by IDs (for data cleanup)
   *
   * @param eventIds - Array of event IDs to delete
   * @param options - Repository operation options
   * @returns Promise resolving to the number of deleted events
   */
  async deleteEventsByIds(eventIds: number[], options: RepositoryOptions = {}): Promise<number> {
    try {
      if (eventIds.length === 0) {
        return 0;
      }

      const result = await this.executeWithRetry(
        async () => {
          return this.db.transaction('rw', 'eventslog', async () => {
            let deletedCount = 0;
            for (const id of eventIds) {
              await this.table.delete(id);
              deletedCount++;
            }
            return deletedCount;
          });
        },
        'deleteEventsByIds',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'deleteEventsByIds');
    }
  }

  /**
   * Get count of unprocessed events
   *
   * @param options - Repository operation options
   * @returns Promise resolving to the count of unprocessed events
   */
  async getUnprocessedEventsCount(options: RepositoryOptions = {}): Promise<number> {
    try {
      const result = await this.executeWithRetry(
        async () => {
          return this.table.where('isProcessed').equals(0).count();
        },
        'getUnprocessedEventsCount',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getUnprocessedEventsCount');
    }
  }

  /**
   * Creates "checkpoint" events for all sessions that are currently open.
   * An open session is defined as a sequence of events sharing a `visitId` or `activityId`
   * that has a "start" event but no corresponding "end" event among the unprocessed logs.
   *
   * This mechanism allows the aggregation engine to calculate time for ongoing activities
   * without waiting for them to formally close.
   *
   * @param checkpointTime - The timestamp to use for the new checkpoint events, typically `Date.now()`.
   * @param options - Repository operation options.
   * @returns A promise that resolves when the operation is complete.
   */
  async createCheckpointsForOpenSessions(
    checkpointTime: number,
    options: RepositoryOptions = {}
  ): Promise<void> {
    try {
      await this.executeWithRetry(
        async () => {
          // 1. Fetch all unprocessed events
          const unprocessedEvents = await this.getUnprocessedEvents({ orderBy: 'id', orderDirection: 'asc' });
          if (unprocessedEvents.length === 0) {
            this.logger.debug('No unprocessed events found, skipping checkpoint creation.');
            return;
          }

          // 2. Group events by visitId and activityId to track sessions
          const sessions = new Map<string, { lastEvent: EventsLogRecord; hasEnd: boolean }>();

          for (const event of unprocessedEvents) {
            // Track open_time sessions by visitId
            const openTimeKey = `visit-${event.visitId}`;
            if (!sessions.has(openTimeKey)) {
              sessions.set(openTimeKey, { lastEvent: event, hasEnd: false });
            }
            if (event.eventType === 'open_time_start') {
              sessions.set(openTimeKey, { lastEvent: event, hasEnd: false });
            } else if (event.eventType === 'open_time_end') {
              sessions.get(openTimeKey)!.hasEnd = true;
            } else {
              sessions.get(openTimeKey)!.lastEvent = event;
            }

            // Track active_time sessions by activityId
            if (event.activityId) {
              const activeTimeKey = `activity-${event.activityId}`;
              if (!sessions.has(activeTimeKey)) {
                sessions.set(activeTimeKey, { lastEvent: event, hasEnd: false });
              }
              if (event.eventType === 'active_time_start') {
                sessions.set(activeTimeKey, { lastEvent: event, hasEnd: false });
              } else if (event.eventType === 'active_time_end') {
                sessions.get(activeTimeKey)!.hasEnd = true;
              } else {
                sessions.get(activeTimeKey)!.lastEvent = event;
              }
            }
          }

          // 3. Identify open sessions and create checkpoint events
          const checkpointEvents: Omit<EventsLogRecord, 'id' | 'isProcessed'>[] = [];
          for (const [key, session] of sessions.entries()) {
            if (!session.hasEnd) {
              const { lastEvent } = session;
              const isActivity = key.startsWith('activity-');
              
              const newEvent: Omit<EventsLogRecord, 'id' | 'isProcessed'> = {
                timestamp: checkpointTime,
                eventType: 'checkpoint',
                url: lastEvent.url,
                tabId: lastEvent.tabId,
                windowId: lastEvent.windowId,
                visitId: lastEvent.visitId,
                // For open_time sessions, activityId is null.
                // For active_time sessions, it's taken from the last event.
                activityId: isActivity ? lastEvent.activityId : null,
              };
              checkpointEvents.push(newEvent);
            }
          }

          // 4. Bulk-add the new checkpoint events to the database
          if (checkpointEvents.length > 0) {
            this.logger.debug(`Creating ${checkpointEvents.length} checkpoint events.`, { checkpointEvents });
            await this.table.bulkAdd(checkpointEvents as EventsLogRecord[]);
          } else {
            this.logger.debug('No open sessions found to checkpoint.');
          }
        },
        'createCheckpointsForOpenSessions',
        options
      );
    } catch (error) {
      throw this.handleError(error, 'createCheckpointsForOpenSessions');
    }
  }

  // Validation methods implementation
  protected async validateForCreate(entity: InsertType<EventsLogRecord, 'id'>): Promise<void> {
    try {
      EventsLogValidation.validateCreate(entity);
    } catch (error) {
      throw new ValidationError(`Invalid event data for creation: ${(error as Error).message}`);
    }
  }

  protected async validateForUpdate(
    id: IDType<EventsLogRecord, 'id'>,
    changes: Partial<EventsLogRecord>
  ): Promise<void> {
    if (typeof id !== 'number' || id <= 0) {
      throw new ValidationError('Event ID must be a positive number');
    }

    // Validate partial update data
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Update changes cannot be empty');
    }

    // If updating specific fields, validate them
    if (changes.timestamp !== undefined && changes.timestamp < 1000000000000) {
      throw new ValidationError('Timestamp must be in milliseconds');
    }

    if (changes.tabId !== undefined && changes.tabId < 0) {
      throw new ValidationError('Tab ID must be non-negative');
    }

    if (changes.url !== undefined) {
      try {
        new URL(changes.url);
      } catch {
        throw new ValidationError('URL must be a valid URL');
      }
    }

    if (
      changes.visitId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(changes.visitId)
    ) {
      throw new ValidationError('Visit ID must be a valid UUID');
    }

    if (
      changes.activityId !== undefined &&
      changes.activityId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(changes.activityId)
    ) {
      throw new ValidationError('Activity ID must be a valid UUID or null');
    }
  }

  /**
   * Get processed events older than a specific timestamp.
   *
   * @param timestamp - The timestamp to compare against (events older than this timestamp).
   * @param options - Query options.
   * @returns Promise resolving to an array of processed events older than the given timestamp.
   */
  async getProcessedEventsOlderThan(
    timestamp: number,
    options: EventsLogQueryOptions = {}
  ): Promise<EventsLogRecord[]> {
    try {
      const { limit, offset = 0, orderBy = 'timestamp', orderDirection = 'asc' } = options;

      const result = await this.executeWithRetry(
        async () => {
          let collection = this.table
            .where('isProcessed')
            .equals(1) // Only processed events
            .and(event => event.timestamp < timestamp); // Older than the given timestamp

          // Apply ordering
          if (orderBy === 'timestamp') {
            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          return collection.toArray();
        },
        'getProcessedEventsOlderThan',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'getProcessedEventsOlderThan');
    }
  }

  protected async validateForUpsert(entity: InsertType<EventsLogRecord, 'id'>): Promise<void> {
    // For upsert, use the same validation as create
    await this.validateForCreate(entity);
  }
}
