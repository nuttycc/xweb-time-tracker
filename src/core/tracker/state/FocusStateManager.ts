/**
 * Focus State Manager
 *
 * Implements the core state management class that maintains the "single focus" principle.
 * This class tracks the state of all browser tabs using a Map<tabId, TabState> structure.
 * It provides methods for focus management, tab state transitions, and ensures only one
 * tab can be considered "focused" at any time according to LLD specifications.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { TabState, TabStateSchema, FocusContext, FocusContextSchema } from '../types';

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
 * Focus State Manager Class
 *
 * Manages the single-focus principle for time tracking by maintaining
 * real-time state of all browser tabs and ensuring accurate focus tracking.
 */
export class FocusStateManager {
  /** Map of tab ID to tab state */
  private tabStates: Map<number, TabState> = new Map();

  /** Current focus context */
  private focusContext: FocusContext = {
    focusedTabId: null,
    focusedWindowId: null,
    lastFocusChange: Date.now(),
  };

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
   * Creates a new tab state
   *
   * @param tabId - Tab ID
   * @param initialState - Initial tab state data
   * @param windowId - Window ID containing the tab
   */
  createTabState(
    tabId: number,
    initialState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'>,
    windowId: number
  ): void {
    const tabState: TabState = {
      ...initialState,
      isFocused: this.focusContext.focusedTabId === tabId,
      tabId,
      windowId,
    };

    // Validate the new state
    TabStateSchema.parse(tabState);

    this.tabStates.set(tabId, tabState);
  }

  /**
   * Updates an existing tab state
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

    this.tabStates.set(tabId, newState);
  }

  /**
   * Gets a tab state by ID
   *
   * @param tabId - Tab ID
   * @returns Tab state or undefined if not found
   */
  getTabState(tabId: number): TabState | undefined {
    return this.tabStates.get(tabId);
  }

  /**
   * Gets all tab states
   *
   * @returns Map of all tab states
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
   * @param timestamp - Interaction timestamp
   */
  updateLastInteraction(tabId: number, timestamp: number = Date.now()): void {
    const tabState = this.tabStates.get(tabId);
    if (tabState) {
      this.updateTabState(
        tabId,
        {
          lastInteractionTimestamp: timestamp,
        },
        { validate: false }
      );
    }
  }

  /**
   * Starts active time tracking for a tab
   *
   * @param tabId - Tab ID
   * @param activityId - Unique activity ID
   * @param timestamp - Start timestamp
   */
  startActiveTime(tabId: number, activityId: string, timestamp: number = Date.now()): void {
    this.updateTabState(
      tabId,
      {
        activityId,
        activeTimeStart: timestamp,
        lastInteractionTimestamp: timestamp,
      },
      { validate: false }
    );
  }

  /**
   * Stops active time tracking for a tab
   *
   * @param tabId - Tab ID
   */
  stopActiveTime(tabId: number): void {
    this.updateTabState(
      tabId,
      {
        activityId: null,
        activeTimeStart: null,
      },
      { validate: false }
    );
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * Adds a focus change event listener
   *
   * @param listener - Event listener function
   */
  onFocusChange(listener: (event: FocusChangeEvent) => void): void {
    this.focusChangeListeners.push(listener);
  }

  /**
   * Removes a focus change event listener
   *
   * @param listener - Event listener function to remove
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
   * @param event - Focus change event data
   */
  private notifyFocusChange(event: FocusChangeEvent): void {
    this.focusChangeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in focus change listener:', error);
      }
    });
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

    for (const [tabId, state] of this.tabStates) {
      if (state.activityId !== null && state.activeTimeStart !== null) {
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
   * Validates the current state consistency
   *
   * @returns True if state is consistent, false otherwise
   */
  validateStateConsistency(): boolean {
    try {
      // Validate focus context
      FocusContextSchema.parse(this.focusContext);

      // Validate all tab states
      for (const [tabId, state] of this.tabStates) {
        TabStateSchema.parse(state);

        // Check focus consistency
        if (state.isFocused && this.focusContext.focusedTabId !== tabId) {
          return false;
        }

        if (!state.isFocused && this.focusContext.focusedTabId === tabId) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('State validation error:', error);
      return false;
    }
  }

  /**
   * Clears all state (useful for testing and reset scenarios)
   */
  clearAllState(): void {
    this.tabStates.clear();
    this.focusContext = {
      focusedTabId: null,
      focusedWindowId: null,
      lastFocusChange: Date.now(),
    };
    this.focusChangeListeners.length = 0;
  }

  /**
   * Gets debug information about current state
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
