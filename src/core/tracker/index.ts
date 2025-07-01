/**
 * Main Time Tracker Module
 *
 * Provides a clean TimeTracker API that orchestrates all components of the time tracking system.
 * This is the primary interface used by the background script to manage time tracking functionality.
 * Integrates FocusStateManager, EventGenerator, EventQueue, CheckpointScheduler, and StartupRecovery
 * to provide a unified time tracking experience.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { z } from 'zod/v4';
import { browser } from '#imports';
import { type Browser } from 'wxt/browser';
import { EventGenerator } from './events/EventGenerator';
import { EventQueue } from './queue/EventQueue';
import { CheckpointScheduler } from './scheduler/CheckpointScheduler';
import { StartupRecovery } from './recovery/StartupRecovery';
import { createLogger } from '@/utils/logger';
import { InteractionDetector } from './messaging/InteractionDetector';
import { DatabaseService } from '../db/services/database.service';
import { db, type WebTimeTrackerDB } from '../db/schemas';
import { TabState, InteractionMessage } from './types';
import { TabStateManager } from './state/TabStateManager';

/**
 * Time tracker configuration schema
 */
export const TimeTrackerConfigSchema = z.object({
  /** Whether to enable debug logging */
  enableDebugLogging: z.boolean().default(false),

  /** Whether to perform startup recovery */
  enableStartupRecovery: z.boolean().default(true),

  /** Whether to enable checkpoint scheduling */
  enableCheckpoints: z.boolean().default(true),

  /** Event queue configuration */
  eventQueue: z
    .object({
      maxQueueSize: z.number().int().min(10).max(1000).default(100),
      maxWaitTime: z.number().int().min(1000).max(30000).default(5000),
      maxRetries: z.number().int().min(1).max(10).default(3),
    })
    .default({
      maxQueueSize: 100,
      maxWaitTime: 5000,
      maxRetries: 3,
    }),

  /** Checkpoint scheduler configuration */
  checkpointScheduler: z
    .object({
      intervalMinutes: z.number().int().min(5).max(120).default(30),
      activeTimeThresholdHours: z.number().min(0.5).max(8).default(2),
      openTimeThresholdHours: z.number().min(1).max(24).default(4),
    })
    .default({
      intervalMinutes: 30,
      activeTimeThresholdHours: 2,
      openTimeThresholdHours: 4,
    }),

  /** Startup recovery configuration */
  startupRecovery: z
    .object({
      maxSessionAge: z.number().int().min(3600000).max(86400000).default(86400000), // 1-24 hours
    })
    .default({
      maxSessionAge: 86400000,
    }),
});

export type TimeTrackerConfig = z.infer<typeof TimeTrackerConfigSchema>;

/**
 * Time tracker initialization result
 */
export interface TimeTrackerInitResult {
  /** Whether initialization was successful */
  success: boolean;

  /** Error message if initialization failed */
  error?: string;

  /** Initialization statistics */
  stats?: {
    /** Number of orphan sessions recovered */
    orphanSessionsRecovered: number;

    /** Number of current tabs initialized */
    currentTabsInitialized: number;

    /** Initialization time in milliseconds */
    initializationTime: number;
  };
}

/**
 * Browser event types that the tracker handles
 */
export type BrowserEventType =
  | 'tab-activated'
  | 'tab-updated'
  | 'tab-removed'
  | 'window-focus-changed'
  | 'web-navigation-committed'
  | 'user-interaction'
  | 'runtime-suspend';

/**
 * Browser event data
 *
 * @property {BrowserEventType} type - The type of browser event being handled.
 * @property {number} [tabId] - The ID of the associated tab (optional), as some events may not have one.
 * @property {number} [windowId] - The ID of the associated window (optional), as some events may not have one.
 * @property {string} [url] - The URL of the page related to the event (optional), such as navigation or update events.
 * @property {Browser.tabs.TabChangeInfo} [changeInfo] - Detailed information about tab changes (optional), such as URL, audible status, etc.
 * @property {InteractionMessage} [interaction] - The user interaction message body (optional), present only for 'user-interaction' events.
 * @property {number} timestamp - The timestamp of when the event occurred (in milliseconds).
 */
export interface BrowserEventData {
  type: BrowserEventType;
  tabId?: number;
  windowId?: number;
  url?: string;
  changeInfo?: Browser.tabs.TabChangeInfo;
  interaction?: InteractionMessage;
  timestamp: number;
}

/**
 * Time Tracker Class
 *
 * Main orchestrator for the time tracking system. Coordinates all components
 * and provides a clean API for the background script.
 */
export class TimeTracker {
  private static readonly logger = createLogger('TimeTracker');
  private config: TimeTrackerConfig;
  private isInitialized = false;
  private isStarted = false;

  // Core components
  private tabStateManager: TabStateManager;
  private eventGenerator: EventGenerator;
  private eventQueue: EventQueue;
  private checkpointScheduler: CheckpointScheduler;
  private startupRecovery: StartupRecovery;
  private interactionDetector: InteractionDetector;
  private databaseService: DatabaseService;

  // Race condition protection for active session creation
  private activeSessionPromises = new Map<number, Promise<void>>();

  // Event handlers mapping for type-safe event processing
  private readonly eventHandlers = new Map<BrowserEventType, (eventData: BrowserEventData) => Promise<void>>([
    ['tab-activated', this.handleTabActivated.bind(this)],
    ['tab-updated', this.handleTabUpdated.bind(this)],
    ['tab-removed', this.handleTabRemoved.bind(this)],
    ['window-focus-changed', this.handleWindowFocusChanged.bind(this)],
    ['web-navigation-committed', this.handleWebNavigationCommitted.bind(this)],
    ['user-interaction', this.handleUserInteraction.bind(this)],
    ['runtime-suspend', () => this.handleRuntimeSuspend()],
  ]);

  constructor(
    config: Partial<TimeTrackerConfig> = {},
    database?: WebTimeTrackerDB,
    databaseService?: DatabaseService
  ) {
    this.config = TimeTrackerConfigSchema.parse(config);

    // Use provided database or default global instance
    const dbInstance = database || db;

    // Use provided database service or create one
    if (databaseService) {
      this.databaseService = databaseService;
    } else {
      // Create database service without health checker for backward compatibility
      // In production, use the singleton with health checker
      this.databaseService = new DatabaseService(dbInstance);
    }

    // Initialize core components
    this.tabStateManager = new TabStateManager();
    this.eventGenerator = new EventGenerator({
      validateEvents: true,
    });

    this.eventQueue = new EventQueue(dbInstance, {
      maxQueueSize: this.config.eventQueue.maxQueueSize,
      maxWaitTime: this.config.eventQueue.maxWaitTime,
      maxRetries: this.config.eventQueue.maxRetries,
    });

    this.checkpointScheduler = new CheckpointScheduler(
      this.tabStateManager,
      this.eventGenerator,
      this.eventQueue,
      {
        intervalMinutes: this.config.checkpointScheduler.intervalMinutes,
        activeTimeThresholdHours: this.config.checkpointScheduler.activeTimeThresholdHours,
        openTimeThresholdHours: this.config.checkpointScheduler.openTimeThresholdHours,
        enableDebugLogging: this.config.enableDebugLogging,
      }
    );

    this.startupRecovery = new StartupRecovery(this.eventGenerator, this.databaseService, {
      maxSessionAge: this.config.startupRecovery.maxSessionAge,
      enableDebugLogging: this.config.enableDebugLogging,
    });

    this.interactionDetector = new InteractionDetector();
  }

  /**
   * Initialize the time tracker
   *
   * This method uses StartupRecovery as the single entry point to recover session state:
   * - Phase 1: Recovers orphan sessions in the DB (crash recovery)
   * - Phase 2: Generates open_time_start events and in-memory tab session state for all current tabs (no direct DB write)
   *
   * The returned tabStates are used to initialize FocusStateManager (in-memory session state),
   * and the events are queued to EventQueue for DB persistence. This eliminates redundant event generation.
   *
   * @returns Initialization result
   */
  async initialize(): Promise<TimeTrackerInitResult> {
    if (this.isInitialized) {
      return {
        success: false,
        error: 'Time tracker is already initialized',
      };
    }

    const startTime = Date.now();

    try {
      TimeTracker.logger.info('ℹ️ TimeTracker initializing...');

      // Use StartupRecovery as the single entry for both DB and in-memory session state recovery
      let recoveryResult;
      if (this.config.enableStartupRecovery) {
        recoveryResult = await this.startupRecovery.executeRecovery();
      } else {
        recoveryResult = { stats: { orphanSessionsRecovered: 0, currentTabsInitialized: 0, initializationTime: 0 }, tabStates: [], events: [] };
      }

      // Initialize in-memory tab states
      this.tabStateManager.clearAllState();
      for (const { tabId, tabState } of recoveryResult.tabStates) {
        this.tabStateManager.createTabState(tabId, tabState, tabState.windowId);
      }

      // Queue open_time_start events for DB persistence
      for (const event of recoveryResult.events) {
        await this.eventQueue.enqueue(event);
      }

      // Initialize interaction detector
      this.interactionDetector.initialize();

      this.isInitialized = true;
      const initializationTime = Date.now() - startTime;

      TimeTracker.logger.info('✅ TimeTracker initialized', { 
        orphanSessionsRecovered: recoveryResult.stats.orphanSessionsFound || 0,
        currentTabsInitialized: recoveryResult.stats.currentTabsInitialized || 0,
        duration: `${initializationTime}ms`
      });

      return {
        success: true,
        stats: {
          orphanSessionsRecovered: recoveryResult.stats.orphanSessionsFound || 0,
          currentTabsInitialized: recoveryResult.stats.currentTabsInitialized || 0,
          initializationTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      TimeTracker.logger.error('❌ TimeTracker initialization failed', { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Start the time tracker
   *
   * @returns Whether start was successful
   */
  async start(): Promise<boolean> {
    if (!this.isInitialized) {
      TimeTracker.logger.warn('⚠️ Cannot start: TimeTracker not initialized');
      return false;
    }

    if (this.isStarted) {
      TimeTracker.logger.info('ℹ️ TimeTracker is already started');
      return true;
    }

    try {
      TimeTracker.logger.info('▶️ TimeTracker starting...');

      // Start checkpoint scheduler if enabled
      if (this.config.enableCheckpoints) {
        await this.checkpointScheduler.initialize();
        TimeTracker.logger.debug('⏰ Checkpoint scheduler started');
      }

      this.isStarted = true;
      TimeTracker.logger.info('✅ TimeTracker started');

      return true;
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to start TimeTracker', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Stop the time tracker
   *
   * @returns Whether stop was successful
   */
  async stop(): Promise<boolean> {
    if (!this.isStarted) {
      TimeTracker.logger.info('ℹ️ TimeTracker is not started');
      return true;
    }

    try {
      TimeTracker.logger.info('⏹️ TimeTracker stopping...');

      // Flush any pending events
      await this.eventQueue.flush();

      // Stop checkpoint scheduler
      if (this.config.enableCheckpoints) {
        await this.checkpointScheduler.stop();
        TimeTracker.logger.debug('⏰ Checkpoint scheduler stopped');
      }

      this.isStarted = false;
      TimeTracker.logger.info('✅ TimeTracker stopped');

      return true;
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to stop TimeTracker', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Handle browser events
   *
   * @param eventData - Browser event data
   */
  async handleBrowserEvent(eventData: BrowserEventData): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // TimeTracker.logger.debug(`🔍 Handling browser event: ${eventData.type}`);

      const handler = this.eventHandlers.get(eventData.type);
      if (handler) {
        await handler(eventData);
      } else {
        TimeTracker.logger.warn('⚠️ Unknown browser event type', { type: eventData.type });
      }
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to handle browser event', {
        type: eventData.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current tracker status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isStarted: this.isStarted,
      config: this.config,
      queueSize: this.eventQueue.size(),
      focusedTab: this.tabStateManager.getFocusedTab(),
    };
  }

  /**
   * Handle tab activation
   */
  private async handleTabActivated(eventData: BrowserEventData): Promise<void> {
    TimeTracker.logger.debug(`🔧 Handling tab activated`, { tabId: eventData.tabId, windowId: eventData.windowId });

    // Get previous focus state before updating (always needed for focus loss handling)
    const previousFocusContext = this.tabStateManager.getFocusContext();
    const previousTabId = previousFocusContext.focusedTabId;

    // Always end previous tab's active time if it was active (focus loss handling)
    if (previousTabId !== null) {
      const prevTabState = this.tabStateManager.getTabState(previousTabId);
      if (prevTabState?.activeTimeStart) {
        await this.generateAndQueueActiveTimeEnd(prevTabState, eventData.timestamp);
      }
    }

    // Only process new focus if we have a valid tabId
    if (eventData.tabId !== undefined && eventData.tabId >= 0) {
      // Ensure tab state exists before processing
      await this.getOrCreateTabState(eventData.tabId);

      // Update focus state
      this.tabStateManager.setFocusedTab(eventData.tabId, eventData.windowId || 0);
    } else {
      // Clear focus when tabId is invalid (e.g., -1 indicates no focused tab)
      this.tabStateManager.clearFocus();
    }
  }

  /**
   * Handle tab updates (non-navigation changes only)
   */
  private async handleTabUpdated(eventData: BrowserEventData): Promise<void> {
    if (eventData.tabId === undefined || eventData.tabId < 0 || !eventData.changeInfo) return;

    TimeTracker.logger.debug(`🔧 Handling tab updated`, { tabId: eventData.tabId, changeInfo: eventData.changeInfo });

    // Ensure tab state exists before processing
    await this.getOrCreateTabState(eventData.tabId);

    const currentState = this.tabStateManager.getTabState(eventData.tabId);
    
    // Handle audible state changes (independent of navigation)
    if ('audible' in eventData.changeInfo && currentState) {
      this.tabStateManager.updateTabState(eventData.tabId, {
        isAudible: eventData.changeInfo.audible,
      });
      TimeTracker.logger.debug(`🔊 Updated audible state`, { 
        tabId: eventData.tabId, 
        isAudible: eventData.changeInfo.audible 
      });
    }

    // Note: URL changes are now handled exclusively by handleWebNavigationCommitted
    // to prevent duplicate open_time_start events
  }

  /**
   * Handle tab removal
   */
  private async handleTabRemoved(eventData: BrowserEventData): Promise<void> {
    if (eventData.tabId === undefined || eventData.tabId < 0) return;

    TimeTracker.logger.debug(`🔧 Handling tab removed`, { tabId: eventData.tabId });

    const tabState = this.tabStateManager.getTabState(eventData.tabId);
    if (tabState) {
      // End any active sessions
      if (tabState.activeTimeStart) {
        await this.generateAndQueueActiveTimeEnd(tabState, eventData.timestamp, 'tab_closed');
      }
      await this.generateAndQueueOpenTimeEnd(tabState, eventData.timestamp);

      // Clear tab state
      this.tabStateManager.clearTabState(eventData.tabId);
    }
  }

  // TODO: Implement window focus change handling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async handleWindowFocusChanged(eventData: BrowserEventData): Promise<void> {
    // Implementation depends on specific focus change logic
    // TimeTracker.logger.debug('🔄 Window focus changed', { windowId: eventData.windowId });
  }

  private async handleWebNavigationCommitted(eventData: BrowserEventData): Promise<void> {
    TimeTracker.logger.debug(`🔧 Handling web navigation committed`, { tabId: eventData.tabId, url: eventData.url });

    // Handle URL navigation (both regular and SPA navigation)
    if (eventData.tabId === undefined || eventData.tabId < 0 || !eventData.url) return;

    try {
      const currentState = this.tabStateManager.getTabState(eventData.tabId);
      
      // Only process if URL actually changed
      if (currentState && currentState.url !== eventData.url) {
        // Step 1: End active session if it exists
        if (currentState.activeTimeStart) {
          await this.generateAndQueueActiveTimeEnd(currentState, eventData.timestamp, 'navigation');
        }

        // Step 2: End current open time session
        await this.generateAndQueueOpenTimeEnd(currentState, eventData.timestamp);

        // Step 3: Start new open time session
        const tab = await browser.tabs.get(eventData.tabId);
        await this.startNewOpenTimeSession(tab, eventData.timestamp);
      } else if (!currentState || !currentState.visitId) {
        // First time encountering this tab OR tab exists but has no active session
        const tab = await browser.tabs.get(eventData.tabId);
        await this.startNewOpenTimeSession(tab, eventData.timestamp);
      }
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to handle web navigation', { 
        tabId: eventData.tabId, 
        url: eventData.url,
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private async handleUserInteraction(eventData: BrowserEventData): Promise<void> {
    if (!eventData.interaction || eventData.tabId === undefined || eventData.tabId < 0) return;

    TimeTracker.logger.debug(`🔧 Handling user interaction`, { tabId: eventData.tabId, type: eventData.interaction.type });

    // Ensure tab state exists before processing
    await this.getOrCreateTabState(eventData.tabId);

    const tabId = eventData.tabId;
    const tabState = this.tabStateManager.getTabState(tabId);
    
    // Check if we need to start active time tracking
    // Use async operation lock to prevent race conditions from concurrent interactions
    if (tabState && !tabState.activeTimeStart && !this.activeSessionPromises.has(tabId)) {
      // Create promise for starting active session and set up the async lock
      const activeSessionPromise = this.generateAndQueueActiveTimeStart(tabState, eventData.timestamp)
        .finally(() => {
          // Always clean up the lock when operation completes (success or failure)
          this.activeSessionPromises.delete(tabId);
        });

      // Set the async lock immediately to prevent concurrent operations
      this.activeSessionPromises.set(tabId, activeSessionPromise);
      
      // Note: We don't await the promise here to avoid blocking the interaction processing
      // The lock mechanism ensures only one active session creation happens per tab
    }

    // Update last interaction timestamp (this should always happen)
    this.tabStateManager.updateLastInteraction(eventData.tabId, eventData.timestamp);
  }

  private async handleRuntimeSuspend(): Promise<void> {
    TimeTracker.logger.info('⚠️ Runtime suspending, flushing event queue...');
    await this.eventQueue.flush();
  }

  // Helper methods for event generation and queuing
  private async startNewOpenTimeSession(
    tab: Browser.tabs.Tab,
    timestamp: number
  ): Promise<void> {
    if (tab.id === undefined || tab.id < 0 || !tab.url) return;

    try {
      // Step 1: Generate open_time_start event
      const result = this.eventGenerator.generateOpenTimeStart(
        tab.id,
        tab.url,
        timestamp,
        tab.windowId || 0
      );

      if (!result.success || !result.event) {
        if (result.metadata?.urlFiltered) {
          TimeTracker.logger.debug('🤔 URL filtered, session not started', {
            tabId: tab.id,
            url: tab.url,
            reason: result.metadata.skipReason,
          });
        } else {
          TimeTracker.logger.error('❌ Failed to generate open_time_start event', {
            tabId: tab.id,
            error: result.error,
          });
        }
        return;
      }

      // Step 2: Create or update tab state with event data
      const newTabState = {
        url: tab.url,
        visitId: result.event.visitId!,
        activityId: null,
        isAudible: tab.audible || false,
        lastInteractionTimestamp: timestamp,
        openTimeStart: timestamp,
        activeTimeStart: null,
      };

      // Check if tab state already exists
      const existingState = this.tabStateManager.getTabState(tab.id);
      if (existingState) {
        this.tabStateManager.updateTabState(tab.id, newTabState);
      } else {
        this.tabStateManager.createTabState(tab.id, newTabState, tab.windowId || 0);
      }

      // Step 3: Enqueue the event for persistence
      await this.eventQueue.enqueue(result.event);

      TimeTracker.logger.debug('▶️ Started new open time session', {
        tabId: tab.id,
        url: tab.url,
        visitId: result.event.visitId,
      });
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to start new open time session', {
        tabId: tab.id,
        url: tab.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async generateAndQueueOpenTimeEnd(tabState: TabState, timestamp: number): Promise<void> {
    const context = {
      tabState,
      timestamp,
    };

    const result = this.eventGenerator.generateOpenTimeEnd(context);
    if (result.success && result.event) {
      await this.eventQueue.enqueue(result.event);
    }
  }

  private async generateAndQueueActiveTimeStart(
    tabState: TabState,
    timestamp: number
  ): Promise<void> {
    const context = {
      tabState,
      timestamp,
    };

    const result = this.eventGenerator.generateActiveTimeStart(context);
    if (result.success && result.event) {
      await this.eventQueue.enqueue(result.event);

      // Update tab state
      this.tabStateManager.updateTabState(tabState.tabId, {
        activityId: result.event.activityId!,
        activeTimeStart: timestamp,
      });
    }
  }

  private async generateAndQueueActiveTimeEnd(
    tabState: TabState,
    timestamp: number,
    reason: 'timeout' | 'focus_lost' | 'tab_closed' | 'navigation' = 'focus_lost'
  ): Promise<void> {
    const context = {
      tabState,
      timestamp,
    };

    const result = this.eventGenerator.generateActiveTimeEnd(context, reason);
    if (result.success && result.event) {
      await this.eventQueue.enqueue(result.event);

      // Clear active time state
      this.tabStateManager.updateTabState(tabState.tabId, {
        activityId: null,
        activeTimeStart: null,
      });
    }
  }

  /**
   * Check if the tracker is initialized (for testing)
   */
  getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if the tracker is started (for testing)
   */
  getStartedStatus(): boolean {
    return this.isStarted;
  }

  /**
   * Get or create tab state for the given tab ID (memory-only operation)
   */
  private async getOrCreateTabState(tabId: number): Promise<void> {
    if (tabId < 0) {
      // Ignore invalid tab IDs, like browser.tabs.TAB_ID_NONE (-1)
      return;
    }

    // Check if tab state already exists
    const existingState = this.tabStateManager.getTabState(tabId);
    if (existingState) {
      return; // State already exists
    }

    try {
      // Get tab information from browser
      const tab = await browser.tabs.get(tabId);
      // After fetching the tab, perform a robust check on the result.
      if (!tab || tab.id === undefined || tab.id < 0 || !tab.url) {
        TimeTracker.logger.debug('🤔 Cannot create tab state: invalid tab data');
        return;
      }

      // Create memory-only tab state (no events)
      this.createTabStateForTab(tab);

      TimeTracker.logger.debug('🔧 Created tab state (memory-only)', {
        tabId,
        url: tab.url,
      });
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to get or create tab state', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create tab state for a specific tab (memory-only, no events)
   */
  private createTabStateForTab(tab: Browser.tabs.Tab): void {
    // Robustly check for a valid tab ID and URL before proceeding.
    // tab.id can be 0, so !tab.id is not a safe check.
    if (tab.id === undefined || tab.id < 0 || !tab.url) {
      TimeTracker.logger.debug('🤔 Skipped creating tab state due to invalid tab data');
      return;
    }

    try {
      const timestamp = Date.now();

      // Create basic tab state (no visitId yet - will be set by session starter)
      const initialTabState = {
        url: tab.url,
        visitId: '', // Will be set when session is actually started
        activityId: null,
        isAudible: tab.audible || false,
        lastInteractionTimestamp: timestamp,
        openTimeStart: timestamp,
        activeTimeStart: null,
      };

      this.tabStateManager.createTabState(tab.id, initialTabState, tab.windowId || 0, { validate: false });

      TimeTracker.logger.debug('🔧 Created tab state (memory-only)', {
        tabId: tab.id,
        url: tab.url,
      });
    } catch (error) {
      TimeTracker.logger.error('❌ Failed to create tab state for tab', {
        tabId: tab.id,
        url: tab.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Instantiates a new TimeTracker with optional configuration and database overrides.
 *
 * @param config - Optional configuration settings to override defaults
 * @param database - Optional database instance for custom storage or testing
 * @returns A new TimeTracker instance
 */
export function createTimeTracker(
  config: Partial<TimeTrackerConfig> = {},
  database?: WebTimeTrackerDB
): TimeTracker {
  return new TimeTracker(config, database);
}

// Export all types and components for external use
export * from './types';
export * from './state/TabStateManager';
export * from './events/EventGenerator';
export * from './queue/EventQueue';
export * from './scheduler/CheckpointScheduler';
export * from './recovery/StartupRecovery';
export * from './messaging/InteractionDetector';
export * from './url/URLProcessor';
