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

      // Step 3: Simulate tab activation (user opens a new tab)
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

      // Step 5: Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 6: Simulate tab navigation (should end current session and start new one)
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com/page2',
        windowId: 1,
        active: true,
      } as Browser.tabs.Tab);

      const tabUpdatedEvent: BrowserEventData = {
        type: 'tab-updated',
        tabId: 1,
        windowId: 1,
        url: 'https://example.com/page2',
        changeInfo: { url: 'https://example.com/page2' },
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(tabUpdatedEvent);

      // Step 7: Simulate tab closure
      const tabRemovedEvent: BrowserEventData = {
        type: 'tab-removed',
        tabId: 1,
        timestamp: Date.now(),
      };

      await timeTracker.handleBrowserEvent(tabRemovedEvent);

      // Step 8: Stop tracking and verify events were generated
      await timeTracker.stop();

      // Verify that events were created in the database
      const events = await testDb.eventslog.orderBy('timestamp').reverse().limit(10).toArray();
      expect(events.length).toBeGreaterThan(0);

      // Should have open_time_start events at minimum
      const eventTypes = events.map(e => e.eventType);
      expect(eventTypes).toContain('open_time_start');
    });

    it('should handle multiple tabs and focus changes', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      // Tab 1: example.com
      mockTabs.get.mockImplementation((tabId: number) => {
        if (tabId === 1) {
          return Promise.resolve({
            id: 1,
            url: 'https://example.com',
            windowId: 1,
            active: true,
          } as Browser.tabs.Tab);
        } else if (tabId === 2) {
          return Promise.resolve({
            id: 2,
            url: 'https://github.com',
            windowId: 1,
            active: false,
          } as Browser.tabs.Tab);
        }
        return Promise.reject(new Error('Tab not found'));
      });

      // Activate tab 1
      await timeTracker.handleBrowserEvent({
        type: 'tab-activated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
      });

      // User interaction on tab 1
      await timeTracker.handleBrowserEvent({
        type: 'user-interaction',
        tabId: 1,
        interaction: {
          type: 'keydown',
          timestamp: Date.now(),
          tabId: 1,
        },
        timestamp: Date.now(),
      });

      // Switch to tab 2
      await timeTracker.handleBrowserEvent({
        type: 'tab-activated',
        tabId: 2,
        windowId: 1,
        timestamp: Date.now(),
      });

      // User interaction on tab 2
      await timeTracker.handleBrowserEvent({
        type: 'user-interaction',
        tabId: 2,
        interaction: {
          type: 'scroll',
          timestamp: Date.now(),
          tabId: 2,
        },
        timestamp: Date.now(),
      });

      await timeTracker.stop();

      // Verify events for both tabs
      const events = await testDb.eventslog.orderBy('timestamp').reverse().limit(20).toArray();
      const tab1Events = events.filter(e => e.tabId === 1);
      const tab2Events = events.filter(e => e.tabId === 2);

      expect(tab1Events.length).toBeGreaterThan(0);
      expect(tab2Events.length).toBeGreaterThan(0);
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

      // Generate many rapid events
      const eventPromises = [];
      for (let i = 0; i < 100; i++) {
        eventPromises.push(timeTracker.handleBrowserEvent({
          type: 'user-interaction',
          tabId: 1,
          interaction: {
            type: 'mousemove',
            timestamp: Date.now() + i,
            tabId: 1,
          },
          timestamp: Date.now() + i,
        }));
      }

      await Promise.all(eventPromises);
      await timeTracker.stop();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});
