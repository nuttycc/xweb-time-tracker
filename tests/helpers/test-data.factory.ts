/**
 * Test Data Factory
 *
 * This module provides factory functions for creating test data with type safety
 * and sensible defaults, eliminating manual object construction in tests.
 */

import type { EventsLogRecord } from '@/core/db/schemas';
import { TEST_EVENT_TYPES, TEST_RESOLUTION_TYPES } from './event-types.helper';

/**
 * Default test event data
 *
 * Provides sensible defaults for all required fields to minimize
 * boilerplate in test files.
 */
const DEFAULT_EVENT_DATA: EventsLogRecord = {
  id: 1,
  timestamp: Date.now(),
  eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
  tabId: 123,
  url: 'https://example.com',
  visitId: 'visit-123',
  activityId: 'activity-456',
  isProcessed: 0,
  resolution: undefined,
};

/**
 * Create a test event with type-safe overrides
 *
 * Improved version of the original createTestEvent function with:
 * - Type-safe event type constants
 * - Better default values
 * - Comprehensive documentation
 *
 * @param overrides - Partial event data to override defaults
 * @returns Complete EventsLogRecord for testing
 */
export const createTestEvent = (overrides: Partial<EventsLogRecord> = {}): EventsLogRecord => ({
  ...DEFAULT_EVENT_DATA,
  ...overrides,
});

/**
 * Create an open time start event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with open_time_start type
 */
export const createOpenTimeStartEvent = (
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord =>
  createTestEvent({
    eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
    ...overrides,
  });

/**
 * Create an open time end event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with open_time_end type
 */
export const createOpenTimeEndEvent = (overrides: Partial<EventsLogRecord> = {}): EventsLogRecord =>
  createTestEvent({
    eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
    ...overrides,
  });

/**
 * Create an active time start event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with active_time_start type
 */
export const createActiveTimeStartEvent = (
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord =>
  createTestEvent({
    eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
    ...overrides,
  });

/**
 * Create an active time end event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with active_time_end type
 */
export const createActiveTimeEndEvent = (
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord =>
  createTestEvent({
    eventType: TEST_EVENT_TYPES.ACTIVE_TIME_END,
    ...overrides,
  });

/**
 * Create a checkpoint event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with checkpoint type
 */
export const createCheckpointEvent = (overrides: Partial<EventsLogRecord> = {}): EventsLogRecord =>
  createTestEvent({
    eventType: TEST_EVENT_TYPES.CHECKPOINT,
    ...overrides,
  });

/**
 * Create a crash recovery event
 *
 * @param overrides - Additional properties to override
 * @returns EventsLogRecord with crash_recovery resolution
 */
export const createCrashRecoveryEvent = (
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord =>
  createTestEvent({
    resolution: TEST_RESOLUTION_TYPES.CRASH_RECOVERY,
    ...overrides,
  });

/**
 * Create a pair of open time events (start and end)
 *
 * @param baseData - Common data for both events
 * @param timeDiff - Time difference between start and end (default: 1000ms)
 * @returns Array with [startEvent, endEvent]
 */
export const createOpenTimePair = (
  baseData: Partial<EventsLogRecord> = {},
  timeDiff: number = 1000
): [EventsLogRecord, EventsLogRecord] => {
  const startTime = baseData.timestamp || Date.now();

  const startEvent = createOpenTimeStartEvent({
    ...baseData,
    timestamp: startTime,
  });

  const endEvent = createOpenTimeEndEvent({
    ...baseData,
    timestamp: startTime + timeDiff,
    id: (baseData.id || 1) + 1,
  });

  return [startEvent, endEvent];
};

/**
 * Create a pair of active time events (start and end)
 *
 * @param baseData - Common data for both events
 * @param timeDiff - Time difference between start and end (default: 1000ms)
 * @returns Array with [startEvent, endEvent]
 */
export const createActiveTimePair = (
  baseData: Partial<EventsLogRecord> = {},
  timeDiff: number = 1000
): [EventsLogRecord, EventsLogRecord] => {
  const startTime = baseData.timestamp || Date.now();

  const startEvent = createActiveTimeStartEvent({
    ...baseData,
    timestamp: startTime,
  });

  const endEvent = createActiveTimeEndEvent({
    ...baseData,
    timestamp: startTime + timeDiff,
    id: (baseData.id || 1) + 1,
  });

  return [startEvent, endEvent];
};

/**
 * Create multiple active time pairs for different activities
 *
 * @param activities - Array of activity configurations
 * @returns Flattened array of all activity events
 */
export const createMultipleActivities = (
  activities: Array<{
    activityId: string;
    startTime: number;
    duration: number;
    baseData?: Partial<EventsLogRecord>;
  }>
): EventsLogRecord[] => {
  let currentId = 1;

  return activities.flatMap(({ activityId, startTime, duration, baseData = {} }) => {
    const pair = createActiveTimePair(
      {
        ...baseData,
        activityId,
        timestamp: startTime,
        id: currentId,
      },
      duration
    );

    currentId += 2; // Increment by 2 for start and end events
    return pair;
  });
};

/**
 * Create a sequence of events with automatic ID and timestamp progression
 *
 * @param eventTypes - Array of event types to create
 * @param baseData - Common data for all events
 * @param timeStep - Time increment between events (default: 1000ms)
 * @returns Array of EventsLogRecord objects
 */
export const createEventSequence = (
  eventTypes: readonly (typeof TEST_EVENT_TYPES)[keyof typeof TEST_EVENT_TYPES][],
  baseData: Partial<EventsLogRecord> = {},
  timeStep: number = 1000
): EventsLogRecord[] => {
  const startTime = baseData.timestamp || Date.now();
  const startId = baseData.id || 1;

  return eventTypes.map((eventType, index) =>
    createTestEvent({
      ...baseData,
      id: startId + index,
      timestamp: startTime + index * timeStep,
      eventType,
    })
  );
};
