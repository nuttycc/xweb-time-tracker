/**
 * Type-safe helpers for StartupRecovery testing
 */

import { vi } from 'vitest';
import type { EventGenerator } from '../../src/core/tracker/events/EventGenerator';
import type { DatabaseService } from '../../src/core/db/services/database.service';
import type { EventsLogRecord } from '../../src/core/db/models/eventslog.model';

/**
 * Create a type-safe mock for EventGenerator
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
 * Create a type-safe mock for DatabaseService using public API methods
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
 * Create a test EventsLogRecord
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

  // Convert null to undefined for optional fields to match schema expectations
  if (result.activityId === null) {
    result.activityId = undefined;
  }
  if (result.visitId === null) {
    result.visitId = undefined;
  }

  return result;
}
