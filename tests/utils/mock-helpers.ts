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
 * Create a type-safe mock for StartupRecovery
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
 * Create a type-safe mock for EventQueue
 */
export function createMockEventQueue(): Partial<EventQueue> {
  return {
    flush: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
    size: vi.fn().mockReturnValue(0),
  };
}

/**
 * Create a type-safe mock for CheckpointScheduler
 */
export function createMockCheckpointScheduler(): Partial<CheckpointScheduler> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a type-safe mock for FocusStateManager
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
 * Create a type-safe mock for InteractionDetector
 */
export function createMockInteractionDetector(): Partial<InteractionDetector> {
  return {
    initialize: vi.fn(),
  };
}
