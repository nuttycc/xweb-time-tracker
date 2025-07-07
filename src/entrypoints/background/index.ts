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
import { debounce } from 'es-toolkit';
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
import { LRUCache } from 'lru-cache';

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

/**
 * Maximum number of tabs to track in navigation cache.
 * Older entries will be evicted using LRU policy.
 */
const MAX_TRACKED_TABS = 100;

/**
 * Cleanup stale navigation entries older than this threshold.
 */
const STALE_ENTRY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Navigation tracking cache to prevent duplicate event handling.
 * Uses LRU policy and TTL to limit memory usage.
 */
const navigationTracker = new LRUCache<number, { url: string; timestamp: number }>({
  max: MAX_TRACKED_TABS,
  ttl: STALE_ENTRY_THRESHOLD_MS,
});

/**
 * Debounced navigation handlers for each tab to prevent processing rapid-fire navigation events.
 * Uses LRU policy and TTL to limit memory usage.
 */
const debouncedNavHandlers = new LRUCache<number, ReturnType<typeof debounce>>({
  max: MAX_TRACKED_TABS,
  ttl: STALE_ENTRY_THRESHOLD_MS,
});

/**
 * Debounce delay in milliseconds for navigation event processing.
 * This ensures that during rapid URL changes, only the final URL is processed.
 */
const NAVIGATION_DEBOUNCE_DELAY_MS = 1000;

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
 * The core navigation processing function that executes after debounce delay.
 * This function contains the actual logic for handling navigation events.
 *
 * @param tabId - The ID of the tab where navigation occurred
 * @param url - The final URL after debounce delay
 */
async function processNavigation(tabId: number, url: string): Promise<void> {
  const now = Date.now();
  const lastNav = navigationTracker.get(tabId);

  // Core URL change detection: Only process if URL has actually changed
  if (lastNav && lastNav.url === url) {
    logger.debug('URL unchanged after debounce, ignoring navigation', { tabId, url });
    return;
  }

  // This is a valid, new navigation event
  logger.info('Processing debounced navigation', { tabId, url, previousUrl: lastNav?.url });

  // Update tracker cache
  navigationTracker.set(tabId, { url, timestamp: now });

  // Forward the event to the core TimeTracker
  const eventData: BrowserEventData = {
    type: 'web-navigation-committed',
    tabId,
    url,
    timestamp: now,
  };

  await timeTracker.handleBrowserEvent(eventData);
}

/**
 * Unified navigation event scheduler that manages debounced processing.
 * All navigation events (onCommitted, onHistoryStateUpdated, onUpdated) go through this function.
 *
 * @param tabId - The ID of the tab where navigation occurred
 * @param url - The new URL
 * @param frameId - Optional frame ID for filtering main frame events
 * @param source - The event source (auto-inferred)
 */
function scheduleNavigationProcessing(tabId: number, url: string, frameId?: number, source?: string): void {
  // Only process events for the main frame (frameId === 0 or undefined for onUpdated)
  if (frameId !== undefined && frameId !== 0) {
    return;
  }

  // Filter protected URLs at entry point
  if (!shouldTrackUrl(url, { tabId, source: source || 'navigation-scheduler' })) {
    return;
  }

  logger.debug('Scheduling navigation processing', { tabId, url, frameId, source });

  // Get or create debounced handler for this tab
  let handler = debouncedNavHandlers.get(tabId);
  if (!handler) {
    // Create a new debounced handler specifically for this tab
    handler = debounce(processNavigation, NAVIGATION_DEBOUNCE_DELAY_MS);
    debouncedNavHandlers.set(tabId, handler);
    logger.debug('Created new debounced handler for tab', { tabId });
  }

  // Schedule the navigation processing (this will reset the debounce timer)
  handler(tabId, url);
}

/**
 * Sets up browser event listeners to capture tab, window, navigation, and runtime events, forwarding them to the time tracker.
 *
 * Uses a unified debounced navigation processing approach to handle traditional page loads, SPA navigations,
 * and tab updates. Ensures no duplicate navigation events and handles rapid URL changes gracefully.
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

  // Tab update events - unified navigation and audible state handling
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      scheduleNavigationProcessing(tabId, changeInfo.url, undefined, 'tabs.onUpdated');
    }

    // Handle audible state changes separately (non-navigation events)
    if (changeInfo.audible !== undefined) {
      // Filter protected URLs at entry point
      if (!shouldTrackUrl(tab.url, { tabId, source: 'tab-update-audible' })) {
        return;
      }

      const eventData: BrowserEventData = {
        type: 'tab-updated',
        tabId,
        windowId: tab.windowId,
        url: tab.url,
        changeInfo,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);
    }

    // Notify content script if page is complete
    if (changeInfo.status === 'complete' && tab.url) {
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

    // Clean up debounced handlers and tracking data for removed tabs
    const handler = debouncedNavHandlers.get(tabId);
    if (handler) {
      handler.cancel(); // Cancel any pending debounced navigation
      debouncedNavHandlers.delete(tabId);
    }
    navigationTracker.delete(tabId);
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

  // Traditional page navigation events (full page loads, refreshes)
  browser.webNavigation.onCommitted.addListener(async details => {
    scheduleNavigationProcessing(details.tabId, details.url, details.frameId, 'webNavigation.onCommitted');
  });

  // SPA navigation events (History API: pushState, replaceState)
  browser.webNavigation.onHistoryStateUpdated.addListener(async details => {
    scheduleNavigationProcessing(details.tabId, details.url, details.frameId, 'webNavigation.onHistoryStateUpdated');
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

// Optionally, periodically call .purgeStale() to force cleanup (not strictly needed, but can be added for safety):
setInterval(() => {
  navigationTracker.purgeStale();
  debouncedNavHandlers.purgeStale();
}, 10 * 60 * 1000); // every 10 minutes
