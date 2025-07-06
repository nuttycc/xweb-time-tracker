/**
 * Tab State Manager
 *
 * Implements the core state management class that maintains the "single focus" principle.
 * This class tracks the state of all browser tabs using in-memory storage only.
 * It provides methods for focus management, tab state transitions, and ensures only one
 * tab can be considered "focused" at any time according to LLD specifications.
 */

import { TabState, TabStateSchema, FocusContext, FocusContextSchema } from '@/core/tracker/types';
import { createLogger } from '@/utils/logger';

/**
 * Options for updating tab state
 */
export interface TabStateUpdateOptions {
  /** Whether to validate the updated state */
  validate?: boolean;
}

/**
 * Focus change event data
 */
export interface FocusChangeEvent {
  /** Previously focused tab ID */
  previousTabId: number | null;
  /** Currently focused tab ID */
  currentTabId: number | null;
  /** Timestamp of the focus change */
  timestamp: number;
  /** Window ID where focus changed */
  windowId: number;
}

/**
 * Tab State Manager Class
 *
 * Manages the single-focus principle for time tracking by maintaining
 * real-time state of all browser tabs using in-memory storage only.
 */
export class TabStateManager {
  /** Memory cache: Map of tab ID to tab state */
  private tabStates: Map<number, TabState> = new Map();

  /** Current focus context */
  private focusContext: FocusContext = {
    focusedTabId: null,
    focusedWindowId: null,
    lastFocusChange: Date.now(),
  };

  /** Logger instance */
  private static readonly logger = createLogger('⚙️ TabStateManager');

  /** Event listeners for focus changes */
  private focusChangeListeners: Array<(event: FocusChangeEvent) => void> = [];

  // ============================================================================
  // Focus Management
  // ============================================================================

  /**
   * Checks if a tab is currently the focused tab
   * Implements the single-focus principle check logic from LLD
   *
   * @param tabId - Tab ID to check
   * @returns True if the tab is focused, false otherwise
   */
  isFocusTab(tabId: number): boolean {
    return this.focusContext.focusedTabId === tabId;
  }

  /**
   * Sets the focused tab and triggers focus change events
   * Ensures single-focus principle by clearing previous focus
   *
   * @param tabId - Tab ID to focus
   * @param windowId - Window ID containing the tab
   */
  setFocusedTab(tabId: number, windowId: number): void {
    const previousTabId = this.focusContext.focusedTabId;
    const timestamp = Date.now();

    // Update focus context
    this.focusContext = {
      focusedTabId: tabId,
      focusedWindowId: windowId,
      lastFocusChange: timestamp,
    };

    // Update tab states
    if (previousTabId !== null && this.tabStates.has(previousTabId)) {
      this.updateTabState(previousTabId, { isFocused: false }, { validate: false });
    }

    if (this.tabStates.has(tabId)) {
      this.updateTabState(tabId, { isFocused: true }, { validate: false });
    }

    // Trigger focus change events
    const focusChangeEvent: FocusChangeEvent = {
      previousTabId,
      currentTabId: tabId,
      timestamp,
      windowId,
    };

    this.notifyFocusChange(focusChangeEvent);
  }

  /**
   * Clears focus when no tab is focused (e.g., window minimized)
   */
  clearFocus(): void {
    const previousTabId = this.focusContext.focusedTabId;

    if (previousTabId !== null) {
      this.focusContext = {
        focusedTabId: null,
        focusedWindowId: null,
        lastFocusChange: Date.now(),
      };

      // Update previously focused tab state
      if (this.tabStates.has(previousTabId)) {
        this.updateTabState(previousTabId, { isFocused: false }, { validate: false });
      }

      // Trigger focus change event
      const focusChangeEvent: FocusChangeEvent = {
        previousTabId,
        currentTabId: null,
        timestamp: Date.now(),
        windowId: this.focusContext.focusedWindowId || -1,
      };

      this.notifyFocusChange(focusChangeEvent);
    }
  }

  /**
   * Gets the currently focused tab state
   *
   * @returns The focused tab state or undefined if no tab is focused
   */
  getFocusedTab(): TabState | undefined {
    if (this.focusContext.focusedTabId === null) {
      return undefined;
    }
    return this.tabStates.get(this.focusContext.focusedTabId);
  }

  /**
   * Gets the current focus context
   *
   * @returns Current focus context
   */
  getFocusContext(): FocusContext {
    return { ...this.focusContext };
  }

  // ============================================================================
  // Tab State Management
  // ============================================================================

  /**
   * Creates a new tab state in memory
   *
   * @param tabId - Tab ID
   * @param initialState - Initial tab state data
   * @param windowId - Window ID containing the tab
   * @param options - Creation options
   */
  createTabState(
    tabId: number,
    initialState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'>,
    windowId: number,
    options: TabStateUpdateOptions = {}
  ): void {
    const { validate = true } = options;
    const tabState: TabState = {
      ...initialState,
      isFocused: this.focusContext.focusedTabId === tabId,
      tabId,
      windowId,
    };

    if (validate) {
      TabStateSchema.parse(tabState);
    }

    this.setTabStateInMemory(tabId, tabState);

    TabStateManager.logger.debug('Created tab state (memory-only)',{tabState, allTabStates: this.getAllTabStates()});
  }

  /**
   * Updates an existing tab state in memory
   *
   * @param tabId - Tab ID to update
   * @param updates - Partial updates to apply
   * @param options - Update options
   */
  updateTabState(
    tabId: number,
    updates: Partial<TabState>,
    options: TabStateUpdateOptions = {}
  ): void {
    const { validate = true } = options;
    const currentState = this.tabStates.get(tabId);

    if (!currentState) {
      throw new Error(`Tab state not found for tabId: ${tabId}`);
    }

    const newState = { ...currentState, ...updates };

    // Validate if requested
    if (validate) {
      TabStateSchema.parse(newState);
    }

    // Update memory cache
    this.tabStates.set(tabId, newState);
  }

  /**
   * Gets a tab state by ID from memory
   *
   * @param tabId - Tab ID
   * @returns Tab state or undefined if not found
   */
  getTabState(tabId: number): TabState | undefined {
    return this.tabStates.get(tabId);
  }

  /**
   * Gets all tab states from memory cache
   *
   * @returns Map of all tab states currently in memory
   */
  getAllTabStates(): Map<number, TabState> {
    return new Map(this.tabStates);
  }

  /**
   * Clears a tab state and handles focus cleanup
   *
   * @param tabId - Tab ID to clear
   */
  clearTabState(tabId: number): void {
    // Remove from memory cache
    this.tabStates.delete(tabId);

    // Clear focus if this was the focused tab
    if (this.focusContext.focusedTabId === tabId) {
      this.clearFocus();
    }
  }

  /**
   * Updates the last interaction timestamp for a tab
   *
   * @param tabId - Tab ID
   * @param timestamp - Interaction timestamp (defaults to current time)
   */
  updateLastInteraction(tabId: number, timestamp: number = Date.now()): void {
    const tabState = this.tabStates.get(tabId);
    if (tabState) {
      this.updateTabState(tabId, { lastInteractionTimestamp: timestamp }, { validate: false });
    }
  }

  /**
   * Starts active time tracking for a tab
   *
   * @param tabId - Tab ID
   * @param activityId - Activity ID to track
   * @param timestamp - Start timestamp (defaults to current time)
   */
  startActiveTime(tabId: number, activityId: string, timestamp: number = Date.now()): void {
    this.updateTabState(tabId, { 
      activityId, 
      activeTimeStart: timestamp 
    }, { validate: false });
  }

  /**
   * Stops active time tracking for a tab
   *
   * @param tabId - Tab ID
   */
  stopActiveTime(tabId: number): void {
    this.updateTabState(tabId, { 
      activityId: null, 
      activeTimeStart: null 
    }, { validate: false });
  }

  /**
   * Sets tab state directly in memory (internal use)
   *
   * @private
   * @param tabId - Tab ID
   * @param tabState - Complete tab state
   */
  private setTabStateInMemory(tabId: number, tabState: TabState): void {
    this.tabStates.set(tabId, tabState);
  }

  /**
   * Loads multiple tab states into memory (bulk operation)
   *
   * @param statesToLoad - Array of tab states to load
   * @returns Number of states successfully loaded
   */
  loadTabStatesBatch(statesToLoad: Array<{ tabId: number; tabState: TabState }>): number {
    let loadedCount = 0;

    for (const { tabId, tabState } of statesToLoad) {
      try {
        // Validate the state before setting
        TabStateSchema.parse(tabState);
        this.setTabStateInMemory(tabId, tabState);
        loadedCount++;
      } catch (error) {
        TabStateManager.logger.warn('Failed to load tab state in batch', {
          tabId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    TabStateManager.logger.debug(`Loaded ${loadedCount}/${statesToLoad.length} tab states in batch`);
    return loadedCount;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * Adds a focus change event listener
   *
   * @param listener - Function to call when focus changes
   */
  onFocusChange(listener: (event: FocusChangeEvent) => void): void {
    this.focusChangeListeners.push(listener);
  }

  /**
   * Removes a focus change event listener
   *
   * @param listener - Function to remove
   */
  offFocusChange(listener: (event: FocusChangeEvent) => void): void {
    const index = this.focusChangeListeners.indexOf(listener);
    if (index > -1) {
      this.focusChangeListeners.splice(index, 1);
    }
  }

  /**
   * Notifies all focus change listeners
   *
   * @private
   * @param event - Focus change event data
   */
  private notifyFocusChange(event: FocusChangeEvent): void {
    for (const listener of this.focusChangeListeners) {
      try {
        listener(event);
      } catch (error) {
        TabStateManager.logger.error('Focus change listener error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Gets all tabs that are currently tracking active time
   *
   * @returns Array of tab IDs with active time tracking
   */
  getActiveTimeTabs(): number[] {
    const activeTabs: number[] = [];
    for (const [tabId, tabState] of this.tabStates) {
      if (tabState.activityId !== null) {
        activeTabs.push(tabId);
      }
    }
    return activeTabs;
  }

  /**
   * Gets all tabs that are currently tracking open time
   *
   * @returns Array of tab IDs with open time tracking
   */
  getOpenTimeTabs(): number[] {
    return Array.from(this.tabStates.keys());
  }

  /**
   * Validates the consistency of the current state
   *
   * @returns True if state is consistent, false otherwise
   */
  validateStateConsistency(): boolean {
    try {
      // Validate focus context
      FocusContextSchema.parse(this.focusContext);

      // Validate each tab state
      for (const [tabId, tabState] of this.tabStates) {
        TabStateSchema.parse(tabState);
        
        // Check if tabId matches the state's tabId
        if (tabState.tabId !== tabId) {
          TabStateManager.logger.error('Tab ID mismatch in state', {
            mapKey: tabId,
            stateTabId: tabState.tabId,
          });
          return false;
        }
      }

      // Check focus consistency
      const focusedTabId = this.focusContext.focusedTabId;
      if (focusedTabId !== null) {
        const focusedTabState = this.tabStates.get(focusedTabId);
        if (!focusedTabState || !focusedTabState.isFocused) {
          TabStateManager.logger.error('Focus inconsistency detected', {
            focusedTabId,
            tabExists: !!focusedTabState,
            tabIsFocused: focusedTabState?.isFocused,
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      TabStateManager.logger.error('State validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Clears all state from memory
   */
  clearAllState(): void {
    this.tabStates.clear();
    this.focusContext = {
      focusedTabId: null,
      focusedWindowId: null,
      lastFocusChange: Date.now(),
    };
    
    TabStateManager.logger.info('Cleared all tab states from memory');
  }

  /**
   * Gets debug information about the current state
   *
   * @returns Debug information object
   */
  getDebugInfo(): {
    tabCount: number;
    focusedTabId: number | null;
    focusedWindowId: number | null;
    activeTimeTabs: number[];
    lastFocusChange: number;
  } {
    return {
      tabCount: this.tabStates.size,
      focusedTabId: this.focusContext.focusedTabId,
      focusedWindowId: this.focusContext.focusedWindowId,
      activeTimeTabs: this.getActiveTimeTabs(),
      lastFocusChange: this.focusContext.lastFocusChange,
    };
  }
}
