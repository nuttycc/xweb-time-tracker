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
import { FocusStateManager } from './state/FocusStateManager';
import { EventGenerator } from './events/EventGenerator';
import { EventQueue } from './queue/EventQueue';
import { CheckpointScheduler } from './scheduler/CheckpointScheduler';
import { StartupRecovery } from './recovery/StartupRecovery';
import { InteractionDetector } from './messaging/InteractionDetector';
import { DatabaseService } from '../db/services/database.service';
import { db, type WebTimeTrackerDB } from '../db/schemas';
import { TabState, InteractionMessage } from './types';

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
  private config: TimeTrackerConfig;
  private isInitialized = false;
  private isStarted = false;

  // Core components
  private focusStateManager: FocusStateManager;
  private eventGenerator: EventGenerator;
  private eventQueue: EventQueue;
  private checkpointScheduler: CheckpointScheduler;
  private startupRecovery: StartupRecovery;
  private interactionDetector: InteractionDetector;
  private databaseService: DatabaseService;

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
    this.focusStateManager = new FocusStateManager();
    this.eventGenerator = new EventGenerator({
      validateEvents: true,
    });

    this.eventQueue = new EventQueue(dbInstance, {
      maxQueueSize: this.config.eventQueue.maxQueueSize,
      maxWaitTime: this.config.eventQueue.maxWaitTime,
      maxRetries: this.config.eventQueue.maxRetries,
    });

    this.checkpointScheduler = new CheckpointScheduler(
      this.focusStateManager,
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
      this.log('Initializing time tracker...');

      // Perform startup recovery if enabled
      let recoveryStats;
      if (this.config.enableStartupRecovery) {
        this.log('Performing startup recovery...');
        recoveryStats = await this.startupRecovery.executeRecovery();
        this.log('Startup recovery completed', recoveryStats);
      }

      // Initialize interaction detector
      this.interactionDetector.initialize();

      this.isInitialized = true;
      const initializationTime = Date.now() - startTime;

      this.log(`Time tracker initialized successfully in ${initializationTime}ms`);

      return {
        success: true,
        stats: {
          orphanSessionsRecovered: recoveryStats?.recoveryEventsGenerated || 0,
          currentTabsInitialized: recoveryStats?.currentTabsInitialized || 0,
          initializationTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('Time tracker initialization failed', { error: errorMessage });

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
      this.log('Cannot start: time tracker not initialized');
      return false;
    }

    if (this.isStarted) {
      this.log('Time tracker is already started');
      return true;
    }

    try {
      this.log('Starting time tracker...');

      // Start checkpoint scheduler if enabled
      if (this.config.enableCheckpoints) {
        await this.checkpointScheduler.initialize();
        this.log('Checkpoint scheduler started');
      }

      this.isStarted = true;
      this.log('Time tracker started successfully');

      return true;
    } catch (error) {
      this.log('Failed to start time tracker', { error });
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
      this.log('Time tracker is not started');
      return true;
    }

    try {
      this.log('Stopping time tracker...');

      // Flush any pending events
      await this.eventQueue.flush();

      // Stop checkpoint scheduler
      if (this.config.enableCheckpoints) {
        await this.checkpointScheduler.stop();
        this.log('Checkpoint scheduler stopped');
      }

      this.isStarted = false;
      this.log('Time tracker stopped successfully');

      return true;
    } catch (error) {
      this.log('Failed to stop time tracker', { error });
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
      this.log('Handling browser event', { type: eventData.type, tabId: eventData.tabId });

      switch (eventData.type) {
        case 'tab-activated':
          await this.handleTabActivated(eventData);
          break;

        case 'tab-updated':
          await this.handleTabUpdated(eventData);
          break;

        case 'tab-removed':
          await this.handleTabRemoved(eventData);
          break;

        case 'window-focus-changed':
          await this.handleWindowFocusChanged(eventData);
          break;

        case 'web-navigation-committed':
          await this.handleWebNavigationCommitted(eventData);
          break;

        case 'user-interaction':
          await this.handleUserInteraction(eventData);
          break;

        case 'runtime-suspend':
          await this.handleRuntimeSuspend();
          break;

        default:
          this.log('Unknown browser event type', { type: eventData.type });
      }
    } catch (error) {
      this.log('Error handling browser event', {
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
      focusedTab: this.focusStateManager.getFocusedTab(),
    };
  }

  /**
   * Handle tab activation
   */
  private async handleTabActivated(eventData: BrowserEventData): Promise<void> {
    if (!eventData.tabId) return;

    // Get previous focus state before updating
    const previousFocusContext = this.focusStateManager.getFocusContext();
    const previousTabId = previousFocusContext.focusedTabId;

    // Update focus state
    this.focusStateManager.setFocusedTab(eventData.tabId, eventData.windowId || 0);

    // Generate events based on focus change
    if (previousTabId !== null) {
      // End previous tab's active time if it was active
      const prevTabState = this.focusStateManager.getTabState(previousTabId);
      if (prevTabState?.activeTimeStart) {
        await this.generateAndQueueActiveTimeEnd(prevTabState, eventData.timestamp);
      }
    }

    // Get current tab info and generate open time start if needed
    try {
      const tab = await browser.tabs.get(eventData.tabId);
      if (tab.url) {
        await this.generateAndQueueOpenTimeStart(tab, eventData.timestamp);
      }
    } catch (error) {
      this.log('Failed to get tab info for activation', { tabId: eventData.tabId, error });
    }
  }

  /**
   * Handle tab updates
   */
  private async handleTabUpdated(eventData: BrowserEventData): Promise<void> {
    if (!eventData.tabId || !eventData.url) return;

    // Check if this is a URL change
    const currentState = this.focusStateManager.getTabState(eventData.tabId);
    if (currentState && currentState.url !== eventData.url) {
      // URL changed - end current session and start new one
      await this.generateAndQueueOpenTimeEnd(currentState, eventData.timestamp);

      try {
        const tab = await browser.tabs.get(eventData.tabId);
        await this.generateAndQueueOpenTimeStart(tab, eventData.timestamp);
      } catch (error) {
        this.log('Failed to get tab info for update', { tabId: eventData.tabId, error });
      }
    }
  }

  /**
   * Handle tab removal
   */
  private async handleTabRemoved(eventData: BrowserEventData): Promise<void> {
    if (!eventData.tabId) return;

    const tabState = this.focusStateManager.getTabState(eventData.tabId);
    if (tabState) {
      // End any active sessions
      if (tabState.activeTimeStart) {
        await this.generateAndQueueActiveTimeEnd(tabState, eventData.timestamp);
      }
      await this.generateAndQueueOpenTimeEnd(tabState, eventData.timestamp);

      // Clear tab state
      this.focusStateManager.clearTabState(eventData.tabId);
    }
  }

  /**
   * Handle window focus changes
   */
  private async handleWindowFocusChanged(eventData: BrowserEventData): Promise<void> {
    // Implementation depends on specific focus change logic
    this.log('Window focus changed', { windowId: eventData.windowId });
  }

  /**
   * Handle web navigation
   */
  private async handleWebNavigationCommitted(eventData: BrowserEventData): Promise<void> {
    // Handle SPA navigation
    if (eventData.tabId && eventData.url) {
      await this.handleTabUpdated(eventData);
    }
  }

  /**
   * Handle user interactions
   */
  private async handleUserInteraction(eventData: BrowserEventData): Promise<void> {
    if (!eventData.interaction || !eventData.tabId) return;

    const tabState = this.focusStateManager.getTabState(eventData.tabId);
    if (tabState && !tabState.activeTimeStart) {
      // Start active time tracking
      await this.generateAndQueueActiveTimeStart(tabState, eventData.timestamp);
    }

    // Update last interaction timestamp
    this.focusStateManager.updateTabState(eventData.tabId, {
      lastInteractionTimestamp: eventData.timestamp,
    });
  }

  /**
   * Handle runtime suspend
   */
  private async handleRuntimeSuspend(): Promise<void> {
    this.log('Runtime suspending - flushing events');
    await this.eventQueue.flush();
  }

  // Helper methods for event generation and queuing
  private async generateAndQueueOpenTimeStart(
    tab: Browser.tabs.Tab,
    timestamp: number
  ): Promise<void> {
    if (!tab.id || !tab.url) return;

    const result = this.eventGenerator.generateOpenTimeStart(
      tab.id,
      tab.url,
      timestamp,
      tab.windowId || 0
    );

    if (result.success && result.event) {
      await this.eventQueue.enqueue(result.event);

      // Update tab state
      this.focusStateManager.updateTabState(tab.id, {
        url: tab.url,
        visitId: result.event.visitId!,
        openTimeStart: timestamp,
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
      this.focusStateManager.updateTabState(tabState.tabId, {
        activityId: result.event.activityId!,
        activeTimeStart: timestamp,
      });
    }
  }

  private async generateAndQueueActiveTimeEnd(
    tabState: TabState,
    timestamp: number
  ): Promise<void> {
    const context = {
      tabState,
      timestamp,
    };

    const result = this.eventGenerator.generateActiveTimeEnd(context, 'focus_lost');
    if (result.success && result.event) {
      await this.eventQueue.enqueue(result.event);

      // Clear active time state
      this.focusStateManager.updateTabState(tabState.windowId, {
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
   * Log debug messages if enabled
   */
  private log(message: string, data?: unknown): void {
    if (this.config.enableDebugLogging) {
      console.log(`[TimeTracker] ${message}`, data || '');
    }
  }
}

/**
 * Creates and returns a new TimeTracker instance with optional configuration and database overrides.
 *
 * @param config - Optional configuration overrides for the time tracker
 * @param database - Optional database instance, primarily for testing or custom storage
 * @returns A configured TimeTracker instance
 */
export function createTimeTracker(
  config: Partial<TimeTrackerConfig> = {},
  database?: WebTimeTrackerDB
): TimeTracker {
  return new TimeTracker(config, database);
}

// Export all types and components for external use
export * from './types';
export * from './state/FocusStateManager';
export * from './events/EventGenerator';
export * from './queue/EventQueue';
export * from './scheduler/CheckpointScheduler';
export * from './recovery/StartupRecovery';
export * from './messaging/InteractionDetector';
export * from './url/URLProcessor';
