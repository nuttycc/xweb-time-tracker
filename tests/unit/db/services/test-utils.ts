/**
 * Services Layer Test Utilities
 *
 * Provides mock factories, test data generators, and utility functions
 * for testing Services layer components with type safety.
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
 * Create a mock EventsLogRepository with all methods mocked
 */
export function createMockEventsLogRepository(): MockProxy<EventsLogRepository> {
  return mock<EventsLogRepository>();
}

/**
 * Create a mock AggregatedStatsRepository with all methods mocked
 */
export function createMockAggregatedStatsRepository(): MockProxy<AggregatedStatsRepository> {
  return mock<AggregatedStatsRepository>();
}

/**
 * Test data factory for EventsLog records
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
 * Test data factory for CreateEventsLogRecord (without id)
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
 * Test data factory for AggregatedStats records
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
 * Test data factory for TimeAggregationData
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
 * Create test repository options
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
 * Generate unique test database name for isolation
 */
export function generateTestDatabaseName(): string {
  return `TestDB_Services_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Mock console methods for testing logging
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
 * Utility to wait for async operations in tests
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create batch test data for performance testing
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
 * Validate mock function call arguments
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
 * Reset all mocks in a mock repository
 */
export function resetMockRepository(): void {
  vi.clearAllMocks();
}
