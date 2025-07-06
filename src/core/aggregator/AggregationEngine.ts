import type { EventsLogRecord } from '../db/models/eventslog.model';
import type { EventsLogRepository } from '../db/repositories/eventslog.repository';
import type { AggregatedStatsRepository } from '../db/repositories/aggregatedstats.repository';
import type { AggregationResult, VisitGroup, AggregatedData } from './types';
import { getUtcDateString } from '../db/schemas/aggregatedstats.schema';
import { createLogger } from '@/utils/logger';
import * as psl from 'psl';

/**
 * AggregationEngine class
 *
 * Core component for processing raw event logs and converting them into
 * aggregated statistical data.
 */
export class AggregationEngine {
  private static readonly logger = createLogger('⚙️ AggregationEngine');

  /**
   * @param eventsLogRepo - Repository for accessing event log data.
   * @param aggregatedStatsRepo - Repository for storing aggregated statistics.
   */
  constructor(
    private readonly eventsLogRepo: EventsLogRepository,
    private readonly aggregatedStatsRepo: AggregatedStatsRepository
  ) {}

  /**
   * Runs the entire aggregation process.
   *
   * Fetches unprocessed events, processes them, and saves the aggregated data.
   *
   * @returns A promise that resolves to an AggregationResult.
   */
  public async run(): Promise<AggregationResult> {
    AggregationEngine.logger.info('Aggregation started');

    try {
      // Create checkpoints for all open sessions before fetching events
      await this.eventsLogRepo.createCheckpointsForOpenSessions(Date.now());

      // this.logger.debug('Fetching unprocessed events');
      // Use ID ordering to preserve logical sequence, not timestamp ordering
      const unprocessedEvents = await this.eventsLogRepo.getUnprocessedEvents({
        orderBy: 'id',
        orderDirection: 'asc',
      });

      AggregationEngine.logger.info(`Fetched ${unprocessedEvents.length} unprocessed events`);
      AggregationEngine.logger.debug('Fetched unprocessed events', {
        count: unprocessedEvents.length,
        unprocessedEvents,
      });

      if (unprocessedEvents.length === 0) {
        AggregationEngine.logger.info('No unprocessed events, aggregation finished');
        return { success: true, processedEvents: 0 };
      }

      await this.processEvents(unprocessedEvents);

      AggregationEngine.logger.info('Aggregation finished', { processedEvents: unprocessedEvents.length });
      return { success: true, processedEvents: unprocessedEvents.length };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      AggregationEngine.logger.error('Failed aggregation process', { error });
      return {
        success: false,
        processedEvents: 0,
        error,
      };
    }
  }

  /**
   * Processes a batch of event log records.
   *
   * This is the core logic where events are grouped, validated, time is calculated,
   * and domain information is extracted.
   *
   * @param events - An array of event log records to process.
   */
  private async processEvents(events: EventsLogRecord[]): Promise<void> {
    AggregationEngine.logger.info(`Processing ${events.length} events`);
    const visitGroups = this.groupEventsByVisit(events);
    AggregationEngine.logger.info(`Grouped into ${visitGroups.size} visit groups`);

    const validVisitGroups = this.validateVisitGroups(visitGroups);
    AggregationEngine.logger.info(`Get ${validVisitGroups.size} valid visit groups`);
    AggregationEngine.logger.debug('Get visit groups', {
      count: {
        valid: validVisitGroups.size,
        total: visitGroups.size,
      },
      groupes: {
        valid: validVisitGroups,
        total: visitGroups
      },
    });

    const aggregatedData: AggregatedData = {};
    const processedEventIds = new Set<number>();

    for (const group of validVisitGroups.values()) {
      const groupProcessedIds = this.calculateTime(group, aggregatedData);
      groupProcessedIds.forEach(id => processedEventIds.add(id));
    }

    AggregationEngine.logger.debug('Aggregated data after calculation', {
      keys: Object.keys(aggregatedData),
      data: aggregatedData,
    });

    const eventIds = Array.from(processedEventIds);
    await this.finalizeAggregation(aggregatedData, eventIds);

    AggregationEngine.logger.info(`Processed and marked ${eventIds.length} events`);
    AggregationEngine.logger.debug(`Processed and marked ${eventIds.length} events`);
  }

  /**
   * Groups events by visitId.
   *
   * @param events - An array of event log records.
   * @returns A map of visitId to VisitGroup.
   */
  private groupEventsByVisit(events: EventsLogRecord[]): Map<string, VisitGroup> {
    const visitGroups = new Map<string, VisitGroup>();

    for (const event of events) {
      if (!visitGroups.has(event.visitId)) {
        visitGroups.set(event.visitId, { events: [], url: event.url });
      }
      visitGroups.get(event.visitId)!.events.push(event);
    }

    return visitGroups;
  }

  /**
   * Calculates the time spent on a visit and updates the aggregated data.
   * Uses simplified first-to-last time calculation algorithm.
   *
   * @param visitGroup - The visit group to process.
   * @param aggregatedData - The map to store the aggregated data.
   * @returns Array of event IDs that should be marked as processed.
   */
  private calculateTime(visitGroup: VisitGroup, aggregatedData: AggregatedData): number[] {
    // Events are already sorted by ID from the query, preserve logical order

    // Perform basic validation
    if (!this.isValidVisitGroup(visitGroup)) {
      AggregationEngine.logger.warn('Invalid visit group, skipping', {
        visitId: visitGroup.events[0]?.visitId,
        eventCount: visitGroup.events.length,
      });
      return [];
    }

    const processedEventIds: number[] = [];

    // --- Calculate Open Time (based on visitId) ---
    let openTimeToAdd = 0;

    // Include checkpoint events with null activityId (Open Time checkpoints)
    const openTimeEvents = visitGroup.events.filter(
      e =>
        e.eventType.startsWith('open_time') ||
        (e.eventType === 'checkpoint' && e.activityId === null)
    );

    if (openTimeEvents.length >= 2) {
      const firstEvent = openTimeEvents[0];
      const lastEvent = openTimeEvents[openTimeEvents.length - 1];

      // Calculate time difference
      const timeDiff = lastEvent.timestamp - firstEvent.timestamp;

      if (timeDiff > 0) {
        // Positive time difference - normal processing
        openTimeToAdd = timeDiff;

        // Mark events as processed based on last event type
        if (lastEvent.eventType === 'open_time_end') {
          // Complete sequence - mark all events as processed
          openTimeEvents.forEach(event => {
            if (event.id !== undefined) {
              processedEventIds.push(event.id);
            }
          });
        } else if (lastEvent.eventType === 'checkpoint') {
          // Incomplete sequence - mark all except last checkpoint as processed
          for (let i = 0; i < openTimeEvents.length - 1; i++) {
            if (openTimeEvents[i].id !== undefined) {
              processedEventIds.push(openTimeEvents[i].id!);
            }
          }
          // Keep last checkpoint unprocessed for next aggregation
        }
      } else {
        // Invalid time sequence (timeDiff <= 0) - mark all events as processed
        // This prevents orphaned events from being reprocessed repeatedly
        if (lastEvent.eventType === 'open_time_end') {
          // Complete invalid sequence - mark all events as processed
          openTimeEvents.forEach(event => {
            if (event.id !== undefined) {
              processedEventIds.push(event.id);
            }
          });
        } else if (lastEvent.eventType === 'checkpoint') {
          // Incomplete invalid sequence - mark all except last checkpoint as processed
          for (let i = 0; i < openTimeEvents.length - 1; i++) {
            if (openTimeEvents[i].id !== undefined) {
              processedEventIds.push(openTimeEvents[i].id!);
            }
          }
          // Keep last checkpoint unprocessed for next aggregation
        } else {
          // Other cases - mark all events as processed
          openTimeEvents.forEach(event => {
            if (event.id !== undefined) {
              processedEventIds.push(event.id);
            }
          });
        }
        // Don't add any time for invalid sequences
      }
    }

    // --- Calculate Active Time (based on activityId) ---
    let activeTimeToAdd = 0;
    const activityEvents = visitGroup.events.filter(
      e =>
        e.activityId !== null &&
        (e.eventType.startsWith('active_time') || e.eventType === 'checkpoint')
    );
    const activities = new Map<string, EventsLogRecord[]>();

    // Group by activityId
    for (const event of activityEvents) {
      if (!activities.has(event.activityId!)) {
        activities.set(event.activityId!, []);
      }
      activities.get(event.activityId!)!.push(event);
    }

    // Process each activity session using first-to-last calculation
    for (const activity of activities.values()) {
      if (activity.length >= 2) {
        const firstEvent = activity[0];
        const lastEvent = activity[activity.length - 1];

        // Calculate time difference
        const timeDiff = lastEvent.timestamp - firstEvent.timestamp;

        if (timeDiff > 0) {
          // Positive time difference - normal processing
          activeTimeToAdd += timeDiff;

          // Mark events as processed based on last event type
          if (lastEvent.eventType === 'active_time_end') {
            // Complete sequence - mark all events as processed
            activity.forEach(event => {
              if (event.id !== undefined) {
                processedEventIds.push(event.id);
              }
            });
          } else if (lastEvent.eventType === 'checkpoint') {
            // Incomplete sequence - mark all except last checkpoint as processed
            for (let i = 0; i < activity.length - 1; i++) {
              if (activity[i].id !== undefined) {
                processedEventIds.push(activity[i].id!);
              }
            }
            // Keep last checkpoint unprocessed for next aggregation
          }
        } else {
          // Invalid time sequence (timeDiff <= 0) - filter out but mark events as processed
          if (lastEvent.eventType === 'active_time_end') {
            // Complete invalid sequence - mark all events as processed
            activity.forEach(event => {
              if (event.id !== undefined) {
                processedEventIds.push(event.id);
              }
            });
          } else if (lastEvent.eventType === 'checkpoint') {
            // Incomplete invalid sequence - mark all except last checkpoint as processed
            for (let i = 0; i < activity.length - 1; i++) {
              if (activity[i].id !== undefined) {
                processedEventIds.push(activity[i].id!);
              }
            }
            // Keep last checkpoint unprocessed for next aggregation
          } else {
            // Other cases - only mark start event as processed
            if (firstEvent.id !== undefined) {
              processedEventIds.push(firstEvent.id);
            }
          }
          // Don't add any time for invalid sequences
        }
      }
    }

    if (openTimeToAdd === 0 && activeTimeToAdd === 0) {
      AggregationEngine.logger.warn('No time calculated for visit', {
        visitId: visitGroup.events[0]?.visitId,
        url: visitGroup.url,
        eventTypes: visitGroup.events.map(e => e.eventType),
        eventCount: visitGroup.events.length,
        processedEventIds: processedEventIds.length,
      });
      return processedEventIds;
    }

    const { hostname, parentDomain } = this.parseUrl(visitGroup.url);
    const date = getUtcDateString(visitGroup.events[0].timestamp);
    const key = `${date}:${visitGroup.url}`;

    if (!(key in aggregatedData)) {
      aggregatedData[key] = {
        openTime: 0,
        activeTime: 0,
        url: visitGroup.url,
        date,
        hostname,
        parentDomain,
      };
    }

    const data = aggregatedData[key];
    data.openTime += openTimeToAdd;
    data.activeTime += activeTimeToAdd;

    return processedEventIds;
  }

  /**
   * Validates visit groups to ensure they contain valid event sequences
   * that can form complete time intervals.
   *
   * @param visitGroups - The map of visit groups to validate.
   * @returns A map containing only valid visit groups.
   */
  private validateVisitGroups(visitGroups: Map<string, VisitGroup>): Map<string, VisitGroup> {
    const validVisitGroups = new Map<string, VisitGroup>();

    for (const [visitGroupId, visitGroup] of visitGroups) {
      if (this.isValidVisitGroup(visitGroup)) {
        validVisitGroups.set(visitGroupId, visitGroup);
      }
    }

    return validVisitGroups;
  }

  /**
   * Checks if a visit group contains valid event sequences that can form time intervals.
   * Now uses basic validation only - detailed validation is handled in calculateTime.
   *
   * @param visitGroup - The visit group to validate.
   * @returns True if the visit group contains valid event sequences.
   */
  private isValidVisitGroup(visitGroup: VisitGroup): boolean {
    // Events are already sorted by ID from the query, preserve logical order
    const events = visitGroup.events;

    // Use basic validation only - detailed validation with smart processing
    // is handled in calculateTime method

    // Validate Open Time sequence
    const hasValidOpenTimeSequence = this.hasValidTimeSequence(
      events.filter(
        e =>
          e.eventType.startsWith('open_time') ||
          (e.eventType === 'checkpoint' && e.activityId === null)
      ),
      'open_time_start',
      'open_time_end'
    );

    // Validate Active Time sequences
    const hasValidActiveTimeSequence = this.hasValidActiveTimeSequences(
      events.filter(e => e.activityId !== null)
    );

    // At least one valid time sequence is required
    return hasValidOpenTimeSequence || hasValidActiveTimeSequence;
  }

  /**
   * Checks if an event sequence can form valid time intervals.
   *
   * @param events - The events to check.
   * @param startEventType - The start event type to look for.
   * @param endEventType - The end event type to look for.
   * @returns True if the sequence can form valid time intervals.
   */
  private hasValidTimeSequence(
    events: EventsLogRecord[],
    startEventType: string,
    endEventType: string
  ): boolean {
    if (events.length < 2) return false;

    let hasStart = false;
    let hasEnd = false;

    for (const event of events) {
      if (event.eventType === startEventType || event.eventType === 'checkpoint') {
        hasStart = true;
      }
      if (event.eventType === endEventType || event.eventType === 'checkpoint') {
        hasEnd = true;
      }
    }

    return hasStart && hasEnd;
  }

  /**
   * Checks the validity of active time sequences (grouped by activityId).
   *
   * @param activityEvents - Events with non-null activityId.
   * @returns True if at least one activity has a valid sequence.
   */
  private hasValidActiveTimeSequences(activityEvents: EventsLogRecord[]): boolean {
    if (activityEvents.length === 0) return false;

    const activities = new Map<string, EventsLogRecord[]>();

    // Group by activityId
    for (const event of activityEvents) {
      if (!activities.has(event.activityId!)) {
        activities.set(event.activityId!, []);
      }
      activities.get(event.activityId!)!.push(event);
    }

    // Check if at least one activity has a valid sequence
    for (const activity of activities.values()) {
      if (this.hasValidTimeSequence(activity, 'active_time_start', 'active_time_end')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Finalizes the aggregation by saving the calculated statistics
   * and marking the original events as processed.
   *
   * @param aggregatedData - The data to be saved.
   * @param eventIds - The IDs of the events that were processed.
   */
  private async finalizeAggregation(
    aggregatedData: AggregatedData,
    eventIds: number[]
  ): Promise<void> {
    AggregationEngine.logger.info(`Upserting ${Object.keys(aggregatedData).length} aggregated stats records`);

    const upsertPromises = Object.values(aggregatedData).map(data =>
      this.aggregatedStatsRepo.upsertTimeAggregation({
        date: data.date,
        url: data.url,
        hostname: data.hostname,
        parentDomain: data.parentDomain,
        openTimeToAdd: data.openTime,
        activeTimeToAdd: data.activeTime,
      })
    );

    await Promise.all(upsertPromises);
    
    await this.eventsLogRepo.markEventsAsProcessed(eventIds);

    AggregationEngine.logger.info(`Marking ${eventIds.length} events as processed`);

  }

  private parseUrl(url: string): { hostname: string; parentDomain: string } {
    if (!url || !url.startsWith('http')) {
      AggregationEngine.logger.error('Invalid URL for parsing', { url });
      throw new Error(`Invalid URL for parsing: ${url}`);
    }
    try {
      const { hostname } = new URL(url);
      const domain = psl.get(hostname);
      if (domain === null) {
        return { hostname, parentDomain: hostname };
      }
      return { hostname, parentDomain: domain };
    } catch (error) {
      AggregationEngine.logger.error('URL parsing failed', { url, error });
      throw new Error(
        `URL parsing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
