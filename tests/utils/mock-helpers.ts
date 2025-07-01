/**
 * Type-safe mock helpers for testing
 *
 * Provides utilities to create properly typed mocks without using 'any' or 'unknown'
 */

import { vi } from 'vitest';
import type { StartupRecovery } from '../../src/core/tracker/recovery/StartupRecovery';
import type { EventQueue } from '../../src/core/tracker/queue/EventQueue';
import type { CheckpointScheduler } from '../../src/core/tracker/scheduler/CheckpointScheduler';
import type { TabStateManager } from '../../src/core/tracker/state/TabStateManager';
import type { InteractionDetector } from '../../src/core/tracker/messaging/InteractionDetector';
import type { BrowserEventData } from '../../src/core/tracker';

/**
 * Returns a partial mock of the StartupRecovery component with a stubbed `executeRecovery` method.
 *
 * The mock's `executeRecovery` method asynchronously resolves to a default recovery result with zeroed statistics, current timestamps, and no errors.
 * @returns A partial mock of StartupRecovery suitable for unit testing.
 */
export function createMockStartupRecovery(): Partial<StartupRecovery> {
  return {
    executeRecovery: vi.fn().mockResolvedValue({
      orphanSessionsFound: 0,
      recoveryEventsGenerated: 0,
      currentTabsInitialized: 0,
      recoveryStartTime: Date.now(),
      recoveryCompletionTime: Date.now(),
      errors: [],
    }),
  };
}

/**
 * Returns a partial mock of the EventQueue with stubbed methods for testing.
 *
 * The mock provides asynchronous `flush` and `enqueue` methods that resolve to `undefined`, and a synchronous `size` method that returns `0`.
 *
 * @returns A partial EventQueue mock suitable for unit tests
 */
export function createMockEventQueue(): Partial<EventQueue> {
  return {
    flush: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
    size: vi.fn().mockReturnValue(0),
  };
}

/**
 * Returns a partial mock of the CheckpointScheduler with stubbed asynchronous `initialize` and `stop` methods.
 *
 * The returned mock is suitable for unit testing scenarios where the actual behavior of the CheckpointScheduler is not required.
 *
 * @returns A partial CheckpointScheduler mock with `initialize` and `stop` methods that resolve to undefined.
 */
export function createMockCheckpointScheduler(): Partial<CheckpointScheduler> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Returns a partial mock of TabStateManager with stubbed methods for testing.
 *
 * The mock provides default behaviors for focus state management methods, returning `null` or default context values as appropriate.
 *
 * @returns A partial TabStateManager mock with all methods stubbed for isolated unit tests.
 */
export function createMockTabStateManager(): Partial<TabStateManager> {
  return {
    createTabState: vi.fn(),
    setFocusedTab: vi.fn(),
    getTabState: vi.fn().mockReturnValue(null),
    getFocusedTab: vi.fn().mockReturnValue(null),
    getFocusContext: vi.fn().mockReturnValue({
      focusedTabId: null,
      focusedWindowId: null,
      lastFocusChange: Date.now(),
    }),
    updateTabState: vi.fn(),
    clearTabState: vi.fn(),
  };
}

// ============================================================================
// Browser Event Simulation Helpers
// ============================================================================

interface SimulateTabActivationOptions {
  tabId: number;
  windowId?: number;
  timestamp?: number;
}

interface SimulateNavigationOptions {
  tabId: number;
  url: string;
  timestamp?: number;
}

interface SimulateUserInteractionOptions {
  tabId: number;
  type: 'click' | 'keydown' | 'scroll' | 'mousemove';
  timestamp?: number;
}

/**
 * Creates a tab activation event for testing
 */
export function createTabActivationEvent(options: SimulateTabActivationOptions): BrowserEventData {
  return {
    type: 'tab-activated',
    tabId: options.tabId,
    windowId: options.windowId || 1,
    timestamp: options.timestamp || Date.now(),
  };
}

/**
 * Creates a web navigation committed event for testing
 */
export function createNavigationEvent(options: SimulateNavigationOptions): BrowserEventData {
  return {
    type: 'web-navigation-committed',
    tabId: options.tabId,
    url: options.url,
    timestamp: options.timestamp || Date.now(),
  };
}

/**
 * Creates a user interaction event for testing
 */
export function createUserInteractionEvent(options: SimulateUserInteractionOptions): BrowserEventData {
  return {
    type: 'user-interaction',
    tabId: options.tabId,
    interaction: {
      type: options.type,
      timestamp: options.timestamp || Date.now(),
      tabId: options.tabId,
    },
    timestamp: options.timestamp || Date.now(),
  };
}

/**
 * High-level helper to simulate tab activation
 */
export async function simulateTabActivation(
  timeTracker: { handleBrowserEvent: (event: BrowserEventData) => Promise<void> },
  options: SimulateTabActivationOptions
): Promise<void> {
  const event = createTabActivationEvent(options);
  await timeTracker.handleBrowserEvent(event);
}

/**
 * High-level helper to simulate web navigation
 */
export async function simulateNavigation(
  timeTracker: { handleBrowserEvent: (event: BrowserEventData) => Promise<void> },
  options: SimulateNavigationOptions
): Promise<void> {
  const event = createNavigationEvent(options);
  await timeTracker.handleBrowserEvent(event);
}

/**
 * High-level helper to simulate user interaction
 */
export async function simulateUserInteraction(
  timeTracker: { handleBrowserEvent: (event: BrowserEventData) => Promise<void> },
  options: SimulateUserInteractionOptions
): Promise<void> {
  const event = createUserInteractionEvent(options);
  await timeTracker.handleBrowserEvent(event);
}

// ============================================================================
// Deterministic Waiting Utilities
// ============================================================================

interface WaitForEventsOptions {
  /** Expected minimum number of events */
  expectedCount: number;
  /** Maximum time to wait in milliseconds (default: 5000) */
  timeout?: number;
  /** Polling interval in milliseconds (default: 10) */
  pollInterval?: number;
  /** Optional filter function to count only specific events */
  filter?: (event: unknown) => boolean;
}

/**
 * Waits for a specific number of events to appear in the database
 * This replaces setTimeout with deterministic polling
 */
export async function waitForEvents(
  database: { eventslog: { orderBy: (field: string) => { reverse: () => { toArray: () => Promise<unknown[]> } } } },
  options: WaitForEventsOptions
): Promise<unknown[]> {
  const { expectedCount, timeout = 5000, pollInterval = 10, filter } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const allEvents = await database.eventslog.orderBy('timestamp').reverse().toArray();
      const relevantEvents = filter ? allEvents.filter(filter) : allEvents;
      
      if (relevantEvents.length >= expectedCount) {
        return relevantEvents;
      }
    } catch {
      // Continue polling even if database query fails temporarily
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout reached, get final count for error message
  const finalEvents = await database.eventslog.orderBy('timestamp').reverse().toArray();
  const finalRelevantEvents = filter ? finalEvents.filter(filter) : finalEvents;
  
  throw new Error(
    `Timeout waiting for events. Expected: ${expectedCount}, Found: ${finalRelevantEvents.length}, Timeout: ${timeout}ms`
  );
}

/**
 * Waits for events from specific tabs
 */
export async function waitForTabEvents(
  database: { eventslog: { orderBy: (field: string) => { reverse: () => { toArray: () => Promise<unknown[]> } } } },
  tabIds: number[],
  expectedCount: number,
  options: Omit<WaitForEventsOptions, 'expectedCount' | 'filter'> = {}
): Promise<unknown[]> {
  return waitForEvents(database, {
    ...options,
    expectedCount,
    filter: (event) => event && typeof event === 'object' && 'tabId' in event && tabIds.includes((event as { tabId: number }).tabId),
  });
}

/**
 * Waits for specific event types
 */
export async function waitForEventTypes(
  database: { eventslog: { orderBy: (field: string) => { reverse: () => { toArray: () => Promise<unknown[]> } } } },
  eventTypes: string[],
  expectedCount: number,
  options: Omit<WaitForEventsOptions, 'expectedCount' | 'filter'> = {}
): Promise<unknown[]> {
  return waitForEvents(database, {
    ...options,
    expectedCount,
    filter: (event) => event && typeof event === 'object' && 'eventType' in event && eventTypes.includes((event as { eventType: string }).eventType),
  });
}

/**
 * Returns a partial mock of the InteractionDetector with the initialize method stubbed for testing.
 *
 * The mock provides a no-op implementation of the initialize method using Vitest's mocking utilities.
 *
 * @returns A partial InteractionDetector mock with stubbed methods.
 */
export function createMockInteractionDetector(): Partial<InteractionDetector> {
  return {
    initialize: vi.fn(),
  };
}
