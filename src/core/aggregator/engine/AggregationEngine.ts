import type { EventsLogRecord } from '../../db/models/eventslog.model';
import type { EventsLogRepository } from '../../db/repositories/eventslog.repository';
import type { AggregatedStatsRepository } from '../../db/repositories/aggregatedstats.repository';
import type { AggregationResult, VisitGroup, AggregatedData } from '../utils/types';
import { getUtcDateString } from '../../db/schemas/aggregatedstats.schema';
import { createEmojiLogger, LogCategory, type EmojiLogger } from '@/utils/logger-emoji';
import * as psl from 'psl';

/**
 * AggregationEngine class
 *
 * Core component for processing raw event logs and converting them into
 * aggregated statistical data.
 */
export class AggregationEngine {
  private readonly logger: EmojiLogger;

  /**
   * @param eventsLogRepo - Repository for accessing event log data.
   * @param aggregatedStatsRepo - Repository for storing aggregated statistics.
   */
  constructor(
    private readonly eventsLogRepo: EventsLogRepository,
    private readonly aggregatedStatsRepo: AggregatedStatsRepository
  ) {
    this.logger = createEmojiLogger('AggregationEngine');
  }

  /**
   * Runs the entire aggregation process.
   *
   * Fetches unprocessed events, processes them, and saves the aggregated data.
   *
   * @returns A promise that resolves to an AggregationResult.
   */
  public async run(): Promise<AggregationResult> {
    this.logger.logWithEmoji(LogCategory.START, 'info', 'aggregation process');
    
    try {
      this.logger.logWithEmoji(LogCategory.DB, 'debug', 'fetching unprocessed events');
      const unprocessedEvents = await this.eventsLogRepo.getUnprocessedEvents();
      
      if (unprocessedEvents.length === 0) {
        this.logger.logWithEmoji(LogCategory.SKIP, 'info', 'no unprocessed events found');
        this.logger.logWithEmoji(LogCategory.END, 'info', 'aggregation process', { processedEvents: 0 });
        return { success: true, processedEvents: 0 };
      }

      this.logger.logWithEmoji(LogCategory.HANDLE, 'info', `processing ${unprocessedEvents.length} events`, unprocessedEvents);
      await this.processEvents(unprocessedEvents);

      this.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'aggregation completed', { processedEvents: unprocessedEvents.length });
      this.logger.logWithEmoji(LogCategory.END, 'info', 'aggregation process', { processedEvents: unprocessedEvents.length });
      return { success: true, processedEvents: unprocessedEvents.length };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'aggregation failed', { error });
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
   * This is the core logic where events are grouped, time is calculated,
   * and domain information is extracted.
   *
   * @param events - An array of event log records to process.
   */
  private async processEvents(events: EventsLogRecord[]): Promise<void> {
    this.logger.logWithEmoji(LogCategory.HANDLE, 'debug', 'grouping events by visit', { eventCount: events.length });
    const visits = this.groupEventsByVisit(events);
    const aggregatedData: AggregatedData = {};

    this.logger.logWithEmoji(LogCategory.HANDLE, 'debug', 'calculating time for visits', { visitCount: visits.size });
    for (const visit of visits.values()) {
      this.calculateTime(visit, aggregatedData);
    }

    const eventIds = events.map(e => e.id!);
    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'finalizing aggregation', { aggregatedEntries: Object.keys(aggregatedData).length });
    await this.finalizeAggregation(aggregatedData, eventIds);
  }

  /**
   * Groups events by visitId.
   *
   * @param events - An array of event log records.
   * @returns A map of visitId to VisitGroup.
   */
  private groupEventsByVisit(events: EventsLogRecord[]): Map<string, VisitGroup> {
    const visits = new Map<string, VisitGroup>();

    for (const event of events) {
      if (!visits.has(event.visitId)) {
        visits.set(event.visitId, { events: [], url: event.url });
      }
      visits.get(event.visitId)!.events.push(event);
    }

    return visits;
  }

  /**
   * Calculates the time spent on a visit and updates the aggregated data.
   *
   * @param visit - The visit to process.
   * @param aggregatedData - The map to store the aggregated data.
   */
  private calculateTime(visit: VisitGroup, aggregatedData: AggregatedData): void {
    visit.events.sort((a, b) => a.timestamp - b.timestamp);

    // --- Calculate Open Time (based on visitId) ---
    let openTimeToAdd = 0;
    let openTimeStartTimestamp: number | null = null;
    // Include checkpoint events with null activityId (Open Time checkpoints)
    const openTimeEvents = visit.events.filter(
      e =>
        e.eventType.startsWith('open_time') ||
        (e.eventType === 'checkpoint' && e.activityId === null)
    );
    for (const event of openTimeEvents) {
      if (event.eventType === 'open_time_start') {
        if (openTimeStartTimestamp === null) {
          openTimeStartTimestamp = event.timestamp;
        }
      } else if (event.eventType === 'checkpoint' && event.activityId === null) {
        if (openTimeStartTimestamp !== null) {
          openTimeToAdd += event.timestamp - openTimeStartTimestamp;
          openTimeStartTimestamp = event.timestamp; // Reset for next interval
        } else {
          // Checkpoint without start event - use checkpoint as new start point
          openTimeStartTimestamp = event.timestamp;
        }
      } else if (event.eventType === 'open_time_end') {
        if (openTimeStartTimestamp !== null) {
          openTimeToAdd += event.timestamp - openTimeStartTimestamp;
          openTimeStartTimestamp = null;
        }
      }
    }

    // --- Calculate Active Time (based on activityId) ---
    let activeTimeToAdd = 0;
    const activityEvents = visit.events.filter(e => e.activityId !== null);
    const activities = new Map<string, EventsLogRecord[]>();

    // Group by activityId
    for (const event of activityEvents) {
      if (!activities.has(event.activityId!)) {
        activities.set(event.activityId!, []);
      }
      activities.get(event.activityId!)!.push(event);
    }

    // Process each activity session
    for (const activity of activities.values()) {
      activity.sort((a, b) => a.timestamp - b.timestamp);
      let activityStartTimestamp: number | null = null;
      for (const event of activity) {
        if (event.eventType === 'active_time_start') {
          if (activityStartTimestamp === null) {
            activityStartTimestamp = event.timestamp;
          }
        } else if (event.eventType === 'checkpoint') {
          if (activityStartTimestamp !== null) {
            activeTimeToAdd += event.timestamp - activityStartTimestamp;
            activityStartTimestamp = event.timestamp; // Reset for next interval
          } else {
            // Checkpoint without start event - use checkpoint as new start point
            activityStartTimestamp = event.timestamp;
          }
        } else if (event.eventType === 'active_time_end') {
          if (activityStartTimestamp !== null) {
            activeTimeToAdd += event.timestamp - activityStartTimestamp;
            activityStartTimestamp = null;
          }
        }
      }
    }

    if (openTimeToAdd === 0 && activeTimeToAdd === 0) {
      return; // Nothing to aggregate
    }

    const { hostname, parentDomain } = this.parseUrl(visit.url);
    const date = getUtcDateString(visit.events[0].timestamp);
    const key = `${date}:${visit.url}`;

    if (!(key in aggregatedData)) {
      aggregatedData[key] = {
        openTime: 0,
        activeTime: 0,
        url: visit.url,
        date,
        hostname,
        parentDomain,
      };
    }

    const data = aggregatedData[key];
    data.openTime += openTimeToAdd;
    data.activeTime += activeTimeToAdd;
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
    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'upserting aggregated stats', { entries: Object.keys(aggregatedData).length });
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
    
    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'marking events as processed', { eventIds: eventIds.length });
    await this.eventsLogRepo.markEventsAsProcessed(eventIds);
  }

  private parseUrl(url: string): { hostname: string; parentDomain: string } {
    if (!url || !url.startsWith('http')) {
      this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'invalid URL for parsing', { url });
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
      this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'URL parsing failed', { url, error });
      throw new Error(
        `URL parsing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
