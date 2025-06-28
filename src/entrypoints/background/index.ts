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

// Initialize time tracker
const timeTracker = createTimeTracker({
  enableDebugLogging: true, // Enable for development
  enableStartupRecovery: true,
  enableCheckpoints: true,
});

export default defineBackground(async () => {
  console.log('[Background] WebTime Tracker starting...');

  try {
    // Initialize the time tracker
    const initResult = await timeTracker.initialize();

    if (!initResult.success) {
      console.error('[Background] Failed to initialize time tracker:', initResult.error);
      return;
    }

    console.log('[Background] Time tracker initialized successfully:', initResult.stats);

    // Start the time tracker
    const startSuccess = await timeTracker.start();

    if (!startSuccess) {
      console.error('[Background] Failed to start time tracker');
      return;
    }

    console.log('[Background] Time tracker started successfully');

    // Set up browser event listeners
    setupBrowserEventListeners();

    // Set up messaging handlers
    setupMessagingHandlers();

    console.log('[Background] WebTime Tracker ready');
  } catch (error) {
    console.error('[Background] Error during initialization:', error);
  }
});

/**
 * Sets up listeners for browser events and forwards relevant event data to the time tracker.
 *
 * Registers handlers for tab activation, tab updates, tab removal, window focus changes, main frame navigation commits, and runtime suspension. Forwards structured event data to the time tracker and notifies content scripts of page status updates when appropriate. Handles graceful shutdown of the time tracker on runtime suspension.
 */
function setupBrowserEventListeners(): void {
  // Tab activation events
  browser.tabs.onActivated.addListener(async activeInfo => {
    const eventData: BrowserEventData = {
      type: 'tab-activated',
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);
  });

  // Tab update events
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only handle URL changes and completion
    if (changeInfo.url || changeInfo.status === 'complete') {
      const eventData: BrowserEventData = {
        type: 'tab-updated',
        tabId,
        windowId: tab.windowId,
        url: changeInfo.url || tab.url,
        changeInfo,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);

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
    console.log('[Background] Runtime suspending...');

    const eventData: BrowserEventData = {
      type: 'runtime-suspend',
      timestamp: Date.now(),
    };

    await timeTracker.handleBrowserEvent(eventData);

    // Stop the time tracker gracefully
    await timeTracker.stop();

    console.log('[Background] Time tracker stopped for suspension');
  });
}

/**
 * Sets up message handlers for communication with content scripts, enabling user interaction event forwarding and tracking status queries.
 *
 * Forwards user interaction events received from content scripts to the time tracker, and responds to tracking status requests with the current tracking state and sender tab ID.
 */
function setupMessagingHandlers(): void {
  // Handle interaction messages from content scripts
  onMessage('interaction-detected', async message => {
    const { data, sender } = message;

    if (!sender.tab?.id) {
      console.warn('[Background] Received interaction without tab ID');
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
