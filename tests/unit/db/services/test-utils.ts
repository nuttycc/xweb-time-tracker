/**
 * Services Layer Test Utilities
 *
 * Provides mock factories, test data generators, and utility functions
 * for testing Services layer components with type safety.
 *
 * Note: For generateTestDatabaseName function, import from '../utils/test-utils'
 * Usage: import { generateTestDatabaseName } from '../utils/test-utils';
 *        const dbName = generateTestDatabaseName('Services');
 */

import { vi, expect } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';
import type {
  EventsLogRepository,
  AggregatedStatsRepository,
  TimeAggregationData,
} from '@/db/repositories';
import type { EventsLogRecord } from '@/db/schemas/eventslog.schema';
import type { CreateEventsLogRecord } from '@/db/models/eventslog.model';
import type { AggregatedStatsRecord } from '@/db/models/aggregatedstats.model';
import type { RepositoryOptions } from '@/db/repositories';
import { getUtcDateString } from '@/db/schemas/aggregatedstats.schema';

/**
 * Returns a fully mocked instance of EventsLogRepository for use in tests.
 *
 * All repository methods are replaced with mock implementations.
 *
 * @returns A mock proxy of EventsLogRepository
 */
export function createMockEventsLogRepository(): MockProxy<EventsLogRepository> {
  return mock<EventsLogRepository>();
}

/**
 * Returns a fully mocked instance of AggregatedStatsRepository for use in tests.
 *
 * All repository methods are replaced with mock implementations.
 * @returns A mock AggregatedStatsRepository
 */
export function createMockAggregatedStatsRepository(): MockProxy<AggregatedStatsRepository> {
  return mock<AggregatedStatsRepository>();
}

/**
 * Generates a test `EventsLogRecord` object with default values, allowing optional field overrides.
 *
 * @param overrides - Fields to override in the generated `EventsLogRecord`
 * @returns A populated `EventsLogRecord` suitable for testing
 */
export function createTestEventsLogRecord(
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord {
  const timestamp = Date.now();
  const baseRecord: EventsLogRecord = {
    id: Math.floor(Math.random() * 10000),
    timestamp,
    eventType: 'checkpoint',
    tabId: 1,
    url: 'https://example.com/test-page',
    visitId: '550e8400-e29b-41d4-a716-446655440000',
    activityId: '550e8400-e29b-41d4-a716-446655440001',
    isProcessed: 0,
    ...overrides,
  };

  return baseRecord;
}

/**
 * Generates a test `CreateEventsLogRecord` object with default values, allowing optional overrides.
 *
 * @param overrides - Fields to override in the generated record
 * @returns A `CreateEventsLogRecord` suitable for use in tests
 */
export function createTestCreateEventsLogRecord(
  overrides: Partial<CreateEventsLogRecord> = {}
): CreateEventsLogRecord {
  const timestamp = Date.now();
  const baseRecord: CreateEventsLogRecord = {
    timestamp,
    eventType: 'checkpoint',
    tabId: 1,
    url: 'https://example.com/test-page',
    visitId: '550e8400-e29b-41d4-a716-446655440000',
    activityId: '550e8400-e29b-41d4-a716-446655440001',
    isProcessed: 0,
    ...overrides,
  };

  return baseRecord;
}

/**
 * Generates a test `AggregatedStatsRecord` object with default values, allowing optional overrides.
 *
 * @param overrides - Fields to override in the generated record
 * @returns A populated `AggregatedStatsRecord` for use in tests
 */
export function createTestAggregatedStatsRecord(
  overrides: Partial<AggregatedStatsRecord> = {}
): AggregatedStatsRecord {
  const today = getUtcDateString();
  const baseRecord: AggregatedStatsRecord = {
    key: `${today}:https://example.com/test-page`,
    date: today,
    url: 'https://example.com/test-page',
    hostname: 'example.com',
    parentDomain: 'example.com',
    total_open_time: 10000,
    total_active_time: 5000,
    last_updated: Date.now(),
    ...overrides,
  };

  return baseRecord;
}

/**
 * Generates a test `TimeAggregationData` object with default values, allowing optional overrides.
 *
 * @param overrides - Optional properties to override the default test data
 * @returns A `TimeAggregationData` object populated with test values
 */
export function createTestTimeAggregationData(
  overrides: Partial<TimeAggregationData> = {}
): TimeAggregationData {
  const baseData: TimeAggregationData = {
    date: getUtcDateString(),
    url: 'https://example.com/test-page',
    hostname: 'example.com',
    parentDomain: 'example.com',
    openTimeToAdd: 1000,
    activeTimeToAdd: 500,
    ...overrides,
  };

  return baseData;
}

/**
 * Generates default repository options for testing, allowing optional overrides.
 *
 * @param overrides - Optional properties to override the default repository options
 * @returns A `RepositoryOptions` object with default values merged with any provided overrides
 */
export function createTestRepositoryOptions(
  overrides: Partial<RepositoryOptions> = {}
): RepositoryOptions {
  return {
    timeout: 5000,
    retryOnFailure: true,
    maxRetries: 2,
    ...overrides,
  };
}

/**
 * Create test error instances for error handling tests
 */
export class TestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseError';
  }
}

export class TestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestValidationError';
  }
}

export class TestNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestNetworkError';
  }
}

/**
 * Returns an object with all standard console methods mocked for use in tests.
 *
 * Each method (`log`, `warn`, `error`, `info`, `debug`) is replaced with a `vi.fn()` mock function, allowing assertions on console output during testing.
 *
 * @returns An object containing mocked console methods.
 */
export function createMockConsole() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Generates an array of test `CreateEventsLogRecord` objects with unique URLs and IDs for batch or performance testing.
 *
 * @param count - The number of records to generate
 * @returns An array of `CreateEventsLogRecord` objects with distinct `url`, `visitId`, and `activityId` values
 */
export function createBatchTestEventsLogRecords(count: number): CreateEventsLogRecord[] {
  return Array.from({ length: count }, (_, index) =>
    createTestCreateEventsLogRecord({
      url: `https://example${index}.com/page`,
      visitId: `550e8400-e29b-41d4-a716-44665544${index.toString().padStart(4, '0')}`,
      activityId: `550e8400-e29b-41d4-a716-44665544${(index + 1000).toString().padStart(4, '0')}`,
    })
  );
}

/**
 * Asserts that a mock function was called a specific number of times and with the expected arguments at a given call index.
 *
 * @param mockFn - The mock function to validate
 * @param callIndex - The zero-based index of the call to check
 * @param expectedArgs - The arguments expected for the specified call
 */
export function expectMockCalledWith<T extends (...args: unknown[]) => unknown>(
  mockFn: T,
  callIndex: number,
  expectedArgs: Parameters<T>
): void {
  expect(mockFn).toHaveBeenCalledTimes(callIndex + 1);
  expect(mockFn).toHaveBeenNthCalledWith(callIndex + 1, ...expectedArgs);
}

/**
 * Clears all mocks globally to ensure test isolation.
 *
 * Use this to reset the state of all mocks between tests.
 */
export function resetMockRepository(): void {
  vi.clearAllMocks();
}
