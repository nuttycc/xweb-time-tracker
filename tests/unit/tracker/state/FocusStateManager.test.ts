/**
 * FocusStateManager Unit Tests
 *
 * Comprehensive unit tests for the FocusStateManager class.
 * Tests the single-focus principle, tab state transitions, edge cases like rapid tab switching,
 * and state cleanup. Uses vitest mocking to simulate browser tab events and verify
 * state management correctness.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FocusStateManager } from '../../../../src/core/tracker/state/FocusStateManager';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FocusChangeEvent is used in test type annotations and mock function signatures
import type { FocusChangeEvent } from '../../../../src/core/tracker/state/FocusStateManager';
import type { TabState } from '../../../../src/core/tracker/types';

describe('FocusStateManager', () => {
  let focusStateManager: FocusStateManager;
  let mockFocusChangeListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    focusStateManager = new FocusStateManager();
    mockFocusChangeListener = vi.fn();
  });

  describe('Initialization', () => {
    it('should initialize with no focused tab', () => {
      expect(focusStateManager.getFocusedTab()).toBeUndefined();
      expect(focusStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(focusStateManager.getFocusContext().focusedWindowId).toBeNull();
    });

    it('should have empty tab states map', () => {
      expect(focusStateManager.getAllTabStates().size).toBe(0);
    });

    it('should validate state consistency on initialization', () => {
      expect(focusStateManager.validateStateConsistency()).toBe(true);
    });
  });

  describe('Tab State Management', () => {
    const mockTabState: Omit<TabState, 'isFocused' | 'windowId'> = {
      url: 'https://example.com',
      visitId: '123e4567-e89b-12d3-a456-426614174000',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
    };

    it('should create a new tab state', () => {
      const tabId = 1;
      const windowId = 100;

      focusStateManager.createTabState(tabId, mockTabState, windowId);

      const tabState = focusStateManager.getTabState(tabId);
      expect(tabState).toBeDefined();
      expect(tabState?.url).toBe(mockTabState.url);
      expect(tabState?.visitId).toBe(mockTabState.visitId);
      expect(tabState?.windowId).toBe(windowId);
      expect(tabState?.isFocused).toBe(false);
    });

    it('should update existing tab state', () => {
      const tabId = 1;
      const windowId = 100;

      focusStateManager.createTabState(tabId, mockTabState, windowId);

      const updates = {
        isAudible: true,
        lastInteractionTimestamp: Date.now() + 1000,
      };

      focusStateManager.updateTabState(tabId, updates);

      const tabState = focusStateManager.getTabState(tabId);
      expect(tabState?.isAudible).toBe(true);
      expect(tabState?.lastInteractionTimestamp).toBe(updates.lastInteractionTimestamp);
    });

    it('should throw error when updating non-existent tab state', () => {
      expect(() => {
        focusStateManager.updateTabState(999, { isAudible: true });
      }).toThrow('Tab state not found for tabId: 999');
    });

    it('should clear tab state and handle focus cleanup', () => {
      const tabId = 1;
      const windowId = 100;

      focusStateManager.createTabState(tabId, mockTabState, windowId);
      focusStateManager.setFocusedTab(tabId, windowId);

      expect(focusStateManager.isFocusTab(tabId)).toBe(true);

      focusStateManager.clearTabState(tabId);

      expect(focusStateManager.getTabState(tabId)).toBeUndefined();
      expect(focusStateManager.getFocusContext().focusedTabId).toBeNull();
    });

    it('should validate tab state with zod schema', () => {
      const tabId = 1;
      const windowId = 100;

      // This should not throw as the schema validation passes
      expect(() => {
        focusStateManager.createTabState(tabId, mockTabState, windowId);
      }).not.toThrow();
    });
  });

  describe('Focus Management - Single Focus Principle', () => {
    const tabId1 = 1;
    const tabId2 = 2;
    const windowId = 100;
    const mockTabState1: Omit<TabState, 'isFocused' | 'windowId'> = {
      url: 'https://example1.com',
      visitId: '123e4567-e89b-12d3-a456-426614174001',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
    };
    const mockTabState2: Omit<TabState, 'isFocused' | 'windowId'> = {
      url: 'https://example2.com',
      visitId: '123e4567-e89b-12d3-a456-426614174002',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
    };

    beforeEach(() => {
      focusStateManager.createTabState(tabId1, mockTabState1, windowId);
      focusStateManager.createTabState(tabId2, mockTabState2, windowId);
    });

    it('should set focused tab correctly', () => {
      focusStateManager.setFocusedTab(tabId1, windowId);

      expect(focusStateManager.isFocusTab(tabId1)).toBe(true);
      expect(focusStateManager.isFocusTab(tabId2)).toBe(false);
      expect(focusStateManager.getFocusedTab()?.url).toBe(mockTabState1.url);
    });

    it('should enforce single focus principle when switching tabs', () => {
      // Set first tab as focused
      focusStateManager.setFocusedTab(tabId1, windowId);
      expect(focusStateManager.isFocusTab(tabId1)).toBe(true);
      expect(focusStateManager.getTabState(tabId1)?.isFocused).toBe(true);

      // Switch focus to second tab
      focusStateManager.setFocusedTab(tabId2, windowId);
      expect(focusStateManager.isFocusTab(tabId1)).toBe(false);
      expect(focusStateManager.isFocusTab(tabId2)).toBe(true);
      expect(focusStateManager.getTabState(tabId1)?.isFocused).toBe(false);
      expect(focusStateManager.getTabState(tabId2)?.isFocused).toBe(true);
    });

    it('should clear focus when no tab is focused', () => {
      focusStateManager.setFocusedTab(tabId1, windowId);
      expect(focusStateManager.isFocusTab(tabId1)).toBe(true);

      focusStateManager.clearFocus();
      expect(focusStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(focusStateManager.getFocusedTab()).toBeUndefined();
      expect(focusStateManager.getTabState(tabId1)?.isFocused).toBe(false);
    });

    it('should trigger focus change events', () => {
      focusStateManager.onFocusChange(mockFocusChangeListener);

      focusStateManager.setFocusedTab(tabId1, windowId);

      expect(mockFocusChangeListener).toHaveBeenCalledWith({
        previousTabId: null,
        currentTabId: tabId1,
        timestamp: expect.any(Number),
        windowId,
      });

      // Switch to another tab
      focusStateManager.setFocusedTab(tabId2, windowId);

      expect(mockFocusChangeListener).toHaveBeenCalledWith({
        previousTabId: tabId1,
        currentTabId: tabId2,
        timestamp: expect.any(Number),
        windowId,
      });
    });

    it('should handle rapid tab switching correctly', () => {
      focusStateManager.onFocusChange(mockFocusChangeListener);

      // Rapid switching
      focusStateManager.setFocusedTab(tabId1, windowId);
      focusStateManager.setFocusedTab(tabId2, windowId);
      focusStateManager.setFocusedTab(tabId1, windowId);

      // Should maintain single focus principle
      expect(focusStateManager.isFocusTab(tabId1)).toBe(true);
      expect(focusStateManager.isFocusTab(tabId2)).toBe(false);

      // Should have triggered 3 focus change events
      expect(mockFocusChangeListener).toHaveBeenCalledTimes(3);
    });
  });

  describe('Active Time Management', () => {
    const tabId = 1;
    const windowId = 100;
    const mockTabState: Omit<TabState, 'isFocused' | 'windowId'> = {
      url: 'https://example.com',
      visitId: '123e4567-e89b-12d3-a456-426614174000',
      activityId: null,
      isAudible: false,
      lastInteractionTimestamp: Date.now(),
      openTimeStart: Date.now(),
      activeTimeStart: null,
    };

    beforeEach(() => {
      focusStateManager.createTabState(tabId, mockTabState, windowId);
    });

    it('should start active time tracking', () => {
      const activityId = '123e4567-e89b-12d3-a456-426614174001';
      const timestamp = Date.now();

      focusStateManager.startActiveTime(tabId, activityId, timestamp);

      const tabState = focusStateManager.getTabState(tabId);
      expect(tabState?.activityId).toBe(activityId);
      expect(tabState?.activeTimeStart).toBe(timestamp);
      expect(tabState?.lastInteractionTimestamp).toBe(timestamp);
    });

    it('should stop active time tracking', () => {
      const activityId = '123e4567-e89b-12d3-a456-426614174001';
      focusStateManager.startActiveTime(tabId, activityId);

      focusStateManager.stopActiveTime(tabId);

      const tabState = focusStateManager.getTabState(tabId);
      expect(tabState?.activityId).toBeNull();
      expect(tabState?.activeTimeStart).toBeNull();
    });

    it('should update last interaction timestamp', () => {
      const timestamp = Date.now() + 5000;

      focusStateManager.updateLastInteraction(tabId, timestamp);

      const tabState = focusStateManager.getTabState(tabId);
      expect(tabState?.lastInteractionTimestamp).toBe(timestamp);
    });

    it('should get active time tabs', () => {
      const tabId2 = 2;
      focusStateManager.createTabState(tabId2, mockTabState, windowId);

      // Start active time for first tab only
      focusStateManager.startActiveTime(tabId, '123e4567-e89b-12d3-a456-426614174001');

      const activeTimeTabs = focusStateManager.getActiveTimeTabs();
      expect(activeTimeTabs).toEqual([tabId]);
      expect(activeTimeTabs).not.toContain(tabId2);
    });

    it('should get open time tabs', () => {
      const tabId2 = 2;
      focusStateManager.createTabState(tabId2, mockTabState, windowId);

      const openTimeTabs = focusStateManager.getOpenTimeTabs();
      expect(openTimeTabs).toContain(tabId);
      expect(openTimeTabs).toContain(tabId2);
      expect(openTimeTabs).toHaveLength(2);
    });
  });

  describe('Event Management', () => {
    it('should add and remove focus change listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      focusStateManager.onFocusChange(listener1);
      focusStateManager.onFocusChange(listener2);

      focusStateManager.setFocusedTab(1, 100);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      // Remove one listener
      focusStateManager.offFocusChange(listener1);
      listener1.mockClear();
      listener2.mockClear();

      focusStateManager.setFocusedTab(2, 100);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle errors in focus change listeners gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalListener = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      focusStateManager.onFocusChange(errorListener);
      focusStateManager.onFocusChange(normalListener);

      focusStateManager.setFocusedTab(1, 100);

      expect(consoleSpy).toHaveBeenCalledWith('Error in focus change listener:', expect.any(Error));
      expect(normalListener).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('State Validation and Consistency', () => {
    it('should validate state consistency', () => {
      const tabId = 1;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
      };

      focusStateManager.createTabState(tabId, mockTabState, windowId);
      focusStateManager.setFocusedTab(tabId, windowId);

      expect(focusStateManager.validateStateConsistency()).toBe(true);
    });

    it('should clear all state', () => {
      const tabId = 1;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
      };

      focusStateManager.createTabState(tabId, mockTabState, windowId);
      focusStateManager.setFocusedTab(tabId, windowId);
      focusStateManager.onFocusChange(mockFocusChangeListener);

      focusStateManager.clearAllState();

      expect(focusStateManager.getAllTabStates().size).toBe(0);
      expect(focusStateManager.getFocusContext().focusedTabId).toBeNull();
      expect(focusStateManager.getFocusContext().focusedWindowId).toBeNull();
    });

    it('should provide debug information', () => {
      const tabId1 = 1;
      const tabId2 = 2;
      const windowId = 100;
      const mockTabState: Omit<TabState, 'isFocused' | 'windowId'> = {
        url: 'https://example.com',
        visitId: '123e4567-e89b-12d3-a456-426614174000',
        activityId: null,
        isAudible: false,
        lastInteractionTimestamp: Date.now(),
        openTimeStart: Date.now(),
        activeTimeStart: null,
      };

      focusStateManager.createTabState(tabId1, mockTabState, windowId);
      focusStateManager.createTabState(tabId2, mockTabState, windowId);
      focusStateManager.setFocusedTab(tabId1, windowId);
      focusStateManager.startActiveTime(tabId1, '123e4567-e89b-12d3-a456-426614174001');

      const debugInfo = focusStateManager.getDebugInfo();

      expect(debugInfo.tabCount).toBe(2);
      expect(debugInfo.focusedTabId).toBe(tabId1);
      expect(debugInfo.focusedWindowId).toBe(windowId);
      expect(debugInfo.activeTimeTabs).toEqual([tabId1]);
      expect(debugInfo.lastFocusChange).toBeTypeOf('number');
    });
  });
});
