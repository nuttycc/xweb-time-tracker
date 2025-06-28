/**
 * Type-safe mock helpers for testing
 *
 * Provides utilities to create properly typed mocks without using 'any' or 'unknown'
 */

import { vi } from 'vitest';
import type { StartupRecovery } from '../../src/core/tracker/recovery/StartupRecovery';
import type { EventQueue } from '../../src/core/tracker/queue/EventQueue';
import type { CheckpointScheduler } from '../../src/core/tracker/scheduler/CheckpointScheduler';
import type { FocusStateManager } from '../../src/core/tracker/state/FocusStateManager';
import type { InteractionDetector } from '../../src/core/tracker/messaging/InteractionDetector';

/**
 * Creates a type-safe mock of the StartupRecovery component for testing.
 *
 * The returned mock includes a stubbed `executeRecovery` method that resolves to a default recovery result object.
 * @returns A partial mock of StartupRecovery with predefined method behavior.
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
 * Creates a type-safe mock of the EventQueue for testing purposes.
 *
 * The returned mock provides stubbed implementations of `flush`, `enqueue`, and `size` methods, simulating asynchronous behavior and default values.
 *
 * @returns A partial mock object of EventQueue with methods suitable for use in tests
 */
export function createMockEventQueue(): Partial<EventQueue> {
  return {
    flush: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
    size: vi.fn().mockReturnValue(0),
  };
}

/**
 * Creates a type-safe mock of the CheckpointScheduler with stubbed asynchronous methods.
 *
 * @returns A partial mock object with `initialize` and `stop` methods that resolve to undefined.
 */
export function createMockCheckpointScheduler(): Partial<CheckpointScheduler> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a type-safe mock of the FocusStateManager for testing purposes.
 *
 * The returned mock provides stubbed methods for managing and querying tab focus state, with default return values suitable for isolated tests.
 *
 * @returns A partial mock implementation of FocusStateManager with all methods stubbed.
 */
export function createMockFocusStateManager(): Partial<FocusStateManager> {
  return {
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

/**
 * Creates a type-safe mock of the InteractionDetector with the initialize method stubbed.
 *
 * @returns A partial mock object for InteractionDetector suitable for testing.
 */
export function createMockInteractionDetector(): Partial<InteractionDetector> {
  return {
    initialize: vi.fn(),
  };
}
