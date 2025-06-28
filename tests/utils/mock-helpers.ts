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
 * Returns a partial mock of FocusStateManager with stubbed methods for testing.
 *
 * The mock provides default behaviors for focus state management methods, returning `null` or default context values as appropriate.
 *
 * @returns A partial FocusStateManager mock with all methods stubbed for isolated unit tests.
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
