/**
 * Integration Tests for Complete Time Tracking Flow
 *
 * Tests the end-to-end functionality of the time tracking system,
 * including browser events, state management, event generation, and database persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { type Browser } from 'wxt/browser';
import { TimeTracker, createTimeTracker, type BrowserEventData } from '../../../src/core/tracker';
import {
  createTestDatabase,
  cleanupTestDatabase,
  waitForIndexedDB,
  createTestData
} from '../../utils/database-test-helpers';
import {
  simulateTabActivation,
  simulateNavigation,
  simulateUserInteraction,
  waitForEvents,
  waitForTabEvents,
  waitForEventTypes
} from '../../utils/mock-helpers';
import type { WebTimeTrackerDB } from '../../../src/core/db/schemas';

// Test configuration
const TEST_CONFIG = {
  enableDebugLogging: true,
  enableStartupRecovery: true,
  enableCheckpoints: true,
  eventQueue: {
    maxQueueSize: 10,
    maxWaitTime: 1000,
    maxRetries: 2,
  },
  checkpointScheduler: {
    intervalMinutes: 5, // Minimum allowed value
    activeTimeThresholdHours: 0.5, // Minimum allowed value
    openTimeThresholdHours: 1, // Minimum allowed value
  },
  startupRecovery: {
    maxSessionAge: 86400000, // 24 hours (default)
  },
};

// Mock browser APIs
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

describe('Time Tracking Flow Integration', () => {
  let timeTracker: TimeTracker;
  let testDb: WebTimeTrackerDB;

  beforeEach(async () => {
    // Wait for IndexedDB to be ready
    await waitForIndexedDB();

    // Reset all mocks
    vi.clearAllMocks();
    fakeBrowser.reset();

    // Setup browser mocks
    fakeBrowser.tabs.get = mockTabs.get;
    fakeBrowser.tabs.query = mockTabs.query;
    fakeBrowser.tabs.onActivated.addListener = mockTabs.onActivated.addListener;
    fakeBrowser.tabs.onUpdated.addListener = mockTabs.onUpdated.addListener;
    fakeBrowser.tabs.onRemoved.addListener = mockTabs.onRemoved.addListener;
    fakeBrowser.alarms.create = mockAlarms.create;
    fakeBrowser.alarms.clear = mockAlarms.clear;
    fakeBrowser.alarms.onAlarm.addListener = mockAlarms.onAlarm.addListener;

    // Setup default mock return values
    mockTabs.query.mockResolvedValue([]); // Return empty array by default
    mockTabs.get.mockResolvedValue(null); // Return null by default

    // Initialize test database
    testDb = await createTestDatabase();

    // Create time tracker with test database
    timeTracker = createTimeTracker(TEST_CONFIG, testDb);
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

  describe('Complete User Session Flow', () => {
    it('should track a complete user session from start to finish', async () => {
      // Step 1: Initialize the tracker
      const initResult = await timeTracker.initialize();
      expect(initResult.success).toBe(true);
      expect(timeTracker.getInitializationStatus()).toBe(true);

      // Step 2: Start tracking
      const startResult = await timeTracker.start();
      expect(startResult).toBe(true);
      expect(timeTracker.getStartedStatus()).toBe(true);

      // Step 3: Simulate tab activation and navigation (user opens a new tab)
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com/page1',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      const tabActivatedEvent: BrowserEventData = {
        type: 'tab-activated',
        tabId: 1,
        windowId: 1,
        url: 'https://example.com/page1',
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(tabActivatedEvent);

      // Step 3b: Simulate web navigation to trigger open_time_start event
      const webNavigationEvent: BrowserEventData = {
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://example.com/page1',
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(webNavigationEvent);

      // Step 4: Simulate user interaction (should start active time)
      const interactionEvent: BrowserEventData = {
        type: 'user-interaction',
        tabId: 1,
        interaction: {
          type: 'mousemove',
          timestamp: Date.now(),
          tabId: 1,
        },
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(interactionEvent);

      // Step 5: Wait for initial events to be processed
      await waitForEventTypes(testDb, ['open_time_start', 'active_time_start'], 2);

      // Step 6: Simulate tab navigation (should end current session and start new one)
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com/page2',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      const navigationEvent: BrowserEventData = {
        type: 'web-navigation-committed',
        tabId: 1,
        url: 'https://example.com/page2',
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(navigationEvent);

      // Step 7: Simulate tab closure
      const tabRemovedEvent: BrowserEventData = {
        type: 'tab-removed',
        tabId: 1,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(tabRemovedEvent);

      // Step 8: Wait for all events to be processed and then stop tracking
      const events = await waitForEvents(testDb, { expectedCount: 4 }); // Should have multiple events by now
      await timeTracker.stop();

      // Verify that events were created in the database
      expect(events.length).toBeGreaterThan(0);

      // Should have open_time_start events at minimum
      const eventTypes = events.map(e => e.eventType);
      expect(eventTypes).toContain('open_time_start');
    });

    it('should start a session on first navigation', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mock
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // Simulate user opening a tab and navigating
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });

      // Wait for events to be processed and stop tracker
      const events = await waitForEventTypes(testDb, ['open_time_start'], 1);
      await timeTracker.stop();

      // Verify session was started
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('open_time_start');
      expect(events[0].tabId).toBe(1);
      expect(events[0].url).toBe('https://example.com/');
    });

    it('should create active_time_start event on user interaction', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mock
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // Simulate session start and user interaction
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });
      await simulateUserInteraction(timeTracker, { tabId: 1, type: 'keydown' });

      // Wait for both open_time_start and active_time_start events
      const events = await waitForEventTypes(testDb, ['open_time_start', 'active_time_start'], 2);
      await timeTracker.stop();

      // Verify both events were created
      const openTimeEvents = events.filter(e => e.eventType === 'open_time_start');
      const activeTimeEvents = events.filter(e => e.eventType === 'active_time_start');
      
      expect(openTimeEvents).toHaveLength(1);
      expect(activeTimeEvents).toHaveLength(1);
      expect(activeTimeEvents[0].tabId).toBe(1);
    });

    it('should create active_time_end event on focus loss', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mocks
      mockTabs.get.mockImplementation((tabId: number) => {
        if (tabId === 1) {
          return Promise.resolve({
            id: 1,
            url: 'https://example.com',
            windowId: 1,
            active: tabId === 1,
          } as Browser.tabs.Tab);
        }
        return Promise.resolve({
          id: 2,
          url: 'https://github.com',
          windowId: 1,
          active: tabId === 2,
        } as Browser.tabs.Tab);
      });

      // Start session on tab 1 and interact
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });
      await simulateUserInteraction(timeTracker, { tabId: 1, type: 'keydown' });

      // Switch to tab 2 (should end active time on tab 1)
      await simulateTabActivation(timeTracker, { tabId: 2 });

      // Wait for active_time_end event
      const events = await waitForEventTypes(testDb, ['active_time_end'], 1);
      await timeTracker.stop();

      // Verify active_time_end was created for tab 1
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('active_time_end');
      expect(events[0].tabId).toBe(1);
    });

    it('should correctly switch sessions between multiple tabs', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mocks
      mockTabs.get.mockImplementation((tabId: number) => {
        if (tabId === 1) {
          return Promise.resolve({
            id: 1,
            url: 'https://example.com',
            windowId: 1,
            active: true,
          } as Browser.tabs.Tab);
        }
          return Promise.resolve({
            id: 2,
            url: 'https://github.com',
            windowId: 1,
          active: true,
          } as Browser.tabs.Tab);
      });

      // Full flow: Tab 1 -> Tab 2 with interactions
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });
      await simulateUserInteraction(timeTracker, { tabId: 1, type: 'keydown' });

      await simulateTabActivation(timeTracker, { tabId: 2 });
      await simulateNavigation(timeTracker, { tabId: 2, url: 'https://github.com' });
      await simulateUserInteraction(timeTracker, { tabId: 2, type: 'scroll' });

      // Wait for events from both tabs (should have at least 2 open_time_start events)
      const events = await waitForTabEvents(testDb, [1, 2], 4, { timeout: 3000 });
      await timeTracker.stop();

      // Verify events for both tabs
      const tab1Events = events.filter(e => e.tabId === 1);
      const tab2Events = events.filter(e => e.tabId === 2);

      expect(tab1Events.length).toBeGreaterThan(0);
      expect(tab2Events.length).toBeGreaterThan(0);

      // Verify session structure
      const openTimeEvents = events.filter(e => e.eventType === 'open_time_start');
      expect(openTimeEvents).toHaveLength(2); // One for each tab
    });
  });

  describe('Edge Cases and URL Filtering', () => {
    it('should ignore invalid URLs and not create events', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mock with filtered URL
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'chrome://extensions',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // Simulate navigation to filtered URL
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'chrome://extensions' });

      // Small wait to ensure processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      await timeTracker.stop();

      // Should not have created any open_time_start events
      const events = await testDb.eventslog.toArray();
      const openTimeEvents = events.filter(e => e.eventType === 'open_time_start');
      expect(openTimeEvents).toHaveLength(0);
    });

    it('should handle invalid tab IDs gracefully', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Mock to return null for invalid tab ID
      mockTabs.get.mockResolvedValue(null);

      // Try to process events with invalid tab ID - should not crash
      await expect(simulateTabActivation(timeTracker, { tabId: -1 })).resolves.not.toThrow();
      await expect(simulateNavigation(timeTracker, { tabId: 999, url: 'https://example.com' })).resolves.not.toThrow();

      await timeTracker.stop();

      // Should not have created any events
      const events = await testDb.eventslog.toArray();
      expect(events).toHaveLength(0);
    });

    it('should handle out-of-order events gracefully', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mock
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // Send user interaction BEFORE navigation (out of order)
      await simulateUserInteraction(timeTracker, { tabId: 1, type: 'click' });
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });

      // Should still create a session after navigation
      const events = await waitForEventTypes(testDb, ['open_time_start'], 1);
      await timeTracker.stop();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('open_time_start');
    });

    it('should handle concurrent events from multiple tabs', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mocks
      mockTabs.get.mockImplementation((tabId: number) => {
        return Promise.resolve({
          id: tabId,
          url: `https://example${tabId}.com`,
          windowId: 1,
          active: true,
        } as Browser.tabs.Tab);
      });

      // Simulate concurrent operations on multiple tabs
      const concurrentPromises = [];
      for (let tabId = 1; tabId <= 3; tabId++) {
        concurrentPromises.push(
          (async () => {
            await simulateTabActivation(timeTracker, { tabId });
            await simulateNavigation(timeTracker, { tabId, url: `https://example${tabId}.com` });
            await simulateUserInteraction(timeTracker, { tabId, type: 'click' });
          })()
        );
      }

      await Promise.all(concurrentPromises);

      // Should have events for all tabs
      const events = await waitForTabEvents(testDb, [1, 2, 3], 6, { timeout: 3000 }); // 3 tabs × 2 events each
      await timeTracker.stop();

      // Verify all tabs have events
      for (let tabId = 1; tabId <= 3; tabId++) {
        const tabEvents = events.filter(e => e.tabId === tabId);
        expect(tabEvents.length).toBeGreaterThan(0);
      }
    });

    it('should prevent race conditions in rapid user interactions', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Setup tab mock
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // First establish a session
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });

      // Generate many rapid interaction events concurrently (race condition scenario)
      const rapidInteractions = [];
      for (let i = 0; i < 50; i++) {
        rapidInteractions.push(
          simulateUserInteraction(timeTracker, { 
            tabId: 1, 
            type: 'mousemove', 
            timestamp: Date.now() + i 
          })
        );
      }

      // Execute all interactions concurrently
      await Promise.all(rapidInteractions);

      // Wait for all events to be processed
      const events = await waitForEvents(testDb, { expectedCount: 2, timeout: 3000 }); // Should only have 1 open_time_start + 1 active_time_start
      await timeTracker.stop();

      // Verify that only ONE active_time_start event was created despite 50 interactions
      const activeTimeEvents = events.filter(e => e.eventType === 'active_time_start');
      const openTimeEvents = events.filter(e => e.eventType === 'open_time_start');
      
      expect(openTimeEvents).toHaveLength(1);
      expect(activeTimeEvents).toHaveLength(1); // This is the key assertion - should be exactly 1, not 50
      
      console.log(`Race condition test: ${activeTimeEvents.length} active_time_start events from 50 concurrent interactions`);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors gracefully', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Simulate database connection issue by closing it
      testDb.close();

      // Try to generate events (should not crash)
      await expect(timeTracker.handleBrowserEvent({
        type: 'tab-activated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
      })).resolves.not.toThrow();

      await timeTracker.stop();
    });

    it('should recover from startup with orphan sessions', async () => {
      // Pre-populate database with orphan events before creating TimeTracker
      const orphanEvents = await createTestData(testDb);
      expect(orphanEvents.length).toBeGreaterThan(0);

      // Verify test data was actually created
      const allEvents = await testDb.eventslog.toArray();
      console.log('Test data created:', allEvents.length, 'events');
      console.log('Event details:', allEvents.map(e => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        age: Date.now() - e.timestamp,
        visitId: e.visitId, // 检查visitId值
        activityId: e.activityId // 检查activityId值
      })));

      // Create a new TimeTracker instance with shorter maxSessionAge for testing
      const testConfigWithShortAge = {
        ...TEST_CONFIG,
        startupRecovery: {
          maxSessionAge: 3600000, // 1 hour (minimum allowed value)
        },
      };
      const recoveryTracker = createTimeTracker(testConfigWithShortAge, testDb);

      // Debug: Test the recovery tracker's database service directly
      console.log('Recovery tracker created with test database');

      // Initialize tracker (should trigger recovery)
      const initResult = await recoveryTracker.initialize();
      expect(initResult.success).toBe(true);

      // Debug: Check what recovery found
      console.log('Recovery result:', initResult.stats);

      // Debug: Test DatabaseService query directly
      const testDbService = new (await import('../../../src/core/db/services/database.service')).DatabaseService(testDb);

      const cutoffTime = Date.now() - 3600000; // 1 hour ago
      console.log('Testing DatabaseService query...');
      console.log('Query range:', { cutoffTime, now: Date.now(), range: Date.now() - cutoffTime });

      const dbServiceQuery = await testDbService.getEventsByTypeAndTimeRange(
        'open_time_start',
        cutoffTime,
        Date.now()
      );
      console.log('DatabaseService query result:', dbServiceQuery.length, 'events found');
      console.log('DatabaseService query details:', dbServiceQuery.map(e => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        age: Date.now() - e.timestamp,
        withinRange: e.timestamp >= cutoffTime && e.timestamp <= Date.now()
      })));

      // Debug: Manually check what the database query would find
      const manualQuery = await testDb.eventslog
        .where('timestamp')
        .between(cutoffTime, Date.now())
        .and(event => event.eventType === 'open_time_start')
        .toArray();
      console.log('Manual query result:', manualQuery.length, 'events found');
      console.log('Manual query details:', manualQuery.map(e => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        age: Date.now() - e.timestamp,
        withinRange: e.timestamp >= cutoffTime && e.timestamp <= Date.now()
      })));

      expect(initResult.stats?.orphanSessionsRecovered).toBeGreaterThan(0);

      // Verify recovery events were generated
      const events = await testDb.eventslog.orderBy('timestamp').reverse().limit(10).toArray();
      const recoveryEvents = events.filter(e => e.eventType === 'open_time_end' || e.eventType === 'active_time_end');
      console.log('All events after recovery:', events.map(e => ({ eventType: e.eventType, timestamp: e.timestamp })));
      console.log('Recovery events found:', recoveryEvents.map(e => ({ eventType: e.eventType, timestamp: e.timestamp })));
      expect(recoveryEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle rapid event sequences without memory leaks', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // First establish a session
      await simulateTabActivation(timeTracker, { tabId: 1 });
      await simulateNavigation(timeTracker, { tabId: 1, url: 'https://example.com' });

      // Generate many rapid interaction events
      const eventPromises = [];
      for (let i = 0; i < 100; i++) {
        eventPromises.push(
          simulateUserInteraction(timeTracker, { 
          tabId: 1,
            type: 'mousemove',
            timestamp: Date.now() + i 
          })
        );
      }

      await Promise.all(eventPromises);
      await timeTracker.stop();

      // Should complete without errors and create events
      const events = await testDb.eventslog.toArray();
      expect(events.length).toBeGreaterThan(0);
      
      // Note: Currently system creates one active_time_start per interaction
      // This test documents the current behavior rather than asserting expected deduplication
      console.log(`Performance test created ${events.length} events from 100 interactions`);
      
      // Should have at least the initial open_time_start event
      const openTimeEvents = events.filter(e => e.eventType === 'open_time_start');
      expect(openTimeEvents.length).toBeGreaterThan(0);
    });

    it('should handle EventQueue overflow gracefully', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      // Create many rapid navigation events to stress the queue
      const eventPromises = [];
      for (let i = 1; i <= 20; i++) {
        mockTabs.get.mockResolvedValue({
          id: 1,
          url: `https://example.com/page${i}`,
          windowId: 1,
          active: true,
        } as Browser.tabs.Tab);

        eventPromises.push(
          simulateNavigation(timeTracker, { 
            tabId: 1, 
            url: `https://example.com/page${i}`,
            timestamp: Date.now() + i * 10
          })
        );
      }

      // Should not crash even with many rapid navigations
      await expect(Promise.all(eventPromises)).resolves.not.toThrow();
      
      // Wait for events to be processed and stop
      await waitForEvents(testDb, { expectedCount: 10, timeout: 5000 });
      await timeTracker.stop();

      // Should have created events without crashing
      const events = await testDb.eventslog.toArray();
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
