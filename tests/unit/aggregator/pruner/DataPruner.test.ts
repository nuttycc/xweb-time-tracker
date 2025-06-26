/**
 * DataPruner Unit Tests
 *
 * Tests for the data pruning functionality including:
 * - Configurable data retention policies
 * - Safe data cleanup mechanisms
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPruner } from '@/core/aggregator/pruner/DataPruner';
import type { EventsLogRepository } from '@/core/db/repositories/eventslog.repository';
import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';
import {
  DEFAULT_PRUNER_RETENTION_DAYS,
  PRUNER_RETENTION_DAYS_KEY,
} from '@/core/aggregator/utils/constants';

// Mock #imports - must use factory function without external references
vi.mock('#imports', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

// Storage mock will be obtained in beforeEach
let mockStorage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

// Mock data helpers
const createMockEventsLogRepository = () => ({
  getProcessedEventsOlderThan: vi.fn(),
  deleteEventsByIds: vi.fn(),
  // Note: markEventsAsProcessed and getUnprocessedEvents are not used by DataPruner
});

const createTestEvent = (overrides: Partial<EventsLogRecord> = {}): EventsLogRecord => ({
  id: 1,
  timestamp: Date.now(),
  eventType: 'open_time_start',
  tabId: 123,
  url: 'https://example.com',
  visitId: 'visit-123',
  activityId: 'activity-456',
  isProcessed: 1, // Processed events for pruning
  resolution: undefined,
  ...overrides,
});

describe('DataPruner', () => {
  let pruner: DataPruner;
  let mockEventsLogRepo: ReturnType<typeof createMockEventsLogRepository>;
  let originalConsole: typeof console;

  beforeEach(async () => {
    // Get the mocked storage
    const imports = (await vi.importMock('#imports')) as { storage: typeof mockStorage };
    mockStorage = imports.storage;

    // Mock console
    originalConsole = global.console;
    global.console = mockConsole as unknown as Console;

    mockEventsLogRepo = createMockEventsLogRepository();
    pruner = new DataPruner(mockEventsLogRepo as unknown as EventsLogRepository);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore console
    global.console = originalConsole;
    vi.clearAllMocks();
  });

  describe('run method', () => {
    it('should use default retention days when no custom value is set', async () => {
      const now = Date.now();
      const expectedTimestamp = now - DEFAULT_PRUNER_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      // Mock Date.now to return a fixed value
      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockStorage.getItem).toHaveBeenCalledWith(PRUNER_RETENTION_DAYS_KEY);
      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });

    it('should use custom retention days from storage', async () => {
      const now = Date.now();
      const customRetentionDays = 15;
      const expectedTimestamp = now - customRetentionDays * 24 * 60 * 60 * 1000;

      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(customRetentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockStorage.getItem).toHaveBeenCalledWith(PRUNER_RETENTION_DAYS_KEY);
      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });

    it('should delete old processed events when found', async () => {
      const oldEvents = [
        createTestEvent({ id: 1, timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000 }),
        createTestEvent({ id: 2, timestamp: Date.now() - 35 * 24 * 60 * 60 * 1000 }),
        createTestEvent({ id: 3, timestamp: Date.now() - 32 * 24 * 60 * 60 * 1000 }),
      ];

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 3 old events.');
    });

    it('should not delete anything when no old events are found', async () => {
      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).not.toHaveBeenCalled();
      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should filter out events with undefined or null IDs', async () => {
      const oldEvents = [
        createTestEvent({ id: 1, timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000 }),
        createTestEvent({ id: undefined, timestamp: Date.now() - 35 * 24 * 60 * 60 * 1000 }),
        createTestEvent({ id: 2, timestamp: Date.now() - 32 * 24 * 60 * 60 * 1000 }),
        // @ts-expect-error Testing null ID case
        createTestEvent({ id: null, timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 }),
        createTestEvent({ id: 3, timestamp: Date.now() - 28 * 24 * 60 * 60 * 1000 }),
      ];

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      // Should only delete events with valid IDs (1, 2, 3)
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 3 old events.');
    });

    it('should warn when no valid event IDs are found', async () => {
      const oldEvents = [
        createTestEvent({ id: undefined, timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000 }),
        // @ts-expect-error Testing null ID case
        createTestEvent({ id: null, timestamp: Date.now() - 35 * 24 * 60 * 60 * 1000 }),
      ];

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledWith('No valid event IDs found for pruning.');
      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockRejectedValue(error);

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith('Error during data pruning:', error);
      expect(mockEventsLogRepo.deleteEventsByIds).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const error = new Error('Storage access failed');
      mockStorage.getItem.mockRejectedValue(error);

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith('Error during data pruning:', error);
      expect(mockEventsLogRepo.getProcessedEventsOlderThan).not.toHaveBeenCalled();
    });
  });

  describe('retention policy configuration', () => {
    it('should handle zero retention days', async () => {
      const now = Date.now();
      const retentionDays = 0;
      const expectedTimestamp = now; // All events should be considered old

      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(retentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });

    it('should handle very large retention days', async () => {
      const now = Date.now();
      const retentionDays = 365; // One year
      const expectedTimestamp = now - retentionDays * 24 * 60 * 60 * 1000;

      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(retentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });

    it('should handle negative retention days correctly', async () => {
      const now = Date.now();
      const retentionDays = -5;
      // Negative retention days will result in a future timestamp (all events are old)
      const expectedTimestamp = now - retentionDays * 24 * 60 * 60 * 1000;

      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(retentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });
  });

  describe('data safety mechanisms', () => {
    it('should safely filter out events with invalid IDs', async () => {
      const oldEvents = [
        createTestEvent({ id: 1 }),
        createTestEvent({ id: undefined as unknown as number }), // Invalid ID - should be filtered out
        createTestEvent({ id: 3 }),
        createTestEvent({ id: null as unknown as number }), // Invalid ID - should be filtered out
        createTestEvent({ id: 5 }),
      ];

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      // DataPruner now filters out undefined and null IDs for safety
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, 3, 5]);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 3 old events.');
    });

    it('should handle deletion errors gracefully', async () => {
      const oldEvents = [createTestEvent({ id: 1 })];
      const deletionError = new Error('Failed to delete events');

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);
      mockEventsLogRepo.deleteEventsByIds.mockRejectedValue(deletionError);

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith('Error during data pruning:', deletionError);
    });

    it('should handle large batches of events', async () => {
      const oldEvents = Array.from({ length: 1000 }, (_, i) =>
        createTestEvent({ id: i + 1, timestamp: Date.now() - 40 * 24 * 60 * 60 * 1000 })
      );

      mockStorage.getItem.mockResolvedValue(null);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(oldEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      const expectedIds = Array.from({ length: 1000 }, (_, i) => i + 1);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith(expectedIds);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 1000 old events.');
    });
  });

  describe('timestamp calculations', () => {
    it('should calculate retention timestamp correctly', async () => {
      const fixedNow = 1703520000000; // Fixed timestamp for testing
      const retentionDays = 7;
      const expectedTimestamp = fixedNow - retentionDays * 24 * 60 * 60 * 1000;

      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

      mockStorage.getItem.mockResolvedValue(retentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);
    });

    it('should handle edge case of exactly retention boundary', async () => {
      const now = Date.now();
      const retentionDays = 30;
      const boundaryTimestamp = now - retentionDays * 24 * 60 * 60 * 1000;

      const eventsAtBoundary = [
        createTestEvent({ id: 1, timestamp: boundaryTimestamp - 1 }), // Should be pruned
        createTestEvent({ id: 2, timestamp: boundaryTimestamp }), // Should be pruned
        createTestEvent({ id: 3, timestamp: boundaryTimestamp + 1 }), // Should NOT be pruned
      ];

      vi.spyOn(Date, 'now').mockReturnValue(now);

      mockStorage.getItem.mockResolvedValue(retentionDays);
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(eventsAtBoundary);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(boundaryTimestamp);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, 2, 3]);
    });
  });
});
