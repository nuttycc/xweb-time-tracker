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

/**
 * Schema for orphan session data
 */
export const OrphanSessionSchema = z.object({
  /** Event ID of the orphan session */
  id: z.string(),

  /** Event type (open_time_start or active_time_start) */
  eventType: z.enum(['open_time_start', 'active_time_start']),

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

export type OrphanSession = z.infer<typeof OrphanSessionSchema>;

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
  private static readonly logger = createLogger('StartupRecovery');

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
    stats: RecoveryStats,
    tabStates: Array<{ tabId: number, tabState: TabState }>,
    events: DomainEvent[]
  }> {
    StartupRecovery.logger.info('♻️ Starting startup recovery process');

    try {
      // Phase 1: Recover orphan sessions in DB
      await this.recoverOrphanSessions();

      // Phase 2: Generate open_time_start events and tabStates for current tabs
      const { tabStates, events } = await this.initializeCurrentState();

      this.stats.recoveryCompletionTime = Date.now();
      StartupRecovery.logger.info('✅ Startup recovery completed', { 
        orphanSessionsFound: this.stats.orphanSessionsFound,
        recoveryEventsGenerated: this.stats.recoveryEventsGenerated,
        currentTabsInitialized: this.stats.currentTabsInitialized,
        duration: `${this.stats.recoveryCompletionTime - this.stats.recoveryStartTime}ms`
      });

      return { stats: this.stats, tabStates, events };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.stats.errors.push(errorMessage);
      StartupRecovery.logger.error('❌ Startup recovery failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Phase 1: Identify and recover orphan sessions
   */
  private async recoverOrphanSessions(): Promise<void> {
    StartupRecovery.logger.info('🔍 Phase 1: Searching for orphan sessions');

    try {
      // Find orphan sessions in the database
      const orphanSessions = await this.findOrphanSessions();
      this.stats.orphanSessionsFound = orphanSessions.length;

      if (orphanSessions.length === 0) {
        StartupRecovery.logger.info('✅ No orphan sessions found');
        return;
      }

      StartupRecovery.logger.info(`🔍 Found ${orphanSessions.length} orphan sessions to recover`);

      // Generate recovery events for each orphan session
      for (const session of orphanSessions) {
        await this.generateRecoveryEvent(session);
        this.stats.recoveryEventsGenerated++;
      }

      StartupRecovery.logger.info(`✅ Generated ${this.stats.recoveryEventsGenerated} recovery events`);
    } catch (error) {
      const errorMessage = `Phase 1 failed: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Phase 2: Generate open_time_start events and tab session state for all currently open tabs.
   *
   * This does NOT write to DB. Instead, it returns the events and tabStates for in-memory initialization.
   *
   * @returns {Promise<{ tabStates: Array<{ tabId: number, tabState: TabState }>, events: DomainEvent[] }>}
   *   tabStates: Initial in-memory session state for each tab
   *   events: open_time_start events for each tab
   */
  private async initializeCurrentState(): Promise<{
    tabStates: Array<{ tabId: number, tabState: TabState }>,
    events: DomainEvent[]
  }> {
    StartupRecovery.logger.info('▶️ Phase 2: Generating session state for current browser tabs');

    const tabStates: Array<{ tabId: number, tabState: TabState }> = [];
    const events: DomainEvent[] = [];

    try {
      // Clear old local storage state
      await this.clearOldLocalState();

      // Get all currently open tabs
      const currentTabs = (await browser.tabs.query({})).filter(tab => tab.id !== undefined && tab.id >= 0);
      StartupRecovery.logger.info(`🔍 Found ${currentTabs.length} currently open tabs`);

      for (const tab of currentTabs) {
        if (tab.url && tab.id !== undefined) {
          // Generate open_time_start event for the tab
          const result = this.eventGenerator.generateOpenTimeStart(
            tab.id,
            tab.url,
            Date.now(),
            tab.windowId || 0
          );

          if (!result.success || !result.event?.visitId) {
            if (result.metadata?.urlFiltered) {
              StartupRecovery.logger.debug('🤔 Skipped tab for filtered URL', {
                tabId: tab.id,
                url: tab.url,
                reason: result.metadata.skipReason,
              });
            } else {
              StartupRecovery.logger.error('❌ Failed to generate open_time_start for tab', {
                tabId: tab.id,
                error: result.error,
              });
            }
            continue;
          }

          // Build initial tab state (in-memory)
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
          };

          tabStates.push({ tabId: tab.id, tabState: initialTabState });
          events.push(result.event);
        }
      }
      StartupRecovery.logger.info(`▶️ Generated ${events.length} open_time_start events for current tabs`);
      this.stats.currentTabsInitialized = tabStates.length;
      return { tabStates, events };
    } catch (error) {
      const errorMessage = `Phase 2 failed: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Find orphan sessions in the database
   */
  private async findOrphanSessions(): Promise<OrphanSession[]> {
    const cutoffTime = Date.now() - this.config.maxSessionAge;
    const orphanSessions: OrphanSession[] = [];

    // Query for open_time_start events without corresponding end events
    StartupRecovery.logger.debug(`Querying for open_time_start events from ${(new Date(cutoffTime)).toLocaleString()} to ${(new Date(Date.now())).toLocaleString()}`);
    const openTimeStartEvents = await this.getEventsByTypeAndTimeRange(
      'open_time_start',
      cutoffTime,
      Date.now()
    );
    StartupRecovery.logger.debug(`Found ${openTimeStartEvents.length} open_time_start events in time range`);

    for (const startEvent of openTimeStartEvents) {
      StartupRecovery.logger.trace(
        `Checking start event: visitId=${startEvent.visitId}, timestamp=${startEvent.timestamp}`
      );
      const hasEndEvent = await this.hasCorrespondingEndEvent(startEvent);
      StartupRecovery.logger.trace(`Has corresponding end event: ${hasEndEvent}`);
      if (!hasEndEvent) {
        const orphanSession = this.createOrphanSessionFromEvent(startEvent);
        if (orphanSession) {
          orphanSessions.push(orphanSession);
          StartupRecovery.logger.debug(`Added orphan session: ${orphanSession.id}`);
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
        const orphanSession = this.createOrphanSessionFromEvent(startEvent);
        if (orphanSession) {
          orphanSessions.push(orphanSession);
        }
      }
    }

    return orphanSessions;
  }

  /**
   * Get events by type and time range (wrapper for database service)
   */
  private async getEventsByTypeAndTimeRange(
    eventType: 'open_time_start' | 'active_time_start',
    startTime: number,
    endTime: number
  ): Promise<EventsLogRecord[]> {
    // Use the public API method
    return this.databaseService.getEventsByTypeAndTimeRange(eventType, startTime, endTime);
  }

  /**
   * Check if a start event has a corresponding end event
   */
  private async hasCorrespondingEndEvent(startEvent: EventsLogRecord): Promise<boolean> {
    const endEventType =
      startEvent.eventType === 'open_time_start' ? 'open_time_end' : 'active_time_end';

    const sessionId =
      startEvent.eventType === 'open_time_start' ? startEvent.visitId : startEvent.activityId;

    StartupRecovery.logger.trace(`Checking for end event: sessionId=${sessionId}, endEventType=${endEventType}`);

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
  private createOrphanSessionFromEvent(event: EventsLogRecord): OrphanSession | null {
    try {
      // Extract domain from URL if not available in event
      const domain = event.url ? new URL(event.url).hostname : 'unknown';

      return OrphanSessionSchema.parse({
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
  private async generateRecoveryEvent(session: OrphanSession): Promise<void> {
    const sessionId = session.visitId || session.activityId;

    if (!sessionId) {
      StartupRecovery.logger.warn('⚠️ Cannot generate recovery event: missing session ID', { 
        eventType: session.eventType, 
        url: session.url 
      });
      return;
    }

    // Create a mock tab state for the recovery event
    const mockTabState: TabState = {
      url: session.url,
      visitId: session.visitId || '',
      activityId: session.activityId || null,
      isAudible: false,
      lastInteractionTimestamp: session.timestamp,
      openTimeStart: session.timestamp,
      activeTimeStart: session.eventType === 'active_time_start' ? session.timestamp : null,
      isFocused: false,
      tabId: session.tabId || 0,
      windowId: 0, // Window ID is not available in recovery context
    };

    const context = {
      tabState: mockTabState,
      timestamp: session.timestamp,
      resolution: 'crash_recovery' as const,
    };

    let result;
    if (session.eventType === 'open_time_start') {
      result = this.eventGenerator.generateOpenTimeEnd(context);
    } else {
      result = this.eventGenerator.generateActiveTimeEnd(context, 'tab_closed');
    }

    if (!result.success) {
      StartupRecovery.logger.error('❌ Failed to generate recovery event', {
        session,
        error: result.error,
      });
      return;
    }

    // Save the generated event to the database
    if (result.event) {
      try {
        await this.databaseService.addEvent(result.event);
        StartupRecovery.logger.info(`⏹️ Generated recovery event: ${result.event.eventType}`, {
          sessionId,
          url: session.url,
          originalEventType: session.eventType,
        });
      } catch (error) {
        StartupRecovery.logger.error('❌ Failed to save recovery event to database', {
          session,
          event: result.event,
          error,
        });
      }
    } else {
      StartupRecovery.logger.warn('⚠️ No event generated for recovery', { 
        eventType: session.eventType, 
        url: session.url 
      });
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

      StartupRecovery.logger.debug('🧹 Cleared old local storage state');
    } catch (error) {
      StartupRecovery.logger.warn('⚠️ Failed to clear local storage', { error: error instanceof Error ? error.message : String(error) });
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
