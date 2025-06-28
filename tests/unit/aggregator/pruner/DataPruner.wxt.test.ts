/**
 * DataPruner Unit Tests (WXT Standard)
 *
 * Tests for the data pruning functionality using WXT testing standards.
 * Uses WXT storage without manual mocking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storage } from '#imports';
import type { EventsLogRepository } from '@/core/db/repositories/eventslog.repository';
import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';
import {
  DEFAULT_PRUNER_RETENTION_DAYS,
  PRUNER_RETENTION_DAYS_KEY,
} from '@/core/aggregator/utils/constants';

// Create mock repository
const createMockEventsLogRepo = () => ({
  getProcessedEventsOlderThan: vi.fn(),
  deleteEventsByIds: vi.fn(),
});

// Create mock console
const createMockConsole = () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
});

describe('DataPruner (WXT Standard)', () => {
  let DataPruner: typeof import('@/core/aggregator/pruner/DataPruner').DataPruner;
  let pruner: InstanceType<typeof DataPruner>;
  let mockEventsLogRepo: ReturnType<typeof createMockEventsLogRepo>;
  let mockConsole: ReturnType<typeof createMockConsole>;
  let originalConsole: Console;

  beforeEach(async () => {
    // Import DataPruner after mocks are set up
    const module = await import('@/core/aggregator/pruner/DataPruner');
    DataPruner = module.DataPruner;

    mockEventsLogRepo = createMockEventsLogRepo();
    mockConsole = createMockConsole();

    // Replace console methods
    originalConsole = global.console;
    global.console = mockConsole as unknown as Console;

    pruner = new DataPruner(mockEventsLogRepo as unknown as EventsLogRepository);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original console
    global.console = originalConsole;
  });

  describe('constructor', () => {
    it('should initialize with provided repository', () => {
      expect(pruner).toBeInstanceOf(DataPruner);
    });
  });

  describe('run method', () => {
    it('should use default retention days when no custom value is set', async () => {
      const currentTime = Date.now();
      const expectedTimestamp = currentTime - DEFAULT_PRUNER_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      // Mock Date.now to return consistent time
      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      // Mock empty storage (no custom retention days)
      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(null);

      // Mock repository to return no events
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(
        expect.closeTo(expectedTimestamp, 100) // Allow 100ms tolerance
      );

      mockDateNow.mockRestore();
    });

    it('should use custom retention days from storage', async () => {
      const customRetentionDays = 14;
      const currentTime = Date.now();
      const expectedTimestamp = currentTime - customRetentionDays * 24 * 60 * 60 * 1000;

      // Mock Date.now to return consistent time
      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      // Set custom retention days in storage
      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(customRetentionDays);

      // Mock repository to return no events
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(
        expect.closeTo(expectedTimestamp, 100) // Allow 100ms tolerance
      );

      mockDateNow.mockRestore();
    });

    it('should delete old processed events when found', async () => {
      const mockEvents: EventsLogRecord[] = [
        {
          id: 1,
          url: 'test1.com',
          timestamp: 123456,
          eventType: 'open_time_start',
          tabId: 1,
          visitId: 'v1',
          activityId: 'a1',
          isProcessed: 1,
        },
        {
          id: 2,
          url: 'test2.com',
          timestamp: 123457,
          eventType: 'open_time_start',
          tabId: 2,
          visitId: 'v2',
          activityId: 'a2',
          isProcessed: 1,
        },
        {
          id: 3,
          url: 'test3.com',
          timestamp: 123458,
          eventType: 'open_time_start',
          tabId: 3,
          visitId: 'v3',
          activityId: 'a3',
          isProcessed: 1,
        },
      ];

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(mockEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 3 old events.');
    });

    it('should not delete anything when no old events are found', async () => {
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).not.toHaveBeenCalled();
      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should handle events with undefined or null IDs', async () => {
      const mockEvents: EventsLogRecord[] = [
        {
          id: 1,
          url: 'test1.com',
          timestamp: 123456,
          eventType: 'open_time_start',
          tabId: 1,
          visitId: 'v1',
          activityId: 'a1',
          isProcessed: 1,
        },
        {
          id: undefined,
          url: 'test2.com',
          timestamp: 123457,
          eventType: 'open_time_start',
          tabId: 2,
          visitId: 'v2',
          activityId: 'a2',
          isProcessed: 1,
        } as unknown as EventsLogRecord,
        {
          id: 2,
          url: 'test3.com',
          timestamp: 123458,
          eventType: 'open_time_start',
          tabId: 3,
          visitId: 'v3',
          activityId: 'a3',
          isProcessed: 1,
        },
        {
          id: null,
          url: 'test4.com',
          timestamp: 123459,
          eventType: 'open_time_start',
          tabId: 4,
          visitId: 'v4',
          activityId: 'a4',
          isProcessed: 1,
        } as unknown as EventsLogRecord,
        {
          id: 3,
          url: 'test5.com',
          timestamp: 123460,
          eventType: 'open_time_start',
          tabId: 5,
          visitId: 'v5',
          activityId: 'a5',
          isProcessed: 1,
        },
      ];

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(mockEvents);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      // Current implementation doesn't filter, so it passes all IDs including undefined/null
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1, undefined, 2, null, 3]);
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 5 old events.');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockEventsLogRepo.getProcessedEventsOlderThan.mockRejectedValue(error);

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith('Error during data pruning:', error);
      expect(mockEventsLogRepo.deleteEventsByIds).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage.getItem to throw error
      const getItemSpy = vi
        .spyOn(storage, 'getItem')
        .mockRejectedValue(new Error('Storage access failed'));

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Error during data pruning:',
        expect.any(Error)
      );
      expect(mockEventsLogRepo.getProcessedEventsOlderThan).not.toHaveBeenCalled();

      getItemSpy.mockRestore();
    });
  });

  describe('retention policy configuration', () => {
    it('should handle zero retention days', async () => {
      const currentTime = Date.now();
      const expectedTimestamp = currentTime - 0 * 24 * 60 * 60 * 1000; // Same as current time

      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(0);

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(
        expect.closeTo(expectedTimestamp, 100)
      );

      mockDateNow.mockRestore();
    });

    it('should handle very large retention days', async () => {
      const largeRetentionDays = 365 * 10; // 10 years
      const currentTime = Date.now();
      const expectedTimestamp = currentTime - largeRetentionDays * 24 * 60 * 60 * 1000;

      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(largeRetentionDays);

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(
        expect.closeTo(expectedTimestamp, 100)
      );

      mockDateNow.mockRestore();
    });

    it('should handle negative retention days correctly', async () => {
      const negativeRetentionDays = -5;
      const currentTime = Date.now();
      const expectedTimestamp = currentTime - negativeRetentionDays * 24 * 60 * 60 * 1000; // Future timestamp

      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(negativeRetentionDays);

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(
        expect.closeTo(expectedTimestamp, 100)
      );

      mockDateNow.mockRestore();
    });
  });

  describe('data safety mechanisms', () => {
    it('should handle deletion errors gracefully', async () => {
      const mockEvents: EventsLogRecord[] = [
        {
          id: 1,
          url: 'test1.com',
          timestamp: 123456,
          eventType: 'open_time_start',
          tabId: 1,
          visitId: 'v1',
          activityId: 'a1',
          isProcessed: 1,
        },
      ];

      const deletionError = new Error('Deletion failed');
      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(mockEvents);
      mockEventsLogRepo.deleteEventsByIds.mockRejectedValue(deletionError);

      await pruner.run();

      expect(mockConsole.error).toHaveBeenCalledWith('Error during data pruning:', deletionError);
    });

    it('should handle large batches of events', async () => {
      const largeEventBatch: EventsLogRecord[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        url: `test${i + 1}.com`,
        timestamp: 123456 + i,
        eventType: 'open_time_start' as const,
        tabId: i + 1,
        visitId: `v${i + 1}`,
        activityId: `a${i + 1}`,
        isProcessed: 1 as const,
      }));

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue(largeEventBatch);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith(
        expect.arrayContaining([1, 2, 3, 4, 5]) // Check first few IDs
      );
      expect(mockConsole.log).toHaveBeenCalledWith('Pruned 1000 old events.');
    });
  });

  describe('timestamp calculations', () => {
    it('should calculate retention timestamp correctly', async () => {
      const fixedTime = new Date('2023-12-18T00:00:00.000Z').getTime(); // Fixed date for testing
      const retentionDays = 30;
      const expectedTimestamp = fixedTime - retentionDays * 24 * 60 * 60 * 1000;

      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(fixedTime);

      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(retentionDays);

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([]);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(expectedTimestamp);

      mockDateNow.mockRestore();
    });

    it('should handle edge case of exactly retention boundary', async () => {
      const currentTime = Date.now();
      const retentionDays = 7;
      const boundaryTimestamp = currentTime - retentionDays * 24 * 60 * 60 * 1000;

      const mockDateNow = vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      const retentionStorage = storage.defineItem(PRUNER_RETENTION_DAYS_KEY);
      await retentionStorage.setValue(retentionDays);

      // Mock event exactly at boundary
      const boundaryEvent: EventsLogRecord = {
        id: 1,
        url: 'boundary.com',
        timestamp: boundaryTimestamp,
        eventType: 'open_time_start',
        tabId: 1,
        visitId: 'v1',
        activityId: 'a1',
        isProcessed: 1,
      };

      mockEventsLogRepo.getProcessedEventsOlderThan.mockResolvedValue([boundaryEvent]);
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(undefined);

      await pruner.run();

      expect(mockEventsLogRepo.getProcessedEventsOlderThan).toHaveBeenCalledWith(boundaryTimestamp);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([1]);

      mockDateNow.mockRestore();
    });
  });

  describe('WXT Integration', () => {
    it('should be able to use WXT storage', async () => {
      const testKey = 'test-retention-days';
      const testValue = 15;

      const testStorage = storage.defineItem(`local:${testKey}`);
      await testStorage.setValue(testValue);
      const retrievedValue = await testStorage.getValue();

      expect(retrievedValue).toBe(testValue);
    });

    it('should handle storage with different areas', async () => {
      const syncStorage = storage.defineItem('sync:test-sync');
      const localStorage = storage.defineItem('local:test-local');

      await syncStorage.setValue('sync-value');
      await localStorage.setValue('local-value');

      expect(await syncStorage.getValue()).toBe('sync-value');
      expect(await localStorage.getValue()).toBe('local-value');
    });
  });
});
