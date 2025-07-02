import type { EventsLogRecord } from '../../db/models/eventslog.model';
import type { EventsLogRepository } from '../../db/repositories/eventslog.repository';
import type { AggregatedStatsRepository } from '../../db/repositories/aggregatedstats.repository';
import type { AggregationResult, VisitGroup, AggregatedData } from '../utils/types';
import { getUtcDateString } from '../../db/schemas/aggregatedstats.schema';
import { createEmojiLogger, LogCategory, type EmojiLogger } from '@/utils/logger-emoji';
import * as psl from 'psl';

/**
 * Validation result for a time sequence, including processing strategy
 */
interface TimeSequenceValidation {
  isValid: boolean;
  isComplete: boolean; // Whether the sequence ends with a definitive end event
  eventsToProcess: number[]; // Event IDs that should be marked as processed
  eventsToKeep: number[]; // Event IDs that should be kept for next aggregation
  reason?: string; // Reason for validation failure
}

/**
 * Complete validation result for a visit group
 */
interface VisitValidationResult {
  isValid: boolean;
  openTime?: TimeSequenceValidation;
  activeTime: Map<string, TimeSequenceValidation>;
}

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
    this.logger.logWithEmoji(LogCategory.START, 'info', 'Start run aggregation process');

    try {
      // this.logger.logWithEmoji(LogCategory.DB, 'debug', 'fetching unprocessed events');
      const unprocessedEvents = await this.eventsLogRepo.getUnprocessedEvents();

      if (unprocessedEvents.length === 0) {
        this.logger.logWithEmoji(LogCategory.SKIP, 'info', 'No unprocessed events found');
        return { success: true, processedEvents: 0 };
      }

      this.logger.logWithEmoji(
        LogCategory.HANDLE,
        'info',
        `processing ${unprocessedEvents.length} events`,
        unprocessedEvents
      );
      await this.processEvents(unprocessedEvents);

      this.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'Completed aggregation.');
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
   * This is the core logic where events are grouped, validated, time is calculated,
   * and domain information is extracted.
   *
   * @param events - An array of event log records to process.
   */
  private async processEvents(events: EventsLogRecord[]): Promise<void> {
    this.logger.logWithEmoji(LogCategory.HANDLE, 'debug', 'grouping events by visit', events);
    const visits = this.groupEventsByVisit(events);

    // Validate visit groups to ensure they contain complete event sequences
    const validVisits = this.validateVisitGroups(visits);

    const aggregatedData: AggregatedData = {};
    const processedEventIds = new Set<number>();

    this.logger.logWithEmoji(
      LogCategory.HANDLE,
      'debug',
      'calculating time for valid visits',
      validVisits
    );
    for (const visit of validVisits.values()) {
      const visitProcessedIds = this.calculateTime(visit, aggregatedData);
      visitProcessedIds.forEach(id => processedEventIds.add(id));
    }

    const eventIds = Array.from(processedEventIds);
    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'finalizing aggregation', aggregatedData);
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
   * Implements role-based selective processing for checkpoint events.
   *
   * @param visit - The visit to process.
   * @param aggregatedData - The map to store the aggregated data.
   * @returns Array of event IDs that should be marked as processed.
   */
  private calculateTime(visit: VisitGroup, aggregatedData: AggregatedData): number[] {
    visit.events.sort((a, b) => a.timestamp - b.timestamp);

    // Perform detailed validation first
    const validationResult = this.validateVisitGroupDetailed(visit);

    // Handle validation failures with smart processing strategy
    if (!validationResult.isValid) {
      return this.handleValidationFailure(visit, validationResult);
    }

    const processedEventIds: number[] = [];

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
          // Mark start event as processed (its "start" role is complete)
          if (event.id !== undefined) {
            processedEventIds.push(event.id);
          }
        }
      } else if (event.eventType === 'checkpoint' && event.activityId === null) {
        if (openTimeStartTimestamp !== null) {
          openTimeToAdd += event.timestamp - openTimeStartTimestamp;
          openTimeStartTimestamp = event.timestamp; // Reset for next interval
          // Checkpoint completes its "end" role but NOT its "start" role yet
          // Do NOT mark checkpoint as processed here
        } else {
          // Checkpoint without start event - use checkpoint as new start point
          openTimeStartTimestamp = event.timestamp;
          // This checkpoint is starting a new interval, don't mark as processed yet
        }
      } else if (event.eventType === 'open_time_end') {
        if (openTimeStartTimestamp !== null) {
          openTimeToAdd += event.timestamp - openTimeStartTimestamp;
          openTimeStartTimestamp = null;
          // Mark end event as processed (its "end" role is complete)
          if (event.id !== undefined) {
            processedEventIds.push(event.id);
          }
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
            // Mark start event as processed (its "start" role is complete)
            if (event.id !== undefined) {
              processedEventIds.push(event.id);
            }
          }
        } else if (event.eventType === 'checkpoint') {
          if (activityStartTimestamp !== null) {
            activeTimeToAdd += event.timestamp - activityStartTimestamp;
            activityStartTimestamp = event.timestamp; // Reset for next interval
            // Checkpoint completes its "end" role but NOT its "start" role yet
            // Do NOT mark checkpoint as processed here
          } else {
            // Checkpoint without start event - use checkpoint as new start point
            activityStartTimestamp = event.timestamp;
            // This checkpoint is starting a new interval, don't mark as processed yet
          }
        } else if (event.eventType === 'active_time_end') {
          if (activityStartTimestamp !== null) {
            activeTimeToAdd += event.timestamp - activityStartTimestamp;
            activityStartTimestamp = null;
            // Mark end event as processed (its "end" role is complete)
            if (event.id !== undefined) {
              processedEventIds.push(event.id);
            }
          }
        }
      }
    }

    if (openTimeToAdd === 0 && activeTimeToAdd === 0) {
      // If no time was calculated, this might indicate a validation issue
      // However, since the visit group passed validation, we still return processed event IDs
      this.logger.logWithEmoji(LogCategory.WARN, 'warn', 'no time calculated for validated visit', {
        visitId: visit.events[0]?.visitId,
        visit,
        eventCount: visit.events.length,
        processedEventIds: processedEventIds.length,
      });
      return processedEventIds;
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

    // Now handle checkpoint events that completed both roles
    // Check if any checkpoint events can now be marked as fully processed
    this.markCompletedCheckpoints(visit, processedEventIds);

    return processedEventIds;
  }

  /**
   * Marks checkpoint events as processed if they have completed both their roles.
   * A checkpoint event can only be marked as processed if:
   * 1. It has been used as an "end" point for a previous interval, AND
   * 2. It has been used as a "start" point for a subsequent interval, OR there is no subsequent interval
   *
   * @param visit - The visit being processed
   * @param processedEventIds - Array to add completed checkpoint event IDs to
   */
  private markCompletedCheckpoints(visit: VisitGroup, processedEventIds: number[]): void {
    const checkpointEvents = visit.events.filter(e => e.eventType === 'checkpoint');

    for (const checkpoint of checkpointEvents) {
      if (checkpoint.id === undefined) continue;

      // Check if this checkpoint has completed both roles
      const hasCompletedBothRoles = this.hasCheckpointCompletedBothRoles(checkpoint, visit);

      if (hasCompletedBothRoles) {
        processedEventIds.push(checkpoint.id);
        this.logger.logWithEmoji(LogCategory.HANDLE, 'debug', 'checkpoint completed both roles', {
          checkpointId: checkpoint.id,
          timestamp: checkpoint.timestamp,
          visitId: checkpoint.visitId,
          activityId: checkpoint.activityId,
        });
      }
    }
  }

  /**
   * Determines if a checkpoint event has completed both its "end" and "start" roles.
   * This is a simplified heuristic: a checkpoint is considered complete if it's not
   * the last event in its respective time category (open_time or active_time).
   *
   * @param checkpoint - The checkpoint event to check
   * @param visit - The visit containing the checkpoint
   * @returns True if the checkpoint has completed both roles
   */
  private hasCheckpointCompletedBothRoles(checkpoint: EventsLogRecord, visit: VisitGroup): boolean {
    // For open_time checkpoints (activityId === null)
    if (checkpoint.activityId === null) {
      const openTimeEvents = visit.events
        .filter(
          e =>
            e.eventType.startsWith('open_time') ||
            (e.eventType === 'checkpoint' && e.activityId === null)
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      const checkpointIndex = openTimeEvents.findIndex(e => e.id === checkpoint.id);
      // If this checkpoint is not the last event in the open_time sequence, it has completed both roles
      return checkpointIndex !== -1 && checkpointIndex < openTimeEvents.length - 1;
    }

    // For active_time checkpoints (activityId !== null)
    const activityEvents = visit.events
      .filter(
        e =>
          e.activityId === checkpoint.activityId &&
          (e.eventType.startsWith('active_time') || e.eventType === 'checkpoint')
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const checkpointIndex = activityEvents.findIndex(e => e.id === checkpoint.id);
    // If this checkpoint is not the last event in the activity sequence, it has completed both roles
    return checkpointIndex !== -1 && checkpointIndex < activityEvents.length - 1;
  }

  /**
   * Validates visit groups to ensure they contain valid event sequences
   * that can form complete time intervals.
   *
   * @param visits - The map of visit groups to validate.
   * @returns A map containing only valid visit groups.
   */
  private validateVisitGroups(visits: Map<string, VisitGroup>): Map<string, VisitGroup> {
    const validVisits = new Map<string, VisitGroup>();

    for (const [visitId, visit] of visits) {
      if (this.isValidVisitGroup(visit)) {
        validVisits.set(visitId, visit);
        this.logger.logWithEmoji(LogCategory.HANDLE, 'debug', 'visit group validated', {
          visitId,
          eventCount: visit.events.length,
        });
      } else {
        this.logger.logWithEmoji(LogCategory.SKIP, 'debug', 'skipping invalid visit group', {
          visitId,
          eventCount: visit.events.length,
          events: visit.events.map(e => ({
            id: e.id,
            eventType: e.eventType,
            activityId: e.activityId,
          })),
        });
      }
    }

    return validVisits;
  }

  /**
   * Checks if a visit group contains valid event sequences that can form time intervals.
   * Now uses basic validation only - detailed validation is handled in calculateTime.
   *
   * @param visit - The visit group to validate.
   * @returns True if the visit group contains valid event sequences.
   */
  private isValidVisitGroup(visit: VisitGroup): boolean {
    const events = visit.events.sort((a, b) => a.timestamp - b.timestamp);

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
   * Performs detailed validation of a visit group, returning comprehensive validation results
   * including processing strategies for failed validations.
   *
   * @param visit - The visit group to validate.
   * @returns Detailed validation result with processing strategies.
   */
  private validateVisitGroupDetailed(visit: VisitGroup): VisitValidationResult {
    const events = visit.events.sort((a, b) => a.timestamp - b.timestamp);
    const result: VisitValidationResult = {
      isValid: false,
      activeTime: new Map(),
    };

    // Validate Open Time sequence
    const openTimeEvents = events.filter(
      e =>
        e.eventType.startsWith('open_time') ||
        (e.eventType === 'checkpoint' && e.activityId === null)
    );

    if (openTimeEvents.length >= 2) {
      result.openTime = this.validateTimeSequenceDetailed(
        openTimeEvents,
        'open_time_start',
        'open_time_end'
      );
    }

    // Validate Active Time sequences (grouped by activityId)
    const activityEvents = events.filter(e => e.activityId !== null);
    const activities = new Map<string, EventsLogRecord[]>();

    // Group by activityId
    for (const event of activityEvents) {
      if (!activities.has(event.activityId!)) {
        activities.set(event.activityId!, []);
      }
      activities.get(event.activityId!)!.push(event);
    }

    // Validate each activity sequence
    for (const [activityId, activityEventList] of activities) {
      if (activityEventList.length >= 2) {
        const validation = this.validateTimeSequenceDetailed(
          activityEventList.sort((a, b) => a.timestamp - b.timestamp),
          'active_time_start',
          'active_time_end'
        );
        result.activeTime.set(activityId, validation);
      }
    }

    // At least one valid time sequence is required
    const hasValidOpenTime = result.openTime?.isValid ?? false;
    const hasValidActiveTime = Array.from(result.activeTime.values()).some(v => v.isValid);
    result.isValid = hasValidOpenTime || hasValidActiveTime;

    return result;
  }

  /**
   * Performs detailed validation of a time sequence with enhanced timestamp checking
   * and processing strategy determination.
   *
   * @param events - The events to validate (should be pre-sorted by timestamp).
   * @param startEventType - The start event type to look for.
   * @param endEventType - The end event type to look for.
   * @returns Detailed validation result with processing strategy.
   */
  private validateTimeSequenceDetailed(
    events: EventsLogRecord[],
    startEventType: string,
    endEventType: string
  ): TimeSequenceValidation {
    const result: TimeSequenceValidation = {
      isValid: false,
      isComplete: false,
      eventsToProcess: [],
      eventsToKeep: [],
    };

    if (events.length < 2) {
      result.reason = 'insufficient_events';
      return result;
    }

    // Check basic event type requirements
    const hasBasicValidation = this.hasValidTimeSequence(events, startEventType, endEventType);
    if (!hasBasicValidation) {
      result.reason = 'missing_required_event_types';
      return result;
    }

    // Enhanced validation: check timestamp validity and intervals
    const timestampValidation = this.validateTimestamps(events, startEventType, endEventType);
    if (!timestampValidation.isValid) {
      result.reason = timestampValidation.reason;
      result.isComplete = timestampValidation.isComplete;
      result.eventsToProcess = timestampValidation.eventsToProcess;
      result.eventsToKeep = timestampValidation.eventsToKeep;
      return result;
    }

    // If we reach here, the sequence is valid
    result.isValid = true;
    result.isComplete = timestampValidation.isComplete;
    result.eventsToProcess = events.map(e => e.id).filter((id): id is number => id !== undefined);

    return result;
  }

  /**
   * Validates timestamps in a time sequence and determines processing strategy
   * for invalid intervals.
   *
   * @param events - The events to validate (pre-sorted by timestamp).
   * @param startEventType - The start event type.
   * @param endEventType - The end event type.
   * @returns Timestamp validation result with processing strategy.
   */
  private validateTimestamps(
    events: EventsLogRecord[],
    startEventType: string,
    endEventType: string
  ): {
    isValid: boolean;
    isComplete: boolean;
    eventsToProcess: number[];
    eventsToKeep: number[];
    reason?: string;
  } {
    const result = {
      isValid: true,
      isComplete: false,
      eventsToProcess: [] as number[],
      eventsToKeep: [] as number[],
      reason: undefined as string | undefined,
    };

    // Determine if sequence is complete (ends with definitive end event)
    const lastEvent = events[events.length - 1];
    result.isComplete = lastEvent.eventType === endEventType;

    // Check for invalid time intervals (zero or negative)
    const minTimeThreshold = 1; // 1ms minimum interval (configurable)
    let hasInvalidInterval = false;
    let hasValidInterval = false;

    // Find all start and end events to calculate intervals
    const startEvents = events.filter(
      e => e.eventType === startEventType || e.eventType === 'checkpoint'
    );
    const endEvents = events.filter(
      e => e.eventType === endEventType || e.eventType === 'checkpoint'
    );

    // Check all possible start-end combinations
    let hasNegativeInterval = false;

    for (const startEvent of startEvents) {
      for (const endEvent of endEvents) {
        // Only consider end events that come after start events (logically, not necessarily by timestamp)
        if (endEvent.timestamp >= startEvent.timestamp) {
          const interval = endEvent.timestamp - startEvent.timestamp;

          if (interval < minTimeThreshold) {
            hasInvalidInterval = true;
          } else {
            hasValidInterval = true;
          }
        } else {
          // Negative interval (end before start)
          hasInvalidInterval = true;
          hasNegativeInterval = true;
        }
      }
    }

    // For negative intervals, override completeness - treat as complete but invalid
    if (hasNegativeInterval) {
      result.isComplete = true;
    }

    // Only mark as invalid if ALL intervals are invalid (zero or negative time)
    if (hasInvalidInterval && !hasValidInterval) {
      // All intervals are invalid (zero or negative time)
      result.isValid = false;
      result.reason = 'invalid_time_interval';

      // Apply processing strategy based on completeness
      if (result.isComplete) {
        // Complete but invalid interval - process all events
        result.eventsToProcess = events
          .map(e => e.id)
          .filter((id): id is number => id !== undefined);
      } else {
        // Incomplete interval - process all but keep the last event as starting point
        for (let j = 0; j < events.length - 1; j++) {
          if (events[j].id !== undefined) {
            result.eventsToProcess.push(events[j].id!);
          }
        }
        if (lastEvent.id !== undefined) {
          result.eventsToKeep.push(lastEvent.id);
        }
      }

      return result;
    }

    return result;
  }

  /**
   * Handles validation failure by applying smart processing strategies
   * based on interval completeness.
   *
   * @param visit - The visit group that failed validation.
   * @param validationResult - The detailed validation result.
   * @returns Array of event IDs that should be marked as processed.
   */
  private handleValidationFailure(
    visit: VisitGroup,
    validationResult: VisitValidationResult
  ): number[] {
    const processedEventIds: number[] = [];

    // Handle Open Time validation failure
    if (validationResult.openTime && !validationResult.openTime.isValid) {
      processedEventIds.push(...validationResult.openTime.eventsToProcess);

      this.logger.logWithEmoji(LogCategory.SKIP, 'debug', 'skipping invalid open time sequence', {
        visitId: visit.events[0]?.visitId,
        reason: validationResult.openTime.reason,
        isComplete: validationResult.openTime.isComplete,
        eventsProcessed: validationResult.openTime.eventsToProcess.length,
        eventsKept: validationResult.openTime.eventsToKeep.length,
      });
    }

    // Handle Active Time validation failures
    for (const [activityId, validation] of validationResult.activeTime) {
      if (!validation.isValid) {
        processedEventIds.push(...validation.eventsToProcess);

        this.logger.logWithEmoji(
          LogCategory.SKIP,
          'debug',
          'skipping invalid active time sequence',
          {
            visitId: visit.events[0]?.visitId,
            activityId,
            reason: validation.reason,
            isComplete: validation.isComplete,
            eventsProcessed: validation.eventsToProcess.length,
            eventsKept: validation.eventsToKeep.length,
          }
        );
      }
    }

    // Log summary of validation failure handling
    this.logger.logWithEmoji(
      LogCategory.SKIP,
      'debug',
      'handled validation failure with smart processing',
      {
        visitId: visit.events[0]?.visitId,
        totalEventsProcessed: processedEventIds.length,
        totalEvents: visit.events.length,
      }
    );

    return processedEventIds;
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
    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'upserting aggregated stats', aggregatedData);

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

    this.logger.logWithEmoji(LogCategory.DB, 'debug', 'marking events as processed', {
      size: eventIds.length,
    });

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
