/**
 * Startup Recovery for Time Tracking System
 *
 * Implements the two-phase startup recovery system as defined in LLD. Phase 1 identifies
 * orphan sessions (events without corresponding end events) and generates crash recovery
 * end events. Phase 2 clears old local storage state and initializes new sessions for
 * currently open tabs. This class queries the database for incomplete sessions and works
 * with the EventGenerator to create recovery events marked with resolution: 'crash_recovery'.
 *
 */

import { z } from 'zod/v4';
import { browser } from '#imports';
import { EventGenerator } from '@/core/tracker/utils/EventGenerator';
import { DatabaseService } from '@/core/db/services/database.service';
import { EventsLogRecord } from '@/core/db/models/eventslog.model';
import { TabState, TrackingEvent } from '@/core/tracker/types';
import { createLogger } from '@/utils/logger';

export const OrphanEventSchema = z.object({
  id: z.string(),

  eventType: z.enum(['open_time_start', 'active_time_start', 'checkpoint']),

  visitId: z.string().optional(),

  activityId: z.string().optional(),

  url: z.string(),

  domain: z.string(),

  timestamp: z.number(),

  tabId: z.number().optional(),
});

export type OrphanEvent = z.infer<typeof OrphanEventSchema>;

export const RecoveryStatsSchema = z.object({
  orphanSessionsFound: z.number(),

  recoveryEventsGenerated: z.number(),

  currentTabsInitialized: z.number(),

  recoveryStartTime: z.number(),

  recoveryCompletionTime: z.number().optional(),

  errors: z.array(z.string()),
});

export type RecoveryStats = z.infer<typeof RecoveryStatsSchema>;

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
    events: TrackingEvent[];
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
   * Phase 2: Initialize current browser state.
   *
   * Creates new tab states and open_time_start events for all currently open tabs.
   * All sessions are completely new, ensuring no visitId reuse.
   *
   * @returns {Promise<{ tabStates: Array<{ tabId: number, tabState: TabState }>, events: TrackingEvent[] }>}
   *   tabStates: Newly created in-memory session state for each tab
   *   events: open_time_start events for each tab (to be queued by TimeTracker)
   */
  private async initializeCurrentState(): Promise<{
    tabStates: Array<{ tabId: number; tabState: TabState }>;
    events: TrackingEvent[];
  }> {
    StartupRecovery.logger.info('Phase 2: Initializing session state for current browser tabs');

    const tabStates: Array<{ tabId: number; tabState: TabState }> = [];
    const events: TrackingEvent[] = [];

    try {
      // Get all currently open tabs
      const currentTabs = (await browser.tabs.query({})).filter(
        tab => tab.id !== undefined && tab.id >= 0
      );

      StartupRecovery.logger.info(`Found ${currentTabs.length} currently open tabs`);

      // Create new tab state for each currently open tab
      for (const tab of currentTabs) {
        if (tab.url && tab.id !== undefined) {
          const result = this.eventGenerator.generateOpenTimeStart(
            tab.id,
            tab.url,
            Date.now(),
            tab.windowId || 0
          );

          // Enhanced precondition check: ensure we have valid event data before proceeding
          if (!result.success || !result.event || !result.event.visitId) {
            if (result.metadata?.urlFiltered) {
              StartupRecovery.logger.debug('Skipped tab state creation for filtered URL', {
                tabId: tab.id,
                url: tab.url,
                reason: result.metadata.skipReason,
              });
            } else {
              StartupRecovery.logger.error('Failed to generate necessary event data for tab', {
                tabId: tab.id,
                error: result.error || 'Event or visitId was not generated.',
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

      // Clear old local storage state
      await this.clearOldLocalState();

      StartupRecovery.logger.info(
        `Session initialization complete: ${events.length} new sessions created`
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
    StartupRecovery.logger.debug(
      `Querying unprocessed events since ${new Date(cutoffTime).toLocaleString()}`,
    );

    // Single, efficient query to fetch all potentially relevant unprocessed events
    const allUnprocessedEvents = await this.databaseService.getUnprocessedEventsForRecovery(
      cutoffTime,
    );

    // In-memory processing to identify orphans
    const sessions = new Map<string, { start?: EventsLogRecord; end?: EventsLogRecord }>();
    const activitySessions = new Map<string, { start?: EventsLogRecord; end?: EventsLogRecord }>();
    const checkpoints = new Map<string, EventsLogRecord>();

    for (const event of allUnprocessedEvents) {
      if (event.eventType === 'open_time_start') {
        const session = sessions.get(event.visitId) || {};
        session.start = event;
        sessions.set(event.visitId, session);
      } else if (event.eventType === 'open_time_end') {
        const session = sessions.get(event.visitId) || {};
        session.end = event;
        sessions.set(event.visitId, session);
      } else if (event.eventType === 'active_time_start' && event.activityId) {
        const session = activitySessions.get(event.activityId) || {};
        session.start = event;
        activitySessions.set(event.activityId, session);
      } else if (event.eventType === 'active_time_end' && event.activityId) {
        const session = activitySessions.get(event.activityId) || {};
        session.end = event;
        activitySessions.set(event.activityId, session);
      } else if (event.eventType === 'checkpoint') {
        const key = event.activityId ? `act-${event.activityId}` : `vis-${event.visitId}`;
        const existing = checkpoints.get(key);
        if (!existing || event.timestamp > existing.timestamp) {
          checkpoints.set(key, event);
        }
      }
    }

    const orphanEvents: OrphanEvent[] = [];

    // Identify orphan open_time sessions
    for (const [, session] of sessions.entries()) {
      if (session.start && !session.end) {
        const orphan = this.createOrphanEventFromEvent(session.start);
        if (orphan) orphanEvents.push(orphan);
      }
    }

    // Identify orphan active_time sessions
    for (const [, session] of activitySessions.entries()) {
      if (session.start && !session.end) {
        const orphan = this.createOrphanEventFromEvent(session.start);
        if (orphan) orphanEvents.push(orphan);
      }
    }

    // Identify orphan checkpoints
    for (const checkpoint of checkpoints.values()) {
      const hasContinuation = checkpoint.activityId
        ? activitySessions.has(checkpoint.activityId) &&
          activitySessions.get(checkpoint.activityId)!.end !== undefined
        : sessions.has(checkpoint.visitId) && sessions.get(checkpoint.visitId)!.end !== undefined;

      if (!hasContinuation) {
        const orphan = this.createOrphanEventFromEvent(checkpoint);
        if (orphan) orphanEvents.push(orphan);
      }
    }

    StartupRecovery.logger.info(`Found ${orphanEvents.length} distinct orphan events after analysis.`);
    StartupRecovery.logger.debug(`Found ${orphanEvents.length} distinct orphan events after analysis.`, {
      orphanEvents,
      allUnprocessedEvents
    });
    return orphanEvents;
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
      timestamp: this.stats.recoveryStartTime,
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
