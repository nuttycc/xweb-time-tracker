/**
 * Event Types Test Helper
 *
 * This module provides type-safe constants and utilities for testing event types,
 * eliminating the need for manual string literals in test files.
 */

import {
  EVENT_TYPES,
  RESOLUTION_TYPES,
  type EventType,
  type ResolutionType,
} from '@/core/db/models';

/**
 * Event type constants for tests with descriptive names
 *
 * Provides easy access to event type constants with clear, readable names
 * that improve test readability and maintainability.
 */
export const TEST_EVENT_TYPES = {
  /** Open time tracking start event */
  OPEN_TIME_START: EVENT_TYPES[0],
  /** Open time tracking end event */
  OPEN_TIME_END: EVENT_TYPES[1],
  /** Active time tracking start event */
  ACTIVE_TIME_START: EVENT_TYPES[2],
  /** Active time tracking end event */
  ACTIVE_TIME_END: EVENT_TYPES[3],
  /** Checkpoint event for activity tracking */
  CHECKPOINT: EVENT_TYPES[4],
} as const;

/**
 * Resolution type constants for tests
 */
export const TEST_RESOLUTION_TYPES = {
  /** Crash recovery resolution marker */
  CRASH_RECOVERY: RESOLUTION_TYPES[0],
} as const;

/**
 * Type-safe event type selector
 *
 * Provides compile-time type checking for event type selection.
 * Useful when you need to ensure an event type is valid.
 *
 * @param type - The event type to validate and return
 * @returns The same event type, but with compile-time validation
 */
export const selectEventType = (type: EventType): EventType => type;

/**
 * Type-safe resolution type selector
 *
 * @param type - The resolution type to validate and return
 * @returns The same resolution type, but with compile-time validation
 */
export const selectResolutionType = (type: ResolutionType): ResolutionType => type;

/**
 * Get a random event type for testing
 *
 * Useful for generating varied test data while maintaining type safety.
 *
 * @returns A randomly selected event type
 */
export const getRandomEventType = (): EventType => {
  const randomIndex = Math.floor(Math.random() * EVENT_TYPES.length);
  return EVENT_TYPES[randomIndex];
};

/**
 * Get all event types as an array
 *
 * Useful for iteration in tests, such as testing all event types
 * or generating comprehensive test data.
 *
 * @returns Array of all available event types
 */
export const getAllEventTypes = (): readonly EventType[] => EVENT_TYPES;

/**
 * Check if a string is a valid event type
 *
 * Useful for testing validation logic or user input handling.
 *
 * @param value - The string to check
 * @returns True if the string is a valid event type
 */
export const isValidEventType = (value: string): value is EventType => {
  return EVENT_TYPES.includes(value as EventType);
};

/**
 * Event type pairs for testing start/end scenarios
 *
 * Provides commonly used event type pairs for testing
 * time tracking scenarios.
 */
export const EVENT_TYPE_PAIRS = {
  /** Open time start/end pair */
  OPEN_TIME: {
    START: TEST_EVENT_TYPES.OPEN_TIME_START,
    END: TEST_EVENT_TYPES.OPEN_TIME_END,
  },
  /** Active time start/end pair */
  ACTIVE_TIME: {
    START: TEST_EVENT_TYPES.ACTIVE_TIME_START,
    END: TEST_EVENT_TYPES.ACTIVE_TIME_END,
  },
} as const;

/**
 * Common event type sequences for testing
 *
 * Provides predefined sequences of events that are commonly
 * used in integration and scenario testing.
 */
export const EVENT_SEQUENCES = {
  /** Basic open time tracking sequence */
  BASIC_OPEN_TIME: [TEST_EVENT_TYPES.OPEN_TIME_START, TEST_EVENT_TYPES.OPEN_TIME_END],
  /** Basic active time tracking sequence */
  BASIC_ACTIVE_TIME: [TEST_EVENT_TYPES.ACTIVE_TIME_START, TEST_EVENT_TYPES.ACTIVE_TIME_END],
  /** Active time with checkpoint sequence */
  ACTIVE_TIME_WITH_CHECKPOINT: [
    TEST_EVENT_TYPES.ACTIVE_TIME_START,
    TEST_EVENT_TYPES.CHECKPOINT,
    TEST_EVENT_TYPES.ACTIVE_TIME_END,
  ],
  /** Complex tracking sequence */
  COMPLEX_TRACKING: [
    TEST_EVENT_TYPES.OPEN_TIME_START,
    TEST_EVENT_TYPES.ACTIVE_TIME_START,
    TEST_EVENT_TYPES.CHECKPOINT,
    TEST_EVENT_TYPES.ACTIVE_TIME_END,
    TEST_EVENT_TYPES.OPEN_TIME_END,
  ],
} as const;
