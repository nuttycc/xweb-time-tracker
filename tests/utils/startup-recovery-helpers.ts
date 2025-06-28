/**
 * Type-safe helpers for StartupRecovery testing
 */

import { vi } from 'vitest';
import type { EventGenerator } from '../../src/core/tracker/events/EventGenerator';
import type { DatabaseService } from '../../src/core/db/services/database.service';
import type { EventsLogRecord } from '../../src/core/db/models/eventslog.model';

/**
 * Creates a partial mock implementation of the EventGenerator interface for testing.
 *
 * The returned mock provides stubbed `generateOpenTimeEnd` and `generateActiveTimeEnd` methods, each returning a fixed success response with a crash recovery event object.
 *
 * @returns A partial EventGenerator mock with predefined recovery event responses
 */
export function createMockEventGenerator(): Partial<EventGenerator> {
  return {
    generateOpenTimeEnd: vi.fn().mockReturnValue({
      success: true,
      event: {
        id: 'recovery-event-1',
        eventType: 'open_time_end',
        visitId: 'visit-1',
        resolution: 'crash_recovery',
      },
    }),
    generateActiveTimeEnd: vi.fn().mockReturnValue({
      success: true,
      event: {
        id: 'recovery-event-2',
        eventType: 'active_time_end',
        activityId: 'activity-1',
        resolution: 'crash_recovery',
      },
    }),
  };
}

/**
 * Creates a partial mock of the DatabaseService interface with stubbed methods returning empty results.
 *
 * The returned mock implements the public API methods used by StartupRecovery, each resolving to an empty array to simulate no events found.
 * @returns A partial DatabaseService mock with stubbed event retrieval methods
 */
export function createMockDatabaseService(): Partial<DatabaseService> {
  return {
    // Use the public API methods that StartupRecovery actually calls
    getEventsByTypeAndTimeRange: vi.fn().mockResolvedValue([]),
    getEventsByVisitId: vi.fn().mockResolvedValue([]),
    getEventsByActivityId: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Creates a test EventsLogRecord object with default values, allowing optional field overrides.
 *
 * If `activityId` or `visitId` are set to `null` in the overrides, they are converted to `undefined` to match schema expectations.
 *
 * @param overrides - Optional fields to override the default EventsLogRecord values
 * @returns A fully populated EventsLogRecord object for testing
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
