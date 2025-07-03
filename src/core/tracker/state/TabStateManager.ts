/**
 * Tab State Manager
 *
 * Implements the core state management class that maintains the "single focus" principle.
 * This class tracks the state of all browser tabs using a dual-layer storage architecture:
 * - Memory cache (Map) for fast read operations
 * - Persistent storage (chrome.storage.local) for data safety
 * It provides methods for focus management, tab state transitions, and ensures only one
 * tab can be considered "focused" at any time according to LLD specifications.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { TabState, TabStateSchema, FocusContext, FocusContextSchema } from '../types';
import { TabStateStorageUtils, type TabStateStorageData } from '../storage/TabStateStorage';
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
 * real-time state of all browser tabs using dual-layer storage architecture.
 * Provides fast memory access with persistent storage backup.
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
  private static readonly logger = createLogger('TabStateManager');

  /**
   * Syncs all current memory state to persistent storage
   *
   * @private
   */
  private async syncToPersistentStorage(): Promise<void> {
    try {
      // Convert Map to Record for storage
      const storageData: TabStateStorageData = {};
      for (const [tabId, tabState] of this.tabStates) {
        storageData[tabId] = tabState;
      }

      await TabStateStorageUtils.saveAllTabStates(storageData);

      TabStateManager.logger.debug('Synced tab states to persistent storage', {
        tabCount: this.tabStates.size,
      });
    } catch (error) {
      TabStateManager.logger.error('Failed to sync to persistent storage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

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
   * Creates a new tab state with dual-layer storage
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

    // Validate the new state if requested
    if (validate) {
      TabStateSchema.parse(tabState);
    }

    // Update memory cache immediately
    this.tabStates.set(tabId, tabState);

    // Sync to persistent storage (fire-and-forget for performance)
    this.syncToPersistentStorage().catch((error: unknown) => {
      TabStateManager.logger.error('Failed to sync tab state creation to persistent storage', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Creates a new tab state with dual-layer storage (async version)
   *
   * Use this when you need to ensure the persistent storage operation completes.
   *
   * @param tabId - Tab ID
   * @param initialState - Initial tab state data
   * @param windowId - Window ID containing the tab
   * @param options - Creation options
   */
  async createTabStateAsync(
    tabId: number,
    initialState: Omit<TabState, 'isFocused' | 'tabId' | 'windowId'>,
    windowId: number,
    options: TabStateUpdateOptions = {}
  ): Promise<void> {
    const { validate = true } = options;
    const tabState: TabState = {
      ...initialState,
      isFocused: this.focusContext.focusedTabId === tabId,
      tabId,
      windowId,
    };

    // Validate the new state if requested
    if (validate) {
      TabStateSchema.parse(tabState);
    }

    // Update memory cache immediately
    this.tabStates.set(tabId, tabState);

    // Sync to persistent storage and wait for completion
    await this.syncToPersistentStorage();
  }

  /**
   * Updates an existing tab state with dual-layer storage
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

    // Update memory cache immediately
    this.tabStates.set(tabId, newState);

    // Sync to persistent storage (fire-and-forget for performance)
    this.syncToPersistentStorage().catch((error: unknown) => {
      TabStateManager.logger.error('Failed to sync tab state update to persistent storage', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Updates an existing tab state with dual-layer storage (async version)
   *
   * Use this when you need to ensure the persistent storage operation completes.
   *
   * @param tabId - Tab ID to update
   * @param updates - Partial updates to apply
   * @param options - Update options
   */
  async updateTabStateAsync(
    tabId: number,
    updates: Partial<TabState>,
    options: TabStateUpdateOptions = {}
  ): Promise<void> {
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

    // Update memory cache immediately
    this.tabStates.set(tabId, newState);

    // Sync to persistent storage and wait for completion
    await this.syncToPersistentStorage();
  }

  /**
   * Gets a tab state by ID using dual-layer storage
   *
   * First checks memory cache, then falls back to persistent storage if needed.
   * If found in persistent storage, updates memory cache for future reads.
   *
   * @param tabId - Tab ID
   * @returns Tab state or undefined if not found
   */
  getTabState(tabId: number): TabState | undefined {
    // First check memory cache (fast path)
    const memoryState = this.tabStates.get(tabId);
    if (memoryState) {
      return memoryState;
    }

    // Memory cache miss - this is unusual in normal operation
    // Log for debugging but don't block the operation
    TabStateManager.logger.debug('Memory cache miss for tab state', { tabId });

    // Return undefined - persistent storage fallback will be handled by async methods
    // Synchronous getTabState cannot wait for async storage operations
    return undefined;
  }

  /**
   * Gets a tab state by ID with persistent storage fallback (async version)
   *
   * This method can perform async operations to check persistent storage.
   * Use this when you can handle async operations and want full dual-layer support.
   *
   * @param tabId - Tab ID
   * @returns Promise<TabState | undefined>
   */
  async getTabStateAsync(tabId: number): Promise<TabState | undefined> {
    // First check memory cache (fast path)
    const memoryState = this.tabStates.get(tabId);
    if (memoryState) {
      return memoryState;
    }

    // Memory cache miss - check persistent storage
    try {
      const persistentData = await TabStateStorageUtils.getAllTabStates();
      const persistentState = persistentData[tabId];

      if (persistentState) {
        // Found in persistent storage - update memory cache
        this.tabStates.set(tabId, persistentState);
        TabStateManager.logger.debug('Restored tab state from persistent storage', { tabId });
        return persistentState;
      }
    } catch (error) {
      TabStateManager.logger.error('Failed to read from persistent storage', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return undefined;
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
   * Gets all tab states with persistent storage fallback (async version)
   *
   * Combines memory cache with persistent storage data.
   * Memory cache takes precedence for tabs that exist in both.
   *
   * @returns Promise<Map<number, TabState>>
   */
  async getAllTabStatesAsync(): Promise<Map<number, TabState>> {
    try {
      // Start with memory cache
      const result = new Map(this.tabStates);

      // Get persistent storage data
      const persistentData = await TabStateStorageUtils.getAllTabStates();

      // Add any tab states from persistent storage that aren't in memory
      for (const [tabIdStr, tabState] of Object.entries(persistentData)) {
        const tabId = parseInt(tabIdStr, 10);
        if (!result.has(tabId)) {
          result.set(tabId, tabState);
          // Also update memory cache for future reads
          this.tabStates.set(tabId, tabState);
        }
      }

      TabStateManager.logger.debug('Combined tab states from memory and persistent storage', {
        memoryCount: this.tabStates.size,
        persistentCount: Object.keys(persistentData).length,
        totalCount: result.size,
      });

      return result;
    } catch (error) {
      TabStateManager.logger.error('Failed to get all tab states from persistent storage', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to memory cache only
      return new Map(this.tabStates);
    }
  }

  /**
   * Clears a tab state and handles focus cleanup with dual-layer storage
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

    // Sync to persistent storage (fire-and-forget for performance)
    this.syncToPersistentStorage().catch((error: unknown) => {
      TabStateManager.logger.error('Failed to sync tab state removal to persistent storage', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Clears a tab state and handles focus cleanup with dual-layer storage (async version)
   *
   * Use this when you need to ensure the persistent storage operation completes.
   *
   * @param tabId - Tab ID to clear
   */
  async clearTabStateAsync(tabId: number): Promise<void> {
    // Remove from memory cache
    this.tabStates.delete(tabId);

    // Clear focus if this was the focused tab
    if (this.focusContext.focusedTabId === tabId) {
      this.clearFocus();
    }

    // Sync to persistent storage and wait for completion
    await this.syncToPersistentStorage();
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
   * Loads all tab states from persistent storage into memory cache
   *
   * This method is typically called during initialization to restore
   * previously saved tab states.
   *
   * @returns Promise<number> - Number of tab states loaded
   */
  async loadFromPersistentStorage(): Promise<number> {
    try {
      const persistentData = await TabStateStorageUtils.getAllTabStates();
      let loadedCount = 0;

      for (const [tabIdStr, tabState] of Object.entries(persistentData)) {
        const tabId = parseInt(tabIdStr, 10);
        this.tabStates.set(tabId, tabState);
        loadedCount++;
      }

      TabStateManager.logger.info('Loaded tab states from persistent storage', {
        loadedCount,
        totalMemoryStates: this.tabStates.size,
      });

      return loadedCount;
    } catch (error) {
      TabStateManager.logger.error('Failed to load tab states from persistent storage', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
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
   * Clears all state including persistent storage
   */
  async clearAllStateIncludingPersistent(): Promise<void> {
    // Clear memory cache
    this.clearAllState();

    // Clear persistent storage
    try {
      await TabStateStorageUtils.clearAllTabStates();
      TabStateManager.logger.info('Cleared all tab states including persistent storage');
    } catch (error) {
      TabStateManager.logger.error('Failed to clear persistent storage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Forces synchronization of all current memory state to persistent storage
   *
   * This is a public method for use during initialization or other critical moments
   * when you need to ensure all state is persisted.
   */
  async forceSyncToPersistentStorage(): Promise<void> {
    await this.syncToPersistentStorage();
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
