/**
 * Duplicate Event Prevention Integration Tests
 *
 * Tests the complete duplicate event prevention system combining:
 * 1. State-driven prevention (TabStateManager with sessionEnded flag)
 * 2. Queue-level intelligent deduplication (EventQueue with LRU cache)
 *
 * This integration test verifies that both mechanisms work together
 * to effectively prevent duplicate end events in real-world scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { type Browser } from 'wxt/browser';
import { TimeTracker, createTimeTracker, type BrowserEventData } from '../../../src/core/tracker';
import { createEventQueue } from '../../../src/core/tracker/queue/EventQueue';
import { createTestDatabase, cleanupTestDatabase } from '../../utils/database-test-helpers';
import type { WebTimeTrackerDB } from '../../../src/core/db/schemas';

// Test configuration optimized for duplicate prevention testing
const TEST_CONFIG = {
  enableDebugLogging: true,
  enableStartupRecovery: false, // Disable for cleaner testing
  enableCheckpoints: false, // Disable for cleaner testing
  eventQueue: {
    maxQueueSize: 50,
    maxWaitTime: 2000, // Shorter wait time for faster tests
    maxRetries: 2,
  },
};

// Mock browser APIs following the successful pattern
const mockTabs = {
  get: vi.fn(),
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

const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
  },
};

describe('Duplicate Event Prevention Integration', () => {
  let timeTracker: TimeTracker;
  let testDb: WebTimeTrackerDB;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup fake browser following successful pattern
    fakeBrowser.tabs.get = mockTabs.get;
    fakeBrowser.tabs.query = mockTabs.query;
    fakeBrowser.alarms.create = mockAlarms.create;
    fakeBrowser.alarms.clear = mockAlarms.clear;

    // Setup default mock return values
    mockTabs.query.mockResolvedValue([]);
    mockTabs.get.mockResolvedValue(null);

    // Initialize test database
    testDb = await createTestDatabase();

    // Create TimeTracker with test database
    timeTracker = createTimeTracker(TEST_CONFIG, testDb);

    await timeTracker.initialize();
    await timeTracker.start();
  });

  afterEach(async () => {
    // Cleanup
    if (timeTracker && timeTracker.getStartedStatus()) {
      await timeTracker.stop();
    }

    // Clean up test database
    if (testDb) {
      await cleanupTestDatabase(testDb);
    }
  });

  describe('State-driven Duplicate Prevention', () => {
    it('should prevent duplicate open_time_end events through sessionEnded flag', async () => {
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

      // Start a session by simulating tab navigation
      const navigationEvent: BrowserEventData = {
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://example.com',
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(navigationEvent);

      // Verify session started
      const tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState).toBeDefined();
      expect(tabState?.sessionEnded).toBe(false);

      // Try to generate multiple end events (should be prevented by state)
      await timeTracker['generateAndQueueOpenTimeEnd'](tabState!, Date.now());

      // Get updated tab state after first call
      const updatedTabState = timeTracker['tabStateManager'].getTabState(1);
      expect(updatedTabState?.sessionEnded).toBe(true);

      // Try to generate more end events (should be prevented by state)
      await timeTracker['generateAndQueueOpenTimeEnd'](updatedTabState!, Date.now());
      await timeTracker['generateAndQueueOpenTimeEnd'](updatedTabState!, Date.now());

      // Wait for events to be processed and flushed to database
      await new Promise(resolve => setTimeout(resolve, 3000)); // Longer wait for flush

      // Verify only one end event was generated despite multiple calls
      const events = await testDb.eventslog.toArray();
      const startEvents = events.filter(e => e.eventType === 'open_time_start');
      const endEvents = events.filter(e => e.eventType === 'open_time_end');

      expect(startEvents.length).toBe(1);
      expect(endEvents.length).toBe(1); // Only one end event despite 3 calls
    });

    it('should reset sessionEnded flag when starting new session', async () => {
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

      // Start first session
      await timeTracker.handleBrowserEvent({
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://example.com',
        timestamp: Date.now(),
      });

      const tabState = timeTracker['tabStateManager'].getTabState(1);
      expect(tabState?.sessionEnded).toBe(false);

      // End the session
      await timeTracker['generateAndQueueOpenTimeEnd'](tabState!, Date.now());

      // Get updated tab state after ending session
      const endedTabState = timeTracker['tabStateManager'].getTabState(1);
      expect(endedTabState?.sessionEnded).toBe(true);

      // Start new session (navigation to new URL)
      mockTab.url = 'https://newsite.com';
      mockTabs.get.mockResolvedValue(mockTab);

      await timeTracker.handleBrowserEvent({
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://newsite.com',
        timestamp: Date.now() + 1000,
      });

      // Verify sessionEnded flag is reset for new session
      const newTabState = timeTracker['tabStateManager'].getTabState(1);
      expect(newTabState?.sessionEnded).toBe(false);
      expect(newTabState?.url).toBe('https://newsite.com');
    });
  });

  describe('Queue-level Intelligent Deduplication', () => {
    it('should filter duplicate events at queue level', async () => {
      // Create a custom EventQueue with deduplication enabled
      const deduplicationQueue = createEventQueue(testDb, {
        maxQueueSize: 100,
        maxWaitTime: 5000,
        maxDeduplicationCacheSize: 100, // Must be >= 100
        deduplicationTimeWindow: 30000, // 30 seconds
      });

      const visitId = crypto.randomUUID();
      const baseTimestamp = Date.now();

      // Create multiple identical events
      const duplicateEvents = Array(5)
        .fill(null)
        .map(() => ({
          timestamp: baseTimestamp,
          eventType: 'open_time_end' as const,
          tabId: 1,
          url: 'https://example.com',
          visitId,
          activityId: null,
          isProcessed: 0 as const,
        }));

      // Enqueue all events
      for (const event of duplicateEvents) {
        await deduplicationQueue.enqueue(event);
      }

      // Verify deduplication worked
      const stats = deduplicationQueue.getStats();
      const deduplicationStats = deduplicationQueue.getDeduplicationStats();

      expect(stats.queueSize).toBe(1); // Only one event should remain
      expect(deduplicationStats.duplicatesFiltered).toBe(4); // 4 duplicates filtered
      expect(deduplicationStats.filterRate).toBe(80); // 4/5 = 80%
    });
  });

  describe('Combined Prevention Mechanisms', () => {
    it('should handle rapid successive tab removal events', async () => {
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

      // Start session
      await timeTracker.handleBrowserEvent({
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://example.com',
        timestamp: Date.now(),
      });

      // Simulate rapid successive tab removal events (common browser behavior)
      const removalEvents = Array(3)
        .fill(null)
        .map((_, i) => ({
          type: 'tab-removed' as const,
          tabId: 1,
          windowId: 1,
          timestamp: Date.now() + i * 10, // 10ms apart
        }));

      // Process all removal events rapidly
      for (const event of removalEvents) {
        await timeTracker.handleBrowserEvent(event);
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify only appropriate events were generated
      const events = await testDb.eventslog.toArray();
      const endEvents = events.filter(e => e.eventType === 'open_time_end');

      // Should have only one end event despite multiple removal events
      expect(endEvents.length).toBeLessThanOrEqual(1);
    });
  });
});
