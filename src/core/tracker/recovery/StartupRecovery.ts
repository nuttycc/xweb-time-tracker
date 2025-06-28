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
import { type Browser } from 'wxt/browser';
import { EventGenerator } from '../events/EventGenerator';
import { DatabaseService } from '../../db/services/database.service';
import { EventsLogRecord } from '../../db/models/eventslog.model';
import { TabState } from '../types';

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
   * @returns Recovery statistics
   */
  async executeRecovery(): Promise<RecoveryStats> {
    this.log('Starting startup recovery process');

    try {
      // Phase 1: Recover orphan sessions
      await this.recoverOrphanSessions();

      // Phase 2: Initialize current browser state
      await this.initializeCurrentState();

      this.stats.recoveryCompletionTime = Date.now();
      this.log('Startup recovery completed successfully', this.stats);

      return this.stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.stats.errors.push(errorMessage);
      this.log('Startup recovery failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Phase 1: Identify and recover orphan sessions
   */
  private async recoverOrphanSessions(): Promise<void> {
    this.log('Phase 1: Recovering orphan sessions');

    try {
      // Find orphan sessions in the database
      const orphanSessions = await this.findOrphanSessions();
      this.stats.orphanSessionsFound = orphanSessions.length;

      if (orphanSessions.length === 0) {
        this.log('No orphan sessions found');
        return;
      }

      this.log(`Found ${orphanSessions.length} orphan sessions`);

      // Generate recovery events for each orphan session
      for (const session of orphanSessions) {
        await this.generateRecoveryEvent(session);
        this.stats.recoveryEventsGenerated++;
      }

      this.log(`Generated ${this.stats.recoveryEventsGenerated} recovery events`);
    } catch (error) {
      const errorMessage = `Phase 1 failed: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Phase 2: Clear old state and initialize current browser state
   */
  private async initializeCurrentState(): Promise<void> {
    this.log('Phase 2: Initializing current browser state');

    try {
      // Clear old local storage state
      await this.clearOldLocalState();

      // Get all currently open tabs
      const currentTabs = await browser.tabs.query({});
      this.log(`Found ${currentTabs.length} currently open tabs`);

      // Initialize sessions for current tabs
      for (const tab of currentTabs) {
        if (tab.url && tab.id !== undefined) {
          await this.initializeTabSession(tab);
          this.stats.currentTabsInitialized++;
        }
      }

      this.log(`Initialized ${this.stats.currentTabsInitialized} tab sessions`);
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
    this.log(`Querying for open_time_start events from ${cutoffTime} to ${Date.now()}`);
    const openTimeStartEvents = await this.getEventsByTypeAndTimeRange(
      'open_time_start',
      cutoffTime,
      Date.now()
    );
    this.log(`Found ${openTimeStartEvents.length} open_time_start events in time range`);

    for (const startEvent of openTimeStartEvents) {
      this.log(
        `Checking start event: visitId=${startEvent.visitId}, timestamp=${startEvent.timestamp}`
      );
      const hasEndEvent = await this.hasCorrespondingEndEvent(startEvent);
      this.log(`Has corresponding end event: ${hasEndEvent}`);
      if (!hasEndEvent) {
        const orphanSession = this.createOrphanSessionFromEvent(startEvent);
        if (orphanSession) {
          orphanSessions.push(orphanSession);
          this.log(`Added orphan session: ${orphanSession.id}`);
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

    this.log(`Checking for end event: sessionId=${sessionId}, endEventType=${endEventType}`);

    if (!sessionId) {
      this.log('No sessionId found, returning false');
      return false;
    }

    // Query for end events with the same session ID
    const endEvents = await this.getEventsBySessionId(sessionId, endEventType);
    this.log(`Found ${endEvents.length} end events for sessionId=${sessionId}`);

    if (endEvents.length > 0) {
      this.log(
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
      this.log('Failed to create orphan session from event', { event, error });
      return null;
    }
  }

  /**
   * Generate a recovery end event for an orphan session
   */
  private async generateRecoveryEvent(session: OrphanSession): Promise<void> {
    const sessionId = session.visitId || session.activityId;

    if (!sessionId) {
      this.log('Cannot generate recovery event: missing session ID', session);
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
      this.log('Failed to generate recovery event', {
        session,
        error: result.error,
      });
      return;
    }

    // Save the generated event to the database
    if (result.event) {
      try {
        await this.databaseService.addEvent(result.event);
        this.log(`Generated and saved recovery event for ${session.eventType}`, {
          sessionId,
          url: session.url,
          eventGenerated: result.event.eventType,
        });
      } catch (error) {
        this.log('Failed to save recovery event to database', {
          session,
          event: result.event,
          error,
        });
      }
    } else {
      this.log('No event generated for recovery', { session });
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

      this.log('Cleared old local storage state');
    } catch (error) {
      this.log('Failed to clear local storage', { error });
      // Don't throw here as this is not critical
    }
  }

  /**
   * Initialize a session for a currently open tab
   */
  private async initializeTabSession(tab: Browser.tabs.Tab): Promise<void> {
    if (!tab.url || !tab.id) {
      return;
    }

    try {
      // Generate open_time_start event for the tab
      const result = this.eventGenerator.generateOpenTimeStart(
        tab.id,
        tab.url,
        Date.now(),
        tab.windowId || 0
      );

      if (!result.success) {
        this.log(`Failed to generate open_time_start for tab ${tab.id}`, {
          error: result.error,
          url: tab.url,
        });
        return;
      }

      this.log(`Initialized session for tab ${tab.id}`, {
        url: tab.url,
        visitId: result.event?.visitId,
      });
    } catch (error) {
      this.log(`Failed to initialize session for tab ${tab.id}`, { error, url: tab.url });
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * Log debug messages if enabled
   */
  private log(message: string, data?: unknown): void {
    if (this.config.enableDebugLogging) {
      console.log(`[StartupRecovery] ${message}`, data || '');
    }
  }
}
