/**
 * Type-safe TimeTracker Unit Tests
 *
 * Demonstrates proper TypeScript testing practices without using 'any' or 'unknown'
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { type Browser } from 'wxt/browser';
import { TimeTracker, createTimeTracker, type BrowserEventData } from '../../../src/core/tracker';

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

describe('TimeTracker (Type-Safe)', () => {
  let timeTracker: TimeTracker;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup fake browser
    fakeBrowser.tabs.get = mockTabs.get;

    // Create TimeTracker instance
    timeTracker = new TimeTracker({
      enableDebugLogging: false,
      enableStartupRecovery: true,
      enableCheckpoints: true,
    });
  });

  describe('Factory Function', () => {
    it('should create TimeTracker with default configuration', () => {
      const tracker = createTimeTracker();
      expect(tracker).toBeInstanceOf(TimeTracker);
    });

    it('should create TimeTracker with custom configuration', () => {
      const tracker = createTimeTracker({
        enableDebugLogging: true,
        enableStartupRecovery: false,
        enableCheckpoints: false,
      });
      expect(tracker).toBeInstanceOf(TimeTracker);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // In a real implementation, we would inject dependencies
      // For now, we test the public interface
      const result = await timeTracker.initialize();

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      if (result.stats) {
        expect(typeof result.stats.initializationTime).toBe('number');
      }
    });
  });

  describe('Browser Event Handling', () => {
    it('should handle tab activation events', async () => {
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
      } as Browser.tabs.Tab);

      const eventData: BrowserEventData = {
        type: 'tab-activated',
        tabId: 1,
        windowId: 1,
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(timeTracker.handleBrowserEvent(eventData)).resolves.toBeUndefined();
    });

    it('should handle tab update events', async () => {
      mockTabs.get.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        windowId: 1,
      } as Browser.tabs.Tab);

      const eventData: BrowserEventData = {
        type: 'tab-updated',
        tabId: 1,
        windowId: 1,
        url: 'https://example.com',
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(timeTracker.handleBrowserEvent(eventData)).resolves.toBeUndefined();
    });

    it('should handle tab removal events', async () => {
      const eventData: BrowserEventData = {
        type: 'tab-removed',
        tabId: 1,
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(timeTracker.handleBrowserEvent(eventData)).resolves.toBeUndefined();
    });
  });

  describe('State Management', () => {
    it('should track initialization state', () => {
      expect(timeTracker.getInitializationStatus()).toBe(false);
    });

    it('should track started state', () => {
      expect(timeTracker.getStartedStatus()).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start successfully after initialization', async () => {
      await timeTracker.initialize();
      const result = await timeTracker.start();

      expect(result).toBe(true);
      expect(timeTracker.getStartedStatus()).toBe(true);
    });

    it('should stop successfully', async () => {
      await timeTracker.initialize();
      await timeTracker.start();

      const result = await timeTracker.stop();

      expect(result).toBe(true);
      expect(timeTracker.getStartedStatus()).toBe(false);
    });
  });
});
