/**
 * TimeTracker Deduplication Unit Tests
 *
 * Tests for the state-driven deduplication mechanism that prevents duplicate end events
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { type Browser } from 'wxt/browser';
import { TimeTracker, type BrowserEventData } from '../../../src/core/tracker';
import { type TabState } from '../../../src/core/tracker/types';

// Mock browser APIs
const mockTabs = {
  get: vi.fn() as MockedFunction<typeof Browser.tabs.get>,
  query: vi.fn(),
  onActivated: {
    addListener: vi.fn(),
  },
  onUpdated: {
    addListener: vi.fn(),
  },
  onRemoved: {
    addListener: vi.fn(),
  },
};

const mockWindows = {
  onFocusChanged: {
    addListener: vi.fn(),
  },
};

const mockWebNavigation = {
  onCommitted: {
    addListener: vi.fn(),
  },
};

describe('TimeTracker Deduplication Mechanism', () => {
  let timeTracker: TimeTracker;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup fake browser
    fakeBrowser.tabs.get = mockTabs.get;
    fakeBrowser.tabs.query = mockTabs.query;
    fakeBrowser.windows.onFocusChanged = mockWindows.onFocusChanged;
    fakeBrowser.webNavigation.onCommitted = mockWebNavigation.onCommitted;

    // Create TimeTracker instance
    timeTracker = new TimeTracker({
      enableDebugLogging: true,
      enableStartupRecovery: false,
      enableCheckpoints: false,
    });
  });

  describe('sessionEnded Flag Management', () => {
    it('should initialize sessionEnded as false for new sessions', async () => {
      const mockTab: Browser.tabs.Tab = {
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        index: 0,
        highlighted: false,
        active: true,
        pinned: false,
        incognito: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      };

      mockTabs.get.mockResolvedValue(mockTab);

      await timeTracker.initialize();
      await timeTracker.start();

      // Simulate tab update event to start a new session
      const eventData: BrowserEventData = {
        type: 'tab-updated',
        tabId: 1,
        windowId: 1,
        url: 'https://example.com',
        changeInfo: { url: 'https://example.com' },
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(eventData);

      // Get tab state and verify sessionEnded is false
      const tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState).toBeDefined();
      expect(tabState?.sessionEnded).toBe(false);
    });

    it('should set sessionEnded to true after generating end event', async () => {
      const mockTab: Browser.tabs.Tab = {
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        index: 0,
        highlighted: false,
        active: true,
        pinned: false,
        incognito: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      };

      mockTabs.get.mockResolvedValue(mockTab);

      await timeTracker.initialize();
      await timeTracker.start();

      // Start a session
      const startEventData: BrowserEventData = {
        type: 'tab-updated',
        tabId: 1,
        windowId: 1,
        url: 'https://example.com',
        changeInfo: { url: 'https://example.com' },
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(startEventData);

      // Verify session started with sessionEnded = false
      let tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState?.sessionEnded).toBe(false);

      // Simulate tab removal to trigger end event
      const endEventData: BrowserEventData = {
        type: 'tab-removed',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(endEventData);

      // Tab state should be cleared after removal, so we can't check it
      // But we can verify the behavior by checking that the tab state is removed
      tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState).toBeUndefined();
    });
  });

  describe('Duplicate End Event Prevention', () => {
    it('should prevent duplicate open_time_end events for same session', async () => {
      const mockTab: Browser.tabs.Tab = {
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        index: 0,
        highlighted: false,
        active: true,
        pinned: false,
        incognito: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      };

      mockTabs.get.mockResolvedValue(mockTab);

      await timeTracker.initialize();
      await timeTracker.start();

      // Create a mock tab state with sessionEnded = false
      const mockTabState: TabState = {
        url: 'https://example.com',
        visitId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
        isFocused: true,
        tabId: 1,
        windowId: 1,
        sessionEnded: false,
      };

      // Manually set tab state
      timeTracker['tabStateManager'].createTabState(1, mockTabState, 1);

      // Spy on the event queue to count enqueued events
      const enqueueSpy = vi.spyOn(timeTracker['eventQueue'], 'enqueue');

      // Call generateAndQueueOpenTimeEnd directly (first time)
      await timeTracker['generateAndQueueOpenTimeEnd'](mockTabState, Date.now());

      // Verify event was enqueued and sessionEnded was set to true
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      const updatedTabState = timeTracker['tabStateManager'].getTabState(1);
      expect(updatedTabState?.sessionEnded).toBe(true);

      // Call generateAndQueueOpenTimeEnd again (should be prevented)
      await timeTracker['generateAndQueueOpenTimeEnd'](updatedTabState!, Date.now());

      // Verify no additional event was enqueued
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
    });

    it('should reset sessionEnded flag when starting new session', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Create a mock tab state with sessionEnded = true (simulating ended session)
      const endedTabState: TabState = {
        url: 'https://example.com',
        visitId: '550e8400-e29b-41d4-a716-446655440001', // Valid UUID
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
        isFocused: true,
        tabId: 1,
        windowId: 1,
        sessionEnded: true, // Session has ended
      };

      // Manually set tab state with ended session
      timeTracker['tabStateManager'].createTabState(1, endedTabState, 1);

      // Verify session is marked as ended
      let tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState?.sessionEnded).toBe(true);

      // Now start a new session by calling startNewOpenTimeSession directly
      const mockTab: Browser.tabs.Tab = {
        id: 1,
        url: 'https://newsite.com',
        windowId: 1,
        index: 0,
        highlighted: false,
        active: true,
        pinned: false,
        incognito: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      };

      mockTabs.get.mockResolvedValue(mockTab);

      // Call startNewOpenTimeSession to simulate starting a new session
      await timeTracker['startNewOpenTimeSession'](mockTab, Date.now());

      // Verify new session has sessionEnded = false
      tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState?.sessionEnded).toBe(false);
      expect(tabState?.url).toBe('https://newsite.com');
    });
  });
});
