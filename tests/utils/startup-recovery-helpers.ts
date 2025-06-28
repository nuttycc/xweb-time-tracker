/**
 * Type-safe helpers for StartupRecovery testing
 */

import { vi } from 'vitest';
import { EventGenerator } from '../../src/core/tracker/events/EventGenerator';
import { DatabaseService } from '../../src/core/db/services/database.service';
import type { EventsLogRecord } from '../../src/core/db/models/eventslog.model';
import { createTestDatabase } from './database-test-helpers';

/**
 * Returns an EventGenerator instance with key methods mocked to provide fixed, predictable outputs for recovery scenario testing.
 *
 * The returned instance disables event validation and overrides event generation and control methods to ensure deterministic behavior in tests.
 *
 * @returns An EventGenerator with mocked event generation and control methods for use in recovery tests
 */
export function createMockEventGenerator(): EventGenerator {
  // Create a real EventGenerator instance with disabled validation for testing
  const mockEventGenerator = new EventGenerator({
    validateEvents: false,
    timeouts: {
      inactiveDefault: 30000,
      inactiveMedia: 60000,
    },
  });

  // Mock the methods we need for testing
  vi.spyOn(mockEventGenerator, 'generateOpenTimeStart').mockReturnValue({
    success: true,
    event: {
      timestamp: Date.now(),
      eventType: 'open_time_start',
      tabId: 1,
      url: 'https://example.com',
      visitId: 'visit-1',
      activityId: null,
      isProcessed: 0,
    },
  });

  vi.spyOn(mockEventGenerator, 'generateOpenTimeEnd').mockReturnValue({
    success: true,
    event: {
      timestamp: Date.now(),
      eventType: 'open_time_end',
      tabId: 1,
      url: 'https://example.com',
      visitId: 'visit-1',
      activityId: null,
      isProcessed: 0,
      resolution: 'crash_recovery',
    },
  });

  vi.spyOn(mockEventGenerator, 'generateActiveTimeStart').mockReturnValue({
    success: true,
    event: {
      timestamp: Date.now(),
      eventType: 'active_time_start',
      tabId: 1,
      url: 'https://example.com',
      visitId: 'visit-1',
      activityId: 'activity-1',
      isProcessed: 0,
    },
  });

  vi.spyOn(mockEventGenerator, 'generateActiveTimeEnd').mockReturnValue({
    success: true,
    event: {
      timestamp: Date.now(),
      eventType: 'active_time_end',
      tabId: 1,
      url: 'https://example.com',
      visitId: 'visit-1',
      activityId: 'activity-1',
      isProcessed: 0,
      resolution: 'crash_recovery',
    },
  });

  vi.spyOn(mockEventGenerator, 'generateCheckpoint').mockReturnValue({
    success: true,
  });

  vi.spyOn(mockEventGenerator, 'shouldTriggerActiveTimeTimeout').mockReturnValue(false);
  vi.spyOn(mockEventGenerator, 'shouldGenerateCheckpoint').mockReturnValue(false);
  vi.spyOn(mockEventGenerator, 'updateURLProcessor').mockImplementation(() => {});

  return mockEventGenerator;
}

/**
 * Asynchronously creates a DatabaseService instance with all methods mocked to return predictable results for testing recovery scenarios.
 *
 * The returned DatabaseService uses a test database and has its query and mutation methods mocked to resolve to fixed values or empty arrays, simulating database behavior in a controlled test environment.
 *
 * @returns A DatabaseService instance with all relevant methods mocked for testing
 */
export async function createMockDatabaseService(): Promise<DatabaseService> {
  // Create a real DatabaseService instance with a test database
  const testDb = await createTestDatabase();
  const mockDatabaseService = new DatabaseService(testDb);

  // Mock the methods we need for testing
  vi.spyOn(mockDatabaseService, 'getEventsByTypeAndTimeRange').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'getEventsByVisitId').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'getEventsByActivityId').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'addEvent').mockResolvedValue(1); // Returns event ID
  vi.spyOn(mockDatabaseService, 'getUnprocessedEvents').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'markEventsAsProcessed').mockResolvedValue(0); // Returns count of updated events
  vi.spyOn(mockDatabaseService, 'deleteEventsByIds').mockResolvedValue(0); // Returns count of deleted events
  vi.spyOn(mockDatabaseService, 'upsertStat').mockResolvedValue('test-key'); // Returns primary key
  vi.spyOn(mockDatabaseService, 'getStatsByDateRange').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'getStatsByHostname').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'getStatsByParentDomain').mockResolvedValue([]);
  vi.spyOn(mockDatabaseService, 'getDatabaseHealth').mockResolvedValue({
    isHealthy: true,
    unprocessedEventCount: 0,
    totalEventCount: 0,
    totalStatsCount: 0,
  });

  return mockDatabaseService;
}

/**
 * Generates a fully populated EventsLogRecord object for testing, with optional field overrides.
 *
 * Converts `null` values for `activityId` and `visitId` in overrides to `undefined` to enforce schema consistency and enable fail-fast validation.
 *
 * @param overrides - Optional fields to override default EventsLogRecord values
 * @returns A test EventsLogRecord object with defaults and applied overrides
 */
export function createTestEventsLogRecord(
  overrides: Partial<EventsLogRecord> = {}
): EventsLogRecord {
  const defaults: EventsLogRecord = {
    id: 1,
    eventType: 'open_time_start',
    visitId: 'visit-1',
    activityId: null,
    url: 'https://example.com',
    timestamp: Date.now() - 3600000, // 1 hour ago
    tabId: 1,
    isProcessed: 0,
  };

  const result = { ...defaults, ...overrides };

  // This section intentionally converts `null` to `undefined` for specific fields.
  // This serves two purposes:
  // 1. Consistency: It standardizes the representation of "missing" or "not applicable"
  //    values to `undefined`. This simplifies downstream logic and aligns with the
  //    behavior of Zod's `.optional()` fields. While `activityId` is `nullable` in the
  //    schema (string | null), treating it as `undefined` here makes its handling
  //    consistent with other optional fields in the application.
  // 2. Fail-Fast Testing: For required fields like `visitId`, a test might erroneously
  //    pass `null`. This code converts `null` to `undefined`, which will cause Zod
  //    validation to fail immediately with a clear "required" error message. This
  //    helps catch invalid test data early.
  // The `@ts-expect-error` comments are necessary because this conversion is a
  // deliberate type coercion that TypeScript would otherwise flag as an error.
  if (result.activityId === null) {
    // @ts-expect-error - Deliberate conversion for consistency
    result.activityId = undefined;
  }
  if (result.visitId === null) {
    // @ts-expect-error - Deliberate conversion for fail-fast validation
    result.visitId = undefined;
  }

  return result;
}
