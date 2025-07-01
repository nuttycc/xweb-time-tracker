/**
 * Background Script for WebTime Tracker
 *
 * Integrates the TimeTracker system with browser events and manages the complete
 * time tracking lifecycle. Sets up all necessary browser event listeners and
 * handles communication with content scripts.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { browser, defineBackground } from '#imports';
import { defineExtensionMessaging } from '@webext-core/messaging';
import {
  createTimeTracker,
  type BrowserEventData,
  type InteractionMessage,
} from '../../core/tracker';
import { isProtectedUrl } from '../../core/tracker/url/URLProcessor';
import { createLogger } from '@/utils/logger';

// Define messaging protocol for communication with content scripts
interface TrackerProtocolMap {
  /** Content script sends interaction data to background script */
  'interaction-detected': (data: InteractionMessage) => Promise<void>;

  /** Background script sends page status updates to content script */
  'page-status-update': (data: { isTracking: boolean; tabId: number }) => Promise<void>;

  /** Content script requests current tracking status */
  'get-tracking-status': () => Promise<{ isTracking: boolean; tabId: number }>;

  /** Background script notifies content script of focus changes */
  'focus-changed': (data: { isFocused: boolean; tabId: number }) => Promise<void>;
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

export default defineBackground(async () => {
  logger.info('WebTime Tracker starting...');

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

    // Set up browser event listeners
    setupBrowserEventListeners();

    // Set up messaging handlers
    setupMessagingHandlers();

    logger.info('WebTime Tracker ready');
  } catch (error) {
    logger.error('Error during initialization:', error);
  }
});

/**
 * Checks if a URL should be tracked and logs the filtering decision
 * 
 * @param url - The URL to check
 * @param context - Context information for logging
 * @returns True if the URL should be tracked, false if it should be filtered
 */
function shouldTrackUrl(url: string | undefined, context: { tabId?: number; source: string }): url is string {
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

    return {
      isTracking: status.isStarted,
      tabId: sender.tab?.id || 0,
    };
  });
}
