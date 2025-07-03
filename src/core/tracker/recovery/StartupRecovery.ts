/**
 * Startup Recovery for Time Tracking System
 *
 * Implements the two-phase startup recovery system as defined in LLD. Phase 1 identifies
 * orphan sessions (events without corresponding end events) and generates crash recovery
 * end events. Phase 2 clears old local storage state and initializes new sessions for
 * currently open tabs. This class queries the database for incomplete sessions and works
 * with the EventGenerator to create recovery events marked with resolution: 'crash_recovery'.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { z } from 'zod/v4';
import { browser } from '#imports';
import { EventGenerator } from '../events/EventGenerator';
import { DatabaseService } from '../../db/services/database.service';
import { EventsLogRecord } from '../../db/models/eventslog.model';
import { TabState, DomainEvent } from '../types';
import { createLogger } from '../../../utils/logger';
import { TabStateStorageUtils } from '../storage/TabStateStorage';

/**
 * Schema for orphan session data
 */
export const OrphanEventSchema = z.object({
  /** Event ID of the orphan session */
  id: z.string(),

  /** Event type (open_time_start, active_time_start, or checkpoint) */
  eventType: z.enum(['open_time_start', 'active_time_start', 'checkpoint']),

  /** Visit ID for open time sessions */
  visitId: z.string().optional(),

  /** Activity ID for active time sessions */
  activityId: z.string().optional(),

  /** URL of the session */
  url: z.string(),

  /** Domain of the session */
  domain: z.string(),

  /** Last known timestamp */
  timestamp: z.number(),

  /** Tab ID if available */
  tabId: z.number().optional(),
});

export type OrphanEvent = z.infer<typeof OrphanEventSchema>;

/**
 * Schema for recovery statistics
 */
export const RecoveryStatsSchema = z.object({
  /** Number of orphan sessions found */
  orphanSessionsFound: z.number(),

  /** Number of recovery events generated */
  recoveryEventsGenerated: z.number(),

  /** Number of current tabs initialized */
  currentTabsInitialized: z.number(),

  /** Recovery start time */
  recoveryStartTime: z.number(),

  /** Recovery completion time */
  recoveryCompletionTime: z.number().optional(),

  /** Any errors encountered during recovery */
  errors: z.array(z.string()),
});

export type RecoveryStats = z.infer<typeof RecoveryStatsSchema>;

/**
 * Configuration for startup recovery
 */
export interface StartupRecoveryConfig {
  /** Maximum age of sessions to consider for recovery (milliseconds) */
  maxSessionAge: number;

  /** Whether to enable debug logging */
  enableDebugLogging: boolean;

  /** Storage key for recovery state */
  storageKey: string;
}

/**
 * Default configuration for startup recovery
 */
export const DEFAULT_RECOVERY_CONFIG: StartupRecoveryConfig = {
  maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
  enableDebugLogging: false,
  storageKey: 'webtime-recovery-state',
};

/**
 * Startup Recovery Class
 *
 * Implements the two-phase startup recovery system:
 * Phase 1: Identify and recover orphan sessions
 * Phase 2: Initialize current browser state
 */
export class StartupRecovery {
  private readonly config: StartupRecoveryConfig;
  private readonly eventGenerator: EventGenerator;
  private readonly databaseService: DatabaseService;
  private stats: RecoveryStats;
  private static readonly logger = createLogger('♻️ StartupRecovery');

  constructor(
    eventGenerator: EventGenerator,
    databaseService: DatabaseService,
    config: Partial<StartupRecoveryConfig> = {}
  ) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.eventGenerator = eventGenerator;
    this.databaseService = databaseService;
    this.stats = {
      orphanSessionsFound: 0,
      recoveryEventsGenerated: 0,
      currentTabsInitialized: 0,
      recoveryStartTime: Date.now(),
      errors: [],
    };
  }

  /**
   * Execute the complete startup recovery process
   *
   * Phase 1: Recover orphan sessions in the DB (crash recovery)
   * Phase 2: Generate open_time_start events and tab session state for all currently open tabs, but do NOT write to DB directly.
   *
   * @returns {Promise<{ stats: RecoveryStats, tabStates: Array<{ tabId: number, tabState: TabState }>, events: DomainEvent[] }>}
   *   stats: Recovery statistics (DB orphan session recovery)
   *   tabStates: Initial in-memory session state for each tab
   *   events: open_time_start events for each tab (to be queued by TimeTracker)
   */
  async executeRecovery(): Promise<{
    stats: RecoveryStats;
    tabStates: Array<{ tabId: number; tabState: TabState }>;
    events: DomainEvent[];
  }> {
    StartupRecovery.logger.info('Start startup recovery process');

    try {
      // Phase 1: Recover orphan sessions in DB
      await this.recoverOrphanSessions();

      // Phase 2: Generate open_time_start events and tabStates for current tabs
      const { tabStates, events } = await this.initializeCurrentState();

      this.stats.recoveryCompletionTime = Date.now();
      StartupRecovery.logger.info('Complete startup recovery', {
        orphanSessionsFound: this.stats.orphanSessionsFound,
        recoveryEventsGenerated: this.stats.recoveryEventsGenerated,
        currentTabsInitialized: this.stats.currentTabsInitialized,
        duration: `${this.stats.recoveryCompletionTime - this.stats.recoveryStartTime}ms`,
      });

      return { stats: this.stats, tabStates, events };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.stats.errors.push(errorMessage);
      StartupRecovery.logger.error('Fail startup recovery', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Phase 1: Identify and recover orphan events
   */
  private async recoverOrphanSessions(): Promise<void> {
    StartupRecovery.logger.info('Phase 1: Search orphan sessions');

    try {
      // Find orphan events in the database
      const orphanEvents = await this.findOrphanEvents();
      this.stats.orphanSessionsFound = orphanEvents.length;

      if (orphanEvents.length === 0) {
        StartupRecovery.logger.info('No orphan sessions, phase 1 complete');
        return;
      }

      StartupRecovery.logger.info(
        `Found ${orphanEvents.length} orphan events, generating end events for them`,
        orphanEvents
      );

      // Generate recovery events for each orphan session
      for (const event of orphanEvents) {
        await this.generateEndEvent(event);
        this.stats.recoveryEventsGenerated++;
      }
    } catch (error) {
      const errorMessage = `Phase 1 failed: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Phase 2: Restore tab session state from persistent storage or generate new state.
   *
   * This phase attempts to restore tab states from persistent storage first to maintain
   * session continuity. For tabs without saved state, it generates new open_time_start
   * events and corresponding TabState. This does NOT write to DB.
   *
   * @returns {Promise<{ tabStates: Array<{ tabId: number, tabState: TabState }>, events: DomainEvent[] }>}
   *   tabStates: Restored or newly created in-memory session state for each tab
   *   events: open_time_start events for newly created sessions only
   */
  private async initializeCurrentState(): Promise<{
    tabStates: Array<{ tabId: number; tabState: TabState }>;
    events: DomainEvent[];
  }> {
    StartupRecovery.logger.info('Phase 2: Restoring session state for current browser tabs');

    const tabStates: Array<{ tabId: number; tabState: TabState }> = [];
    const events: DomainEvent[] = [];

    try {
      // Step 1: Load existing tab states from persistent storage
      const persistentTabStates = await TabStateStorageUtils.getAllTabStates();
      const persistentTabIds = new Set(
        Object.keys(persistentTabStates).map(id => parseInt(id, 10))
      );

      StartupRecovery.logger.info(
        `Found ${persistentTabIds.size} tab states in persistent storage`
      );

      // Step 2: Get all currently open tabs
      const currentTabs = (await browser.tabs.query({})).filter(
        tab => tab.id !== undefined && tab.id >= 0
      );
      const currentTabIds = new Set(currentTabs.map(tab => tab.id!));

      StartupRecovery.logger.info(`Found ${currentTabs.length} currently open tabs`);

      // Step 3: Process each currently open tab
      for (const tab of currentTabs) {
        if (tab.url && tab.id !== undefined) {
          // Check if we have a saved state for this tab
          const savedTabState = persistentTabStates[tab.id];

          if (savedTabState) {
            // Step 3a: Restore existing tab state (maintain session continuity)
            StartupRecovery.logger.debug('Restoring tab state from persistent storage', {
              tabId: tab.id,
              visitId: savedTabState.visitId,
              url: savedTabState.url,
            });

            // Update the restored state with current tab information
            const restoredTabState = {
              ...savedTabState,
              url: tab.url, // Update URL in case it changed
              isAudible: tab.audible || false, // Update audible state
              isFocused: false, // Reset focus state (will be set by focus events)
              tabId: tab.id,
              windowId: tab.windowId || 0,
            };

            tabStates.push({ tabId: tab.id, tabState: restoredTabState });
            // No event needed - we're continuing an existing session
          } else {
            // Step 3b: Create new tab state for tabs without saved state
            const result = this.eventGenerator.generateOpenTimeStart(
              tab.id,
              tab.url,
              Date.now(),
              tab.windowId || 0
            );

            if (!result.success || !result.event?.visitId) {
              if (result.metadata?.urlFiltered) {
                // StartupRecovery.logger.debug('🤔 Skipped tab for filtered URL', {
                //   tabId: tab.id,
                //   url: tab.url,
                //   reason: result.metadata.skipReason,
                // });
              } else {
                StartupRecovery.logger.error('Failed to generate open_time_start for tab', {
                  tabId: tab.id,
                  error: result.error,
                });
              }
              continue;
            }

            // Build initial tab state for new session
            const initialTabState = {
              url: tab.url,
              visitId: result.event.visitId,
              activityId: null,
              isAudible: tab.audible || false,
              lastInteractionTimestamp: Date.now(),
              openTimeStart: Date.now(),
              activeTimeStart: null,
              isFocused: false,
              tabId: tab.id,
              windowId: tab.windowId || 0,
              sessionEnded: false,
            };

            tabStates.push({ tabId: tab.id, tabState: initialTabState });
            events.push(result.event);

            StartupRecovery.logger.debug('Created new tab state for tab', {
              tabId: tab.id,
              visitId: result.event.visitId,
              url: tab.url,
            });
          }
        }
      }
      // Step 4: Clean up persistent storage for closed tabs
      const closedTabIds = Array.from(persistentTabIds).filter(tabId => !currentTabIds.has(tabId));
      if (closedTabIds.length > 0) {
        StartupRecovery.logger.info(
          `Cleaning up ${closedTabIds.length} closed tabs from persistent storage`
        );

        // Remove closed tabs from persistent storage
        const updatedPersistentStates = { ...persistentTabStates };
        for (const tabId of closedTabIds) {
          delete updatedPersistentStates[tabId];
        }

        try {
          await TabStateStorageUtils.saveAllTabStates(updatedPersistentStates);
        } catch (error) {
          StartupRecovery.logger.error('Failed to clean up closed tabs from persistent storage', {
            error,
          });
        }
      }

      // Clear old local storage state (after we've used the persistent storage)
      await this.clearOldLocalState();

      const restoredCount = tabStates.length - events.length;
      StartupRecovery.logger.info(
        `Session recovery complete: ${restoredCount} tabs restored, ${events.length} new sessions created`
      );

      this.stats.currentTabsInitialized = tabStates.length;
      return { tabStates, events };
    } catch (error) {
      const errorMessage = `Phase 2 failed: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Find orphan sessions in the event log database
   */
  private async findOrphanEvents(): Promise<OrphanEvent[]> {
    const cutoffTime = Date.now() - this.config.maxSessionAge;
    const orphanEvents: OrphanEvent[] = [];

    // Query for open_time_start events without corresponding end events
    StartupRecovery.logger.debug(
      `Query open_time_start events from ${new Date(cutoffTime).toLocaleString()} to ${new Date(Date.now()).toLocaleString()}`
    );
    const openTimeStartEvents = await this.getEventsByTypeAndTimeRange(
      'open_time_start',
      cutoffTime,
      Date.now()
    );
    StartupRecovery.logger.debug(
      `Found ${openTimeStartEvents.length} open_time_start events in time range`,
      openTimeStartEvents
    );

    for (const startEvent of openTimeStartEvents) {
      StartupRecovery.logger.trace(
        `Checking start event: visitId=${startEvent.visitId}, timestamp=${startEvent.timestamp}`
      );
      const hasEndEvent = await this.hasCorrespondingEndEvent(startEvent);
      StartupRecovery.logger.trace(`Has corresponding end event: ${hasEndEvent}`);
      if (!hasEndEvent) {
        const orphanEvent = this.createOrphanEventFromEvent(startEvent);
        if (orphanEvent) {
          orphanEvents.push(orphanEvent);
          StartupRecovery.logger.debug(`Added orphan event: ${orphanEvent.id}`);
        }
      }
    }

    // Query for active_time_start events without corresponding end events
    const activeTimeStartEvents = await this.getEventsByTypeAndTimeRange(
      'active_time_start',
      cutoffTime,
      Date.now()
    );

    for (const startEvent of activeTimeStartEvents) {
      const hasEndEvent = await this.hasCorrespondingEndEvent(startEvent);
      if (!hasEndEvent) {
        const orphanEvent = this.createOrphanEventFromEvent(startEvent);
        if (orphanEvent) {
          orphanEvents.push(orphanEvent);
        }
      }
    }

    // Query for checkpoint events without continuation
    StartupRecovery.logger.debug(
      `Query for checkpoint events from ${new Date(cutoffTime).toLocaleString()} to ${new Date(Date.now()).toLocaleString()}`
    );
    const checkpointEvents = await this.getEventsByTypeAndTimeRange(
      'checkpoint',
      cutoffTime,
      Date.now()
    );
    StartupRecovery.logger.debug(
      `Found ${checkpointEvents.length} checkpoint events in time range`
    );

    for (const checkpointEvent of checkpointEvents) {
      StartupRecovery.logger.trace(
        `Checking checkpoint event: visitId=${checkpointEvent.visitId}, activityId=${checkpointEvent.activityId}, timestamp=${checkpointEvent.timestamp}`
      );
      const hasContinuation = await this.hasContinuation(checkpointEvent);
      StartupRecovery.logger.trace(`Has continuation: ${hasContinuation}`);
      if (!hasContinuation) {
        const orphanEvent = this.createOrphanEventFromEvent(checkpointEvent);
        if (orphanEvent) {
          orphanEvents.push(orphanEvent);
          StartupRecovery.logger.debug(`Added orphan checkpoint event: ${orphanEvent.id}`);
        }
      }
    }

    return orphanEvents;
  }

  /**
   * Get events by type and time range (wrapper for database service)
   */
  private async getEventsByTypeAndTimeRange(
    eventType: 'open_time_start' | 'active_time_start' | 'checkpoint',
    startTime: number,
    endTime: number
  ): Promise<EventsLogRecord[]> {
    // Use the public API method
    return this.databaseService.getEventsByTypeAndTimeRange(eventType, startTime, endTime);
  }

  /**
   * Check if a checkpoint event has continuation (subsequent events)
   * A checkpoint is considered orphaned if there are no subsequent events
   * (either _end events or other checkpoints) in the same session.
   */
  private async hasContinuation(checkpointEvent: EventsLogRecord): Promise<boolean> {
    // For open_time checkpoints (activityId === null or undefined)
    if (checkpointEvent.activityId === null || checkpointEvent.activityId === undefined) {
      if (!checkpointEvent.visitId) {
        StartupRecovery.logger.trace('No visitId found for open_time checkpoint, returning false');
        return false;
      }

      // Query for subsequent events in the same visit
      const visitEvents = await this.databaseService.getEventsByVisitId(checkpointEvent.visitId);
      const subsequentEvents = visitEvents.filter(
        event =>
          event.timestamp > checkpointEvent.timestamp &&
          (event.eventType === 'open_time_end' ||
            (event.eventType === 'checkpoint' &&
              (event.activityId === null || event.activityId === undefined)))
      );

      StartupRecovery.logger.trace(
        `Found ${subsequentEvents.length} subsequent events for open_time checkpoint`
      );
      return subsequentEvents.length > 0;
    }

    // For active_time checkpoints (activityId has a value)
    // Query for subsequent events in the same activity
    const activityEvents = await this.databaseService.getEventsByActivityId(
      checkpointEvent.activityId
    );
    const subsequentEvents = activityEvents.filter(
      event =>
        event.timestamp > checkpointEvent.timestamp &&
        (event.eventType === 'active_time_end' || event.eventType === 'checkpoint')
    );

    StartupRecovery.logger.trace(
      `Found ${subsequentEvents.length} subsequent events for active_time checkpoint`
    );
    return subsequentEvents.length > 0;
  }

  /**
   * Check if a start event has a corresponding end event
   */
  private async hasCorrespondingEndEvent(startEvent: EventsLogRecord): Promise<boolean> {
    const endEventType =
      startEvent.eventType === 'open_time_start' ? 'open_time_end' : 'active_time_end';

    const sessionId =
      startEvent.eventType === 'open_time_start' ? startEvent.visitId : startEvent.activityId;

    StartupRecovery.logger.trace(
      `Checking for end event: sessionId=${sessionId}, endEventType=${endEventType}`
    );

    if (!sessionId) {
      StartupRecovery.logger.trace('No sessionId found, returning false');
      return false;
    }

    // Query for end events with the same session ID
    const endEvents = await this.getEventsBySessionId(sessionId, endEventType);
    StartupRecovery.logger.trace(`Found ${endEvents.length} end events for sessionId=${sessionId}`);

    if (endEvents.length > 0) {
      StartupRecovery.logger.trace(
        'End events found:',
        endEvents.map(e => ({ eventType: e.eventType, timestamp: e.timestamp }))
      );
    }

    return endEvents.length > 0;
  }

  /**
   * Get events by session ID and event type
   */
  private async getEventsBySessionId(
    sessionId: string,
    eventType: 'open_time_end' | 'active_time_end'
  ): Promise<EventsLogRecord[]> {
    // Use the public API methods and filter by event type
    let events: EventsLogRecord[];
    if (eventType === 'open_time_end') {
      events = await this.databaseService.getEventsByVisitId(sessionId);
    } else {
      events = await this.databaseService.getEventsByActivityId(sessionId);
    }

    // Filter to only include the specific event type we're looking for
    return events.filter(event => event.eventType === eventType);
  }

  /**
   * Create orphan session object from database event
   */
  private createOrphanEventFromEvent(event: EventsLogRecord): OrphanEvent | null {
    try {
      // Extract domain from URL if not available in event
      const domain = event.url ? new URL(event.url).hostname : 'unknown';

      return OrphanEventSchema.parse({
        id: (event.id ?? 0).toString(),
        eventType: event.eventType,
        visitId: event.visitId || undefined,
        activityId: event.activityId || undefined,
        url: event.url,
        domain,
        timestamp: event.timestamp,
        tabId: event.tabId || undefined,
      });
    } catch (error) {
      StartupRecovery.logger.warn('Failed to create orphan session from event', { event, error });
      return null;
    }
  }

  /**
   * Generate a recovery end event for an orphan session
   */
  private async generateEndEvent(event: OrphanEvent): Promise<void> {
    const eventId = event.id;

    if (!eventId) {
      StartupRecovery.logger.warn('Cannot generate recovery event: missing event ID', event);
      return;
    }

    // Create a mock tab state for the recovery event
    const mockTabState: TabState = {
      url: event.url,
      visitId: event.visitId || '',
      activityId: event.activityId || null,
      isAudible: false,
      lastInteractionTimestamp: event.timestamp,
      openTimeStart: event.timestamp,
      activeTimeStart: event.eventType === 'active_time_start' ? event.timestamp : null,
      isFocused: false,
      tabId: event.tabId || 0,
      windowId: 0, // Window ID is not available in recovery context
      sessionEnded: false,
    };

    const context = {
      tabState: mockTabState,
      timestamp: event.timestamp,
      resolution: 'crash_recovery' as const,
    };

    let result;
    if (event.eventType === 'open_time_start') {
      result = this.eventGenerator.generateOpenTimeEnd(context);
    } else if (event.eventType === 'active_time_start') {
      result = this.eventGenerator.generateActiveTimeEnd(context, 'tab_closed');
    } else if (event.eventType === 'checkpoint') {
      // For checkpoint events, generate the appropriate end event based on the session type
      if (event.activityId === null || event.activityId === undefined) {
        // Open time checkpoint - generate open_time_end
        result = this.eventGenerator.generateOpenTimeEnd(context);
      } else {
        // Active time checkpoint - generate active_time_end
        result = this.eventGenerator.generateActiveTimeEnd(context, 'tab_closed');
      }
    } else {
      StartupRecovery.logger.error('Unknown event type for recovery', {
        eventType: event.eventType,
        event,
      });
      return;
    }

    if (!result.success) {
      StartupRecovery.logger.error('Failed to generate recovery event', {
        event,
        error: result.error,
      });
      return;
    }

    // Save the generated event to the database
    if (result.event) {
      try {
        await this.databaseService.addEvent(result.event);
      } catch (error) {
        StartupRecovery.logger.error('Failed to add end event to DB', { error, result, event });
      }
    } else {
      StartupRecovery.logger.warn('No end event generated for orphan event', event);
    }
  }

  /**
   * Clear old local storage state
   */
  private async clearOldLocalState(): Promise<void> {
    try {
      // Clear recovery-related storage
      await browser.storage.local.remove([this.config.storageKey]);

      // Clear any other session-related storage keys
      const storageKeys = ['webtime-focus-state', 'webtime-session-data'];
      await browser.storage.local.remove(storageKeys);

      StartupRecovery.logger.debug('Cleared old local storage state');
    } catch (error) {
      StartupRecovery.logger.warn('Failed to clear local storage', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw here as this is not critical
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }
}
