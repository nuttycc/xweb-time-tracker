/**
 * Background Script for WebTime Tracker
 *
 * Integrates the TimeTracker system with browser events and manages the complete
 * time tracking lifecycle. Sets up all necessary browser event listeners and
 * handles communication with content scripts.
 *
 */

import { browser, defineBackground } from '#imports';
import { defineExtensionMessaging } from '@webext-core/messaging';
import { createTimeTracker, type BrowserEventData, type InteractionMessage } from '@/core/tracker';
import { isProtectedUrl } from '@/core/tracker/utils/URLProcessor';
import { createLogger } from '@/utils/logger';
import {
  AggregationEngine,
  AggregationScheduler,
  DataPruner,
  AggregationService,
} from '@/core/aggregator';
import { EventsLogRepository, AggregatedStatsRepository } from '@/core/db/repositories';
import { connectionManager } from '@/core/db/connection/manager';
import type {
  TabDataResponse,
  TabDataErrorResponse,
  PopupDebugProtocolMap,
  ManualAggregationResponse,
} from '@/types/messaging';
import { databaseService } from '@/core/db/services/database.service';

// Define messaging protocol for communication with content scripts and popup
interface TrackerProtocolMap extends PopupDebugProtocolMap {
  /** Content script sends interaction data to background script */
  'interaction-detected': (data: InteractionMessage) => Promise<void>;

  /** Content script sends idle notification to background script */
  'tab-is-idle': (data: { tabId: number; timestamp: number }) => Promise<void>;

  /** Background script sends page status updates to content script */
  'page-status-update': (data: { isTracking: boolean; tabId: number }) => Promise<void>;

  /** Content script requests current tracking status */
  'get-tracking-status': () => Promise<{ isTracking: boolean; tabId: number; isAudible: boolean }>;

  /** Background script notifies content script of focus changes */
  'focus-changed': (data: { isFocused: boolean; tabId: number }) => Promise<void>;

  /** Background script notifies content script of audible state changes */
  'audible-state-changed': (data: { tabId: number; isAudible: boolean }) => Promise<void>;
}

// Initialize messaging
const { sendMessage, onMessage } = defineExtensionMessaging<TrackerProtocolMap>();

// Initialize logger
const logger = createLogger('Background');

// Initialize time tracker
const timeTracker = createTimeTracker({
  enableDebugLogging: true, // Enable for development
  enableStartupRecovery: true,
  enableCheckpoints: true,
});

// Global reference to aggregation scheduler for manual triggering
let aggregationScheduler: AggregationScheduler | null = null;

export default defineBackground(() => {
  logger.info('WebTime Tracker starting...');

  // Set up browser event listeners and messaging handlers synchronously
  // These can be attached before async initialization completes
  setupBrowserEventListeners();
  setupMessagingHandlers();
  setupIdleStateListener();

  // Use IIAFE to handle async initialization without making main function async
  (async () => {
    try {
      // Initialize the time tracker
      const initResult = await timeTracker.initialize();

      if (!initResult.success) {
        logger.error('Failed to initialize time tracker:', initResult.error);
        return;
      }

      logger.info('Time tracker initialized successfully:', initResult.stats);

      // Start the time tracker
      const startSuccess = await timeTracker.start();

      if (!startSuccess) {
        logger.error('Failed to start time tracker');
        return;
      }

      logger.info('Time tracker started successfully');

      // Set up audible state change callback
      timeTracker.setAudibleStateChangeCallback((tabId: number, isAudible: boolean) => {
        // Send audible state change message to content script
        sendMessage('audible-state-changed', { tabId, isAudible }, tabId).catch(error => {
          // Content script might not be ready, this is not critical
          logger.debug('Failed to send audible state change message:', { tabId, isAudible, error });
        });
      });

      // Initialize and start aggregation system
      try {
        const db = await connectionManager.getDatabase();

        // Initialize aggregation system components
        const eventsLogRepository = new EventsLogRepository(db);
        const aggregatedStatsRepository = new AggregatedStatsRepository(db);
        const aggregationEngine = new AggregationEngine(
          eventsLogRepository,
          aggregatedStatsRepository
        );
        const dataPruner = new DataPruner(eventsLogRepository);
        aggregationScheduler = new AggregationScheduler(aggregationEngine, dataPruner);
        const aggregationService = new AggregationService(aggregationScheduler);

        // Start the aggregation service
        await aggregationService.start();
        logger.info('Aggregation service started successfully');

        // Expose debugging utilities in development mode
        if (import.meta.env.DEV) {
          // Make aggregation scheduler available for manual triggering in dev console
          interface WebtimeDebugUtils {
            triggerAggregation: () => Promise<void>;
            getAggregationStatus: () => {
              engineStats: string;
              schedulerRunning: boolean;
              isDevelopmentMode: boolean;
            };
          }

          (
            globalThis as typeof globalThis & { __webtimeDebug?: WebtimeDebugUtils }
          ).__webtimeDebug = {
            triggerAggregation: () => aggregationScheduler?.runNow() || Promise.resolve(),
            getAggregationStatus: () => ({
              engineStats: 'Use aggregationEngine methods for detailed stats',
              schedulerRunning: true,
              isDevelopmentMode: true,
            }),
          };
          logger.info('Development debug utilities available at globalThis.__webtimeDebug');
        }
      } catch (error) {
        logger.error('Failed to initialize aggregation service:', error);
      }

      logger.info('WebTime Tracker ready');
    } catch (error) {
      logger.error('Error during initialization:', error);
    }
  })();
});

/**
 * Checks if a URL should be tracked and logs the filtering decision
 *
 * @param url - The URL to check
 * @param context - Context information for logging
 * @returns True if the URL should be tracked, false if it should be filtered
 */
function shouldTrackUrl(
  url: string | undefined,
  context: { tabId?: number; source: string }
): url is string {
  if (!url) {
    return false;
  }

  if (isProtectedUrl(url)) {
    logger.debug('Filtering protected URL at browser event level', {
      url,
      tabId: context.tabId,
      source: context.source,
    });
    return false;
  }

  return true;
}

/**
 * Sets up browser event listeners to capture tab, window, navigation, and runtime events, forwarding them to the time tracker.
 *
 * Registers handlers for tab activation, updates (including URL and audible state changes), removal, window focus changes, main frame navigation commits, and runtime suspension. Notifies content scripts when a page load completes and ensures the time tracker is stopped gracefully during runtime suspension.
 */
function setupBrowserEventListeners(): void {
  // Tab activation events
  browser.tabs.onActivated.addListener(async activeInfo => {
    // Get tab info to check URL before processing
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);

      const eventData: BrowserEventData = {
        type: 'tab-activated',
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        url: tab.url,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);
    } catch (error) {
      logger.error('Failed to get tab info for activation', { tabId: activeInfo.tabId, error });
    }
  });

  // Tab update events
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check if any trackable changes occurred
    const hasUrlChange = changeInfo.url || changeInfo.status === 'complete';
    const hasAudibleChange = changeInfo.audible !== undefined;

    if (hasUrlChange || hasAudibleChange) {
      const currentUrl = changeInfo.url || tab.url;

      // Filter protected URLs at entry point
      if (!shouldTrackUrl(currentUrl, { tabId, source: 'tab-update' })) {
        return;
      }

      const eventData: BrowserEventData = {
        type: 'tab-updated',
        tabId,
        windowId: tab.windowId,
        url: currentUrl,
        changeInfo,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);

      // Notify content script if page is complete
      if (changeInfo.status === 'complete' && currentUrl) {
        try {
          await sendMessage(
            'page-status-update',
            {
              isTracking: true,
              tabId,
            },
            tabId
          );
        } catch {
          // Content script might not be ready yet, ignore
        }
      }
    }
  });

  // Tab removal events
  browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const eventData: BrowserEventData = {
      type: 'tab-removed',
      tabId,
      windowId: removeInfo.windowId,
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);
  });

  // Window focus change events
  browser.windows.onFocusChanged.addListener(async windowId => {
    const eventData: BrowserEventData = {
      type: 'window-focus-changed',
      windowId,
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);
  });

  // Web navigation events (for SPA detection)
  browser.webNavigation.onCommitted.addListener(async details => {
    // Only handle main frame navigation
    if (details.frameId === 0) {
      // Filter protected URLs at entry point
      if (!shouldTrackUrl(details.url, { tabId: details.tabId, source: 'web-navigation' })) {
        return;
      }

      const eventData: BrowserEventData = {
        type: 'web-navigation-committed',
        tabId: details.tabId,
        url: details.url,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);
    }
  });

  // Runtime suspend events (for graceful shutdown)
  browser.runtime.onSuspend.addListener(async () => {
    logger.info('Runtime suspending...');

    const eventData: BrowserEventData = {
      type: 'runtime-suspend',
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);

    // Stop the time tracker gracefully
    await timeTracker.stop();

    logger.info('Time tracker stopped for suspension');
  });
}

/**
 * Registers message handlers for content script communication, enabling forwarding of user interaction events to the time tracker and responding to tracking status queries.
 *
 * Forwards user interaction data from content scripts to the time tracker and replies to tracking status requests with the current tracking state and sender tab ID.
 */
function setupMessagingHandlers(): void {
  // Handle interaction messages from content scripts
  onMessage('interaction-detected', async message => {
    const { data, sender } = message;

    if (!sender.tab?.id) {
      logger.warn('Received interaction without tab ID');
      return;
    }

    const eventData: BrowserEventData = {
      type: 'user-interaction',
      tabId: sender.tab.id,
      windowId: sender.tab.windowId,
      interaction: data,
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);
  });

  // Handle tracking status requests
  onMessage('get-tracking-status', async message => {
    const { sender } = message;
    const status = timeTracker.getStatus();
    const tabId = sender.tab?.id || 0;

    // Get audible state from tab state manager
    const tabState = timeTracker.getTabState(tabId);
    const isAudible = tabState?.isAudible || false;

    return {
      isTracking: status.isStarted,
      tabId,
      isAudible,
    };
  });

  // Handle idle notifications from content scripts
  onMessage('tab-is-idle', async message => {
    const { data, sender } = message;

    if (!sender.tab?.id) {
      logger.warn('Received idle notification without tab ID');
      return;
    }

    logger.debug('Received idle notification', {
      tabId: sender.tab.id,
      timestamp: data.timestamp,
    });

    // End active session due to idle timeout
    await timeTracker.endActiveSessionDueToIdle(sender.tab.id, data.timestamp);
  });

  // Handle popup debug data requests
  onMessage('getTabDataRequest', async message => {
    const { data } = message;

    try {
      logger.debug('Received tab data request from popup', { tabId: data.tabId });

      // Get tab information
      const tab = await browser.tabs.get(data.tabId);
      if (!tab.url) {
        return {
          error: 'Tab URL not available',
          code: 'TAB_NOT_FOUND',
        } as TabDataErrorResponse;
      }

      // Extract hostname from URL
      const url = new URL(tab.url);
      const hostname = url.hostname;

      // Get database service instance
      const dbService = await databaseService.getInstance();

      // Query all recent events for debugging purposes
      // We'll get both processed and unprocessed events
      const eventsLogRepo = new EventsLogRepository(await connectionManager.getDatabase());
      const allRecentEvents = await eventsLogRepo.findAll();

      // Filter events for this specific tab ID, sort by timestamp desc, and limit to 200 for performance
      const events = allRecentEvents
        .filter(event => event.tabId === data.tabId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200);

      // Query aggregated stats for this hostname
      const stats = await dbService.getStatsByHostname(hostname, { limit: 10 });

      const response: TabDataResponse = {
        events,
        stats,
        tabInfo: {
          id: tab.id!,
          url: tab.url,
          hostname,
          title: tab.title,
        },
      };

      logger.debug('Returning tab data to popup', {
        eventsCount: events.length,
        statsCount: stats.length,
        hostname,
      });

      return response;
    } catch (error) {
      logger.error('Failed to get tab data for popup:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'DATABASE_ERROR',
      } as TabDataErrorResponse;
    }
  });

  // Handle manual aggregation requests
  onMessage('triggerManualAggregation', async message => {
    const { data } = message;

    try {
      logger.info('Manual aggregation triggered from popup', { force: data.force });

      if (!aggregationScheduler) {
        return {
          success: false,
          error: 'Aggregation scheduler not initialized',
        } as ManualAggregationResponse;
      }

      const startTime = Date.now();
      await aggregationScheduler.runNow();
      const duration = Date.now() - startTime;

      logger.info('Manual aggregation completed', { duration: `${duration}ms` });

      return {
        success: true,
        duration,
        processedEvents: undefined, // We don't have access to this info from scheduler
      } as ManualAggregationResponse;
    } catch (error) {
      logger.error('Failed to run manual aggregation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as ManualAggregationResponse;
    }
  });
}

/**
 * Sets up chrome.idle API listener to detect system-wide idle state changes.
 *
 * When the system enters idle or locked state, ends active time sessions for
 * the currently focused tab to ensure accurate time tracking.
 */
function setupIdleStateListener(): void {
  // Set idle detection interval to 60 seconds
  browser.idle.setDetectionInterval(60);

  // Listen for idle state changes
  browser.idle.onStateChanged.addListener(async (newState: 'active' | 'idle' | 'locked') => {
    logger.debug('System idle state changed', { newState });

    // Only handle idle and locked states (not active)
    if (newState === 'idle' || newState === 'locked') {
      try {
        // Get the currently focused window and tab
        const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
        const focusedWindow = windows.find(window => window.focused);

        if (focusedWindow?.tabs) {
          const activeTab = focusedWindow.tabs.find(tab => tab.active);

          if (activeTab?.id) {
            logger.info('System went idle/locked, ending active session', {
              state: newState,
              tabId: activeTab.id,
              url: activeTab.url,
            });

            // End active session due to system idle
            await timeTracker.endActiveSessionDueToIdle(activeTab.id, Date.now());
          }
        }
      } catch (error) {
        logger.error('Failed to handle system idle state change:', error);
      }
    }
  });

  logger.info('System idle state listener set up');
}
