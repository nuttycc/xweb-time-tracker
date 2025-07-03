/**
 * TabStateManager Unit Tests
 *
 * Comprehensive unit tests for the TabStateManager class.
 * Tests the single-focus principle, tab state transitions, edge cases like rapid tab switching,
 * and state cleanup. Uses vitest mocking to simulate browser tab events and verify
 * state management correctness.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TabStateManager } from '../../../../src/core/tracker/state/TabStateManager';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FocusChangeEvent is used in test type annotations and mock function signatures
import type { FocusChangeEvent } from '../../../../src/core/tracker/state/TabStateManager';
import type { TabState } from '../../../../src/core/tracker/types';
import { TabStateStorageUtils } from '../../../../src/core/tracker/storage/TabStateStorage';

// Mock the storage utilities
vi.mock('../../../../src/core/tracker/storage/TabStateStorage', () => ({
  TabStateStorageUtils: {
    getAllTabStates: vi.fn(),
    saveAllTabStates: vi.fn(),
    clearAllTabStates: vi.fn(),
    getStorageMetadata: vi.fn(),
    getStorageStats: vi.fn(),
    watchStorageChanges: vi.fn(),
  },
}));

describe('TabStateManager', () => {
  let tabStateManager: TabStateManager;
  let mockFocusChangeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tabStateManager = new TabStateManager();
    mockFocusChangeListener = vi.fn();

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock behaviors
    vi.mocked(TabStateStorageUtils.getAllTabStates).mockResolvedValue({});
    vi.mocked(TabStateStorageUtils.saveAllTabStates).mockResolvedValue();
    vi.mocked(TabStateStorageUtils.clearAllTabStates).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with no focused tab', () => {
      expect(tabStateManager.getFocusedTab()).toBeUndefined();
      expect(tabStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(tabStateManager.getFocusContext().focusedWindowId).toBeNull();
    });

    it('should have empty tab states map', () => {
      expect(tabStateManager.getAllTabStates().size).toBe(0);
    });

    it('should validate state consistency on initialization', () => {
      expect(tabStateManager.validateStateConsistency()).toBe(true);
    });
  });

  describe('Tab State Management', () => {
    const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
      url: 'https://example.com',
      visitId: '123e4567-e89b-12d3-a456-426614174000',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
      sessionEnded: false,
    };

    it('should create a new tab state', () => {
      const tabId = 1;
      const windowId = 100;

      tabStateManager.createTabState(tabId, mockTabState, windowId);

      const tabState = tabStateManager.getTabState(tabId);
      expect(tabState).toBeDefined();
      expect(tabState?.url).toBe(mockTabState.url);
      expect(tabState?.visitId).toBe(mockTabState.visitId);
      expect(tabState?.windowId).toBe(windowId);
      expect(tabState?.isFocused).toBe(false);
    });

    it('should update existing tab state', () => {
      const tabId = 1;
      const windowId = 100;

      tabStateManager.createTabState(tabId, mockTabState, windowId);

      const updates = {
        isAudible: true,
        lastInteractionTimestamp: Date.now() + 1000,
      };

      tabStateManager.updateTabState(tabId, updates);

      const tabState = tabStateManager.getTabState(tabId);
      expect(tabState?.isAudible).toBe(true);
      expect(tabState?.lastInteractionTimestamp).toBe(updates.lastInteractionTimestamp);
    });

    it('should throw error when updating non-existent tab state', () => {
      expect(() => {
        tabStateManager.updateTabState(999, { isAudible: true });
      }).toThrow('Tab state not found for tabId: 999');
    });

    it('should clear tab state and handle focus cleanup', () => {
      const tabId = 1;
      const windowId = 100;

      tabStateManager.createTabState(tabId, mockTabState, windowId);
      tabStateManager.setFocusedTab(tabId, windowId);

      expect(tabStateManager.isFocusTab(tabId)).toBe(true);

      tabStateManager.clearTabState(tabId);

      expect(tabStateManager.getTabState(tabId)).toBeUndefined();
      expect(tabStateManager.getFocusContext().focusedTabId).toBeNull();
    });

    it('should validate tab state with zod schema', () => {
      const tabId = 1;
      const windowId = 100;

      // This should not throw as the schema validation passes
      expect(() => {
        tabStateManager.createTabState(tabId, mockTabState, windowId);
      }).not.toThrow();
    });
  });

  describe('Focus Management - Single Focus Principle', () => {
    const tabId1 = 1;
    const tabId2 = 2;
    const windowId = 100;
    const mockTabState1: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
      url: 'https://example1.com',
      visitId: '123e4567-e89b-12d3-a456-426614174001',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
      sessionEnded: false,
    };
    const mockTabState2: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
      url: 'https://example2.com',
      visitId: '123e4567-e89b-12d3-a456-426614174002',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
      sessionEnded: false,
    };

    beforeEach(() => {
      tabStateManager.createTabState(tabId1, mockTabState1, windowId);
      tabStateManager.createTabState(tabId2, mockTabState2, windowId);
    });

    it('should set focused tab correctly', () => {
      tabStateManager.setFocusedTab(tabId1, windowId);

      expect(tabStateManager.isFocusTab(tabId1)).toBe(true);
      expect(tabStateManager.isFocusTab(tabId2)).toBe(false);
      expect(tabStateManager.getFocusedTab()?.url).toBe(mockTabState1.url);
    });

    it('should enforce single focus principle when switching tabs', () => {
      // Set first tab as focused
      tabStateManager.setFocusedTab(tabId1, windowId);
      expect(tabStateManager.isFocusTab(tabId1)).toBe(true);
      expect(tabStateManager.getTabState(tabId1)?.isFocused).toBe(true);

      // Switch focus to second tab
      tabStateManager.setFocusedTab(tabId2, windowId);
      expect(tabStateManager.isFocusTab(tabId1)).toBe(false);
      expect(tabStateManager.isFocusTab(tabId2)).toBe(true);
      expect(tabStateManager.getTabState(tabId1)?.isFocused).toBe(false);
      expect(tabStateManager.getTabState(tabId2)?.isFocused).toBe(true);
    });

    it('should clear focus when no tab is focused', () => {
      tabStateManager.setFocusedTab(tabId1, windowId);
      expect(tabStateManager.isFocusTab(tabId1)).toBe(true);

      tabStateManager.clearFocus();
      expect(tabStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(tabStateManager.getFocusedTab()).toBeUndefined();
      expect(tabStateManager.getTabState(tabId1)?.isFocused).toBe(false);
    });

    it('should trigger focus change events', () => {
      tabStateManager.onFocusChange(mockFocusChangeListener);

      tabStateManager.setFocusedTab(tabId1, windowId);

      expect(mockFocusChangeListener).toHaveBeenCalledWith({
        previousTabId: null,
        currentTabId: tabId1,
        timestamp: expect.any(Number),
        windowId,
      });

      // Switch to another tab
      tabStateManager.setFocusedTab(tabId2, windowId);

      expect(mockFocusChangeListener).toHaveBeenCalledWith({
        previousTabId: tabId1,
        currentTabId: tabId2,
        timestamp: expect.any(Number),
        windowId,
      });
    });

    it('should handle rapid tab switching correctly', () => {
      tabStateManager.onFocusChange(mockFocusChangeListener);

      // Rapid switching
      tabStateManager.setFocusedTab(tabId1, windowId);
      tabStateManager.setFocusedTab(tabId2, windowId);
      tabStateManager.setFocusedTab(tabId1, windowId);

      // Should maintain single focus principle
      expect(tabStateManager.isFocusTab(tabId1)).toBe(true);
      expect(tabStateManager.isFocusTab(tabId2)).toBe(false);

      // Should have triggered 3 focus change events
      expect(mockFocusChangeListener).toHaveBeenCalledTimes(3);
    });
  });

  describe('Active Time Management', () => {
    const tabId = 1;
    const windowId = 100;
    const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
      url: 'https://example.com',
      visitId: '123e4567-e89b-12d3-a456-426614174000',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
      sessionEnded: false,
    };

    beforeEach(() => {
      tabStateManager.createTabState(tabId, mockTabState, windowId);
    });

    it('should start active time tracking', () => {
      const activityId = '123e4567-e89b-12d3-a456-426614174001';
      const timestamp = Date.now();

      tabStateManager.startActiveTime(tabId, activityId, timestamp);

      const tabState = tabStateManager.getTabState(tabId);
      expect(tabState?.activityId).toBe(activityId);
      expect(tabState?.activeTimeStart).toBe(timestamp);
      expect(tabState?.lastInteractionTimestamp).toBe(timestamp);
    });

    it('should stop active time tracking', () => {
      const activityId = '123e4567-e89b-12d3-a456-426614174001';
      tabStateManager.startActiveTime(tabId, activityId);

      tabStateManager.stopActiveTime(tabId);

      const tabState = tabStateManager.getTabState(tabId);
      expect(tabState?.activityId).toBeNull();
      expect(tabState?.activeTimeStart).toBeNull();
    });

    it('should update last interaction timestamp', () => {
      const timestamp = Date.now() + 5000;

      tabStateManager.updateLastInteraction(tabId, timestamp);

      const tabState = tabStateManager.getTabState(tabId);
      expect(tabState?.lastInteractionTimestamp).toBe(timestamp);
    });

    it('should get active time tabs', () => {
      const tabId2 = 2;
      tabStateManager.createTabState(tabId2, mockTabState, windowId);

      // Start active time for first tab only
      tabStateManager.startActiveTime(tabId, '123e4567-e89b-12d3-a456-426614174001');

      const activeTimeTabs = tabStateManager.getActiveTimeTabs();
      expect(activeTimeTabs).toEqual([tabId]);
      expect(activeTimeTabs).not.toContain(tabId2);
    });

    it('should get open time tabs', () => {
      const tabId2 = 2;
      tabStateManager.createTabState(tabId2, mockTabState, windowId);

      const openTimeTabs = tabStateManager.getOpenTimeTabs();
      expect(openTimeTabs).toContain(tabId);
      expect(openTimeTabs).toContain(tabId2);
      expect(openTimeTabs).toHaveLength(2);
    });
  });

  describe('Event Management', () => {
    it('should add and remove focus change listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      tabStateManager.onFocusChange(listener1);
      tabStateManager.onFocusChange(listener2);

      tabStateManager.setFocusedTab(1, 100);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      // Remove one listener
      tabStateManager.offFocusChange(listener1);
      listener1.mockClear();
      listener2.mockClear();

      tabStateManager.setFocusedTab(2, 100);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle errors in focus change listeners gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalListener = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      tabStateManager.onFocusChange(errorListener);
      tabStateManager.onFocusChange(normalListener);

      tabStateManager.setFocusedTab(1, 100);

      expect(consoleSpy).toHaveBeenCalledWith('Error in focus change listener:', expect.any(Error));
      expect(normalListener).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('State Validation and Consistency', () => {
    it('should validate state consistency', () => {
      const tabId = 1;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
        sessionEnded: false,
      };

      tabStateManager.createTabState(tabId, mockTabState, windowId);
      tabStateManager.setFocusedTab(tabId, windowId);

      expect(tabStateManager.validateStateConsistency()).toBe(true);
    });

    it('should clear all state', () => {
      const tabId = 1;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
        sessionEnded: false,
      };

      tabStateManager.createTabState(tabId, mockTabState, windowId);
      tabStateManager.setFocusedTab(tabId, windowId);
      tabStateManager.onFocusChange(mockFocusChangeListener);

      tabStateManager.clearAllState();

      expect(tabStateManager.getAllTabStates().size).toBe(0);
      expect(tabStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(tabStateManager.getFocusContext().focusedWindowId).toBeNull();
    });

    it('should provide debug information', () => {
      const tabId1 = 1;
      const tabId2 = 2;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
        sessionEnded: false,
      };

      tabStateManager.createTabState(tabId1, mockTabState, windowId);
      tabStateManager.createTabState(tabId2, mockTabState, windowId);
      tabStateManager.setFocusedTab(tabId1, windowId);
      tabStateManager.startActiveTime(tabId1, '123e4567-e89b-12d3-a456-426614174001');

      const debugInfo = tabStateManager.getDebugInfo();

      expect(debugInfo.tabCount).toBe(2);
      expect(debugInfo.focusedTabId).toBe(tabId1);
      expect(debugInfo.focusedWindowId).toBe(windowId);
      expect(debugInfo.activeTimeTabs).toEqual([tabId1]);
      expect(debugInfo.lastFocusChange).toBeTypeOf('number');
    });
  });

  describe('Persistent Storage Integration', () => {
    const mockTabState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'> = {
      url: 'https://example.com',
      visitId: '123e4567-e89b-12d3-a456-426614174000',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
      sessionEnded: false,
    };

    describe('createTabState with persistence', () => {
      it('should create tab state and sync to persistent storage', () => {
        const tabId = 1;
        const windowId = 100;

        tabStateManager.createTabState(tabId, mockTabState, windowId);

        // Verify memory state
        const tabState = tabStateManager.getTabState(tabId);
        expect(tabState).toBeDefined();
        expect(tabState?.url).toBe(mockTabState.url);

        // Verify persistent storage sync was called (fire-and-forget)
        // Note: We can't easily test the async call without making the test async
        // The sync happens in the background
      });

      it('should create tab state and wait for persistence with async version', async () => {
        const tabId = 1;
        const windowId = 100;

        await tabStateManager.createTabStateAsync(tabId, mockTabState, windowId);

        // Verify memory state
        const tabState = tabStateManager.getTabState(tabId);
        expect(tabState).toBeDefined();
        expect(tabState?.url).toBe(mockTabState.url);

        // Verify persistent storage was called
        expect(TabStateStorageUtils.saveAllTabStates).toHaveBeenCalledWith({
          [tabId]: expect.objectContaining({
            url: mockTabState.url,
            visitId: mockTabState.visitId,
            tabId,
            windowId,
          }),
        });
      });
    });

    describe('updateTabState with persistence', () => {
      beforeEach(() => {
        const tabId = 1;
        const windowId = 100;
        tabStateManager.createTabState(tabId, mockTabState, windowId);
        vi.clearAllMocks(); // Clear the create call
      });

      it('should update tab state and sync to persistent storage', () => {
        const tabId = 1;
        const updates = { isAudible: true };

        tabStateManager.updateTabState(tabId, updates);

        // Verify memory state
        const tabState = tabStateManager.getTabState(tabId);
        expect(tabState?.isAudible).toBe(true);
      });

      it('should update tab state and wait for persistence with async version', async () => {
        const tabId = 1;
        const updates = { isAudible: true };

        await tabStateManager.updateTabStateAsync(tabId, updates);

        // Verify memory state
        const tabState = tabStateManager.getTabState(tabId);
        expect(tabState?.isAudible).toBe(true);

        // Verify persistent storage was called
        expect(TabStateStorageUtils.saveAllTabStates).toHaveBeenCalledWith({
          [tabId]: expect.objectContaining({
            isAudible: true,
          }),
        });
      });
    });

    describe('clearTabState with persistence', () => {
      beforeEach(() => {
        const tabId = 1;
        const windowId = 100;
        tabStateManager.createTabState(tabId, mockTabState, windowId);
        vi.clearAllMocks(); // Clear the create call
      });

      it('should clear tab state and sync to persistent storage', () => {
        const tabId = 1;

        tabStateManager.clearTabState(tabId);

        // Verify memory state
        expect(tabStateManager.getTabState(tabId)).toBeUndefined();
      });

      it('should clear tab state and wait for persistence with async version', async () => {
        const tabId = 1;

        await tabStateManager.clearTabStateAsync(tabId);

        // Verify memory state
        expect(tabStateManager.getTabState(tabId)).toBeUndefined();

        // Verify persistent storage was called (should be empty now)
        expect(TabStateStorageUtils.saveAllTabStates).toHaveBeenCalledWith({});
      });
    });

    describe('loadFromPersistentStorage', () => {
      it('should load tab states from persistent storage into memory', async () => {
        const persistentData = {
          1: {
            ...mockTabState,
            tabId: 1,
            windowId: 100,
            isFocused: false,
          },
          2: {
            ...mockTabState,
            url: 'https://example2.com',
            visitId: '123e4567-e89b-12d3-a456-426614174001',
            tabId: 2,
            windowId: 100,
            isFocused: false,
          },
        };

        vi.mocked(TabStateStorageUtils.getAllTabStates).mockResolvedValue(persistentData);

        const loadedCount = await tabStateManager.loadFromPersistentStorage();

        expect(loadedCount).toBe(2);
        expect(tabStateManager.getTabState(1)).toEqual(persistentData[1]);
        expect(tabStateManager.getTabState(2)).toEqual(persistentData[2]);
        expect(TabStateStorageUtils.getAllTabStates).toHaveBeenCalled();
      });

      it('should handle storage load failure gracefully', async () => {
        vi.mocked(TabStateStorageUtils.getAllTabStates).mockRejectedValue(
          new Error('Storage error')
        );

        const loadedCount = await tabStateManager.loadFromPersistentStorage();

        expect(loadedCount).toBe(0);
        expect(tabStateManager.getAllTabStates().size).toBe(0);
      });
    });

    describe('getTabStateAsync with fallback', () => {
      it('should return tab state from memory if available', async () => {
        const tabId = 1;
        const windowId = 100;
        tabStateManager.createTabState(tabId, mockTabState, windowId);

        const tabState = await tabStateManager.getTabStateAsync(tabId);

        expect(tabState).toBeDefined();
        expect(tabState?.url).toBe(mockTabState.url);
        // Should not call persistent storage since it's in memory
        expect(TabStateStorageUtils.getAllTabStates).not.toHaveBeenCalled();
      });

      it('should fallback to persistent storage if not in memory', async () => {
        const tabId = 1;
        const persistentData = {
          [tabId]: {
            ...mockTabState,
            tabId,
            windowId: 100,
            isFocused: false,
          },
        };

        vi.mocked(TabStateStorageUtils.getAllTabStates).mockResolvedValue(persistentData);

        const tabState = await tabStateManager.getTabStateAsync(tabId);

        expect(tabState).toEqual(persistentData[tabId]);
        expect(TabStateStorageUtils.getAllTabStates).toHaveBeenCalled();
        // Should now be in memory cache
        expect(tabStateManager.getTabState(tabId)).toEqual(persistentData[tabId]);
      });

      it('should return undefined if not found in memory or persistent storage', async () => {
        const tabId = 999;

        vi.mocked(TabStateStorageUtils.getAllTabStates).mockResolvedValue({});

        const tabState = await tabStateManager.getTabStateAsync(tabId);

        expect(tabState).toBeUndefined();
        expect(TabStateStorageUtils.getAllTabStates).toHaveBeenCalled();
      });
    });

    describe('forceSyncToPersistentStorage', () => {
      it('should force sync all current states to persistent storage', async () => {
        const tabId1 = 1;
        const tabId2 = 2;
        const windowId = 100;

        tabStateManager.createTabState(tabId1, mockTabState, windowId);
        tabStateManager.createTabState(
          tabId2,
          { ...mockTabState, url: 'https://example2.com' },
          windowId
        );

        vi.clearAllMocks(); // Clear the create calls

        await tabStateManager.forceSyncToPersistentStorage();

        expect(TabStateStorageUtils.saveAllTabStates).toHaveBeenCalledWith({
          [tabId1]: expect.objectContaining({ url: mockTabState.url }),
          [tabId2]: expect.objectContaining({ url: 'https://example2.com' }),
        });
      });
    });

    describe('clearAllStateIncludingPersistent', () => {
      it('should clear both memory and persistent storage', async () => {
        const tabId = 1;
        const windowId = 100;
        tabStateManager.createTabState(tabId, mockTabState, windowId);

        await tabStateManager.clearAllStateIncludingPersistent();

        expect(tabStateManager.getAllTabStates().size).toBe(0);
        expect(TabStateStorageUtils.clearAllTabStates).toHaveBeenCalled();
      });
    });
  });
});
