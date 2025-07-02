/**
 * AggregationEngine Unit Tests
 *
 * Tests for the core aggregation engine functionality including:
 * - Incremental aggregation mechanism
 * - Time accumulation calculation algorithms
 * - Domain parsing functionality
 * - Error handling mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AggregationEngine } from '@/core/aggregator/engine/AggregationEngine';
import type { EventsLogRepository } from '@/core/db/repositories/eventslog.repository';
import type { AggregatedStatsRepository } from '@/core/db/repositories/aggregatedstats.repository';
// import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';
import type { AggregationResult } from '@/core/aggregator/utils/types';
// Import new test helpers
import {
  createTestEvent,
  createOpenTimePair,
  createMultipleActivities,
  createEventSequence,
  TEST_EVENT_TYPES,
  EVENT_SEQUENCES,
} from '../../../helpers';

// Mock data helpers
const createMockEventsLogRepository = () => ({
  getUnprocessedEvents: vi.fn(),
  markEventsAsProcessed: vi.fn(),
  // Note: deleteEventsByIds and getProcessedEventsOlderThan are not used by AggregationEngine
});

const createMockAggregatedStatsRepository = () => ({
  upsertTimeAggregation: vi.fn(),
});

describe('AggregationEngine', () => {
  let engine: AggregationEngine;
  let mockEventsLogRepo: ReturnType<typeof createMockEventsLogRepository>;
  let mockAggregatedStatsRepo: ReturnType<typeof createMockAggregatedStatsRepository>;

  beforeEach(() => {
    mockEventsLogRepo = createMockEventsLogRepository();
    mockAggregatedStatsRepo = createMockAggregatedStatsRepository();
    engine = new AggregationEngine(
      mockEventsLogRepo as unknown as EventsLogRepository,
      mockAggregatedStatsRepo as unknown as AggregatedStatsRepository
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('run method', () => {
    it('should return success with 0 processed events when no unprocessed events exist', async () => {
      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue([]);

      const result: AggregationResult = await engine.run();

      expect(result).toEqual({
        success: true,
        processedEvents: 0,
      });
      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledOnce();
      expect(mockEventsLogRepo.markEventsAsProcessed).not.toHaveBeenCalled();
    });

    it('should process events and return success result', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 2000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      const result: AggregationResult = await engine.run();

      expect(result).toEqual({
        success: true,
        processedEvents: 2,
      });
      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledOnce();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should handle errors and return failure result', async () => {
      const error = new Error('Database connection failed');
      mockEventsLogRepo.getUnprocessedEvents.mockRejectedValue(error);

      const result: AggregationResult = await engine.run();

      expect(result).toEqual({
        success: false,
        processedEvents: 0,
        error: 'Database connection failed',
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockEventsLogRepo.getUnprocessedEvents.mockRejectedValue('String error');

      const result: AggregationResult = await engine.run();

      expect(result).toEqual({
        success: false,
        processedEvents: 0,
        error: 'String error',
      });
    });
  });

  describe('time calculation algorithms', () => {
    it('should calculate open time correctly for start-end event pairs', async () => {
      // Using the new factory function for cleaner, more maintainable test code
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        2000
      ); // 2000ms time difference (1000 to 3000)

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith({
        date: expect.any(String),
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        openTimeToAdd: 2000, // 3000 - 1000
        activeTimeToAdd: 0,
      });
    });

    it('should calculate active time correctly for activity events', async () => {
      // Using predefined event sequence for active time with checkpoint
      // Custom timestamps to match original test expectations: 1000, 2000, 4000
      const testEvents = createEventSequence(
        EVENT_SEQUENCES.ACTIVE_TIME_WITH_CHECKPOINT,
        {
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000 // 1000ms between events: 1000, 2000, 3000
      );
      // Manually adjust the last event to match original test (4000 instead of 3000)
      testEvents[2].timestamp = 4000;

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith({
        date: expect.any(String),
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        openTimeToAdd: 0,
        activeTimeToAdd: 3000, // (2000-1000) + (4000-2000)
      });
    });

    it('should handle multiple visits with different URLs', async () => {
      // Create two separate visit pairs with different URLs
      const visit1Events = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000
      );

      const visit2Events = createOpenTimePair(
        {
          visitId: 'visit-2',
          url: 'https://google.com',
          timestamp: 3000,
          id: 3, // Start with ID 3 for second pair
        },
        2000
      );

      const testEvents = [...visit1Events, ...visit2Events];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(2);
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          openTimeToAdd: 1000,
        })
      );
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://google.com',
          openTimeToAdd: 2000,
        })
      );
    });

    it('should skip invalid visit groups with incomplete event sequences', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
        // Missing end event - should be filtered out by validation
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // No events should be marked as processed since the visit group is invalid
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });
  });

  describe('domain parsing functionality', () => {
    it('should parse simple domain correctly', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com/path',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'example.com',
          parentDomain: 'example.com',
        })
      );
    });

    it('should parse subdomain correctly', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://sub.example.com/path',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'sub.example.com',
          parentDomain: 'example.com',
        })
      );
    });

    it('should handle complex public suffix domains', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.co.uk/path',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'example.co.uk',
          parentDomain: 'example.co.uk',
        })
      );
    });

    it('should handle invalid URLs by throwing error', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'invalid-url',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);

      const result = await engine.run();

      expect(result).toEqual({
        success: false,
        processedEvents: 0,
        error: expect.stringContaining('Invalid URL for parsing'),
      });
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle events with same timestamp', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        0
      ); // 0ms time difference - same timestamp

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for 0 time
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should handle events with negative time interval', async () => {
      // Create events where end timestamp is before start timestamp
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 2000, // Start at 2000ms
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 1000, // End at 1000ms (before start!)
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for negative time interval
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // But should still mark events as processed (complete interval)
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should handle orphaned start events', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
          timestamp: 1500,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        // Missing end events
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for incomplete sessions
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // With validation, orphaned events are not processed
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });

    it('should handle events with negative time differences', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 2000,
        },
        -1000
      ); // Negative time difference - end before start

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for negative time
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // Only start event should be marked as processed (completed its "start" role)
      // End event is not processed because it doesn't form a valid interval
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1]);
    });

    it('should handle repository errors during finalization', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockRejectedValue(
        new Error('Database write failed')
      );

      const result = await engine.run();

      expect(result).toEqual({
        success: false,
        processedEvents: 0,
        error: 'Database write failed',
      });
    });
  });

  describe('incremental aggregation mechanism', () => {
    it('should process only unprocessed events', async () => {
      const unprocessedEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
          isProcessed: 0,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(unprocessedEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledOnce();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should mark events as processed after successful aggregation', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
      // Events should be marked as processed after aggregation
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalled();
    });

    it('should handle batch processing of multiple events', async () => {
      // Create 10 visit pairs with different URLs and visit IDs
      const testEvents = Array.from(
        { length: 10 },
        (_, i) =>
          createOpenTimePair(
            {
              visitId: `visit-${i}`,
              url: `https://example${i}.com`,
              timestamp: 1000 + i * 1000,
              id: i * 2 + 1,
            },
            500
          ) // 500ms duration for each visit
      ).flat();

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(10);
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith(
        testEvents.map(e => e.id)
      );
    });
  });

  describe('checkpoint and activity handling', () => {
    it('should handle checkpoint events correctly', async () => {
      // Create active time sequence with multiple checkpoints
      const baseEvents = createEventSequence(
        EVENT_SEQUENCES.ACTIVE_TIME_WITH_CHECKPOINT,
        {
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000
      );

      // Add an extra checkpoint to test multiple checkpoints
      const extraCheckpoint = createTestEvent({
        id: 3,
        eventType: TEST_EVENT_TYPES.CHECKPOINT,
        timestamp: 3000,
        visitId: 'visit-1',
        activityId: 'activity-1',
        url: 'https://example.com',
      });

      // Insert the extra checkpoint and adjust the end event
      const testEvents = [
        baseEvents[0], // active_time_start
        baseEvents[1], // checkpoint
        extraCheckpoint, // extra checkpoint
        { ...baseEvents[2], id: 4, timestamp: 4000 }, // active_time_end
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTimeToAdd: 3000, // (2000-1000) + (3000-2000) + (4000-3000)
          openTimeToAdd: 0,
        })
      );
    });

    it('should handle multiple activities within same visit', async () => {
      // Create multiple activities within the same visit
      const testEvents = createMultipleActivities([
        {
          activityId: 'activity-1',
          startTime: 1000,
          duration: 1000,
          baseData: {
            visitId: 'visit-1',
            url: 'https://example.com',
          },
        },
        {
          activityId: 'activity-2',
          startTime: 3000,
          duration: 1000,
          baseData: {
            visitId: 'visit-1',
            url: 'https://example.com',
          },
        },
      ]);

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTimeToAdd: 2000, // 1000 + 1000 from both activities
          openTimeToAdd: 0,
        })
      );
    });

    it('should handle orphaned checkpoint events', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        // Missing start event
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for orphaned checkpoint
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // Orphaned checkpoint should NOT be marked as processed (hasn't completed both roles)
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });

    it('should handle open time checkpoint events correctly', async () => {
      // Create open time sequence with checkpoint (activityId = null)
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          activityId: null, // Open Time event
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: null, // Open Time checkpoint
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 3,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 3000,
          visitId: 'visit-1',
          activityId: null, // Open Time event
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          openTimeToAdd: 2000, // (2000-1000) + (3000-2000)
          activeTimeToAdd: 0,
        })
      );
    });

    it('should handle multiple open time checkpoints correctly', async () => {
      // Create open time sequence with multiple checkpoints
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          activityId: null,
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: null, // First Open Time checkpoint
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 3,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 3000,
          visitId: 'visit-1',
          activityId: null, // Second Open Time checkpoint
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 4,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 4000,
          visitId: 'visit-1',
          activityId: null,
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          openTimeToAdd: 3000, // (2000-1000) + (3000-2000) + (4000-3000)
          activeTimeToAdd: 0,
        })
      );
    });

    it('should handle orphaned open time checkpoint events', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: null, // Open Time checkpoint without start event
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should not create aggregation for orphaned open time checkpoint
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      // Orphaned checkpoint should NOT be marked as processed (hasn't completed both roles)
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });

    it('should handle mixed open time and active time checkpoints in same visit', async () => {
      // Create a complex scenario with both open time and active time checkpoints
      const testEvents = [
        // Open Time sequence
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          activityId: null,
          url: 'https://example.com',
        }),
        // Active Time sequence starts
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
          timestamp: 1500,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        // Open Time checkpoint
        createTestEvent({
          id: 3,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: null, // Open Time checkpoint
          url: 'https://example.com',
        }),
        // Active Time checkpoint
        createTestEvent({
          id: 4,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2500,
          visitId: 'visit-1',
          activityId: 'activity-1', // Active Time checkpoint
          url: 'https://example.com',
        }),
        // Active Time ends
        createTestEvent({
          id: 5,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_END,
          timestamp: 3000,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        // Open Time ends
        createTestEvent({
          id: 6,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 4000,
          visitId: 'visit-1',
          activityId: null,
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          // Open Time: (2000-1000) + (4000-2000) = 1000 + 2000 = 3000
          openTimeToAdd: 3000,
          // Active Time: (2500-1500) + (3000-2500) = 1000 + 500 = 1500
          activeTimeToAdd: 1500,
        })
      );
    });

    describe('real-world orphaned checkpoint scenarios', () => {
      it('should handle browser crash scenario - start → checkpoint → checkpoint (no end)', async () => {
        // Scenario: User working for long time, browser crashes before end event
        const testEvents = [
          createTestEvent({
            id: 1,
            eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
            timestamp: 1000,
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 2,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 3000, // 2 seconds later
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 3,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 5000, // 2 seconds later
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
          // No end event due to crash
        ];

        mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
        mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
        mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

        await engine.run();

        expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
          expect.objectContaining({
            openTimeToAdd: 4000, // (3000-1000) + (5000-3000) = 2000 + 2000 = 4000
            activeTimeToAdd: 0,
          })
        );
      });

      it('should handle forced tab close scenario - start → checkpoint (no end)', async () => {
        // Scenario: User directly closes tab during long session
        const testEvents = [
          createTestEvent({
            id: 1,
            eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
            timestamp: 1000,
            visitId: 'visit-1',
            activityId: 'activity-1',
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 2,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 4000, // 3 seconds later
            visitId: 'visit-1',
            activityId: 'activity-1',
            url: 'https://example.com',
          }),
          // No end event due to forced close
        ];

        mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
        mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
        mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

        await engine.run();

        expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
          expect.objectContaining({
            openTimeToAdd: 0,
            activeTimeToAdd: 3000, // 4000-1000 = 3000
          })
        );
      });

      it('should handle network interruption scenario - checkpoint → end (no start)', async () => {
        // Scenario: Start event lost due to network issue, but checkpoint and end recorded
        const testEvents = [
          createTestEvent({
            id: 1,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 2000,
            visitId: 'visit-1',
            activityId: 'activity-1',
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 2,
            eventType: TEST_EVENT_TYPES.ACTIVE_TIME_END,
            timestamp: 5000,
            visitId: 'visit-1',
            activityId: 'activity-1',
            url: 'https://example.com',
          }),
        ];

        mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
        mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
        mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

        await engine.run();

        expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
          expect.objectContaining({
            openTimeToAdd: 0,
            activeTimeToAdd: 3000, // 5000-2000 = 3000 (checkpoint as start point)
          })
        );
      });

      it('should handle system recovery scenario - isolated checkpoint (ignore)', async () => {
        // Scenario: System restart finds orphaned checkpoint from previous session
        const testEvents = [
          createTestEvent({
            id: 1,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 2000,
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
          // No other events - truly orphaned
        ];

        mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
        mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

        await engine.run();

        // Should not create aggregation for truly isolated checkpoint
        expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
        // Isolated checkpoint should NOT be marked as processed (hasn't completed both roles)
        expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
      });

      it('should handle role-based checkpoint processing correctly', async () => {
        // Test the new role-based selective processing logic
        const testEvents = [
          createTestEvent({
            id: 1,
            eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
            timestamp: 1000,
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 2,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 2000,
            visitId: 'visit-1',
            activityId: null, // Open Time checkpoint
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 3,
            eventType: TEST_EVENT_TYPES.CHECKPOINT,
            timestamp: 3000,
            visitId: 'visit-1',
            activityId: null, // Another Open Time checkpoint
            url: 'https://example.com',
          }),
          createTestEvent({
            id: 4,
            eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
            timestamp: 4000,
            visitId: 'visit-1',
            activityId: null,
            url: 'https://example.com',
          }),
        ];

        mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
        mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
        mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

        await engine.run();

        // Should process correctly
        expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
          expect.objectContaining({
            openTimeToAdd: 3000, // Total time: 4000-1000 = 3000
            activeTimeToAdd: 0,
          })
        );

        // Check which events should be marked as processed:
        // Based on the actual implementation behavior:
        // - Event 1 (start): processed (completed "start" role)
        // - Event 2 (checkpoint): processed (completed both "end" and "start" roles)
        // - Event 3 (checkpoint): processed (completed both "end" and "start" roles)
        // - Event 4 (end): processed (completed "end" role)
        // Note: Both checkpoints are marked because they're not the last in sequence
        expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 4, 2, 3]);
      });
    });
  });

  describe('date handling and aggregation keys', () => {
    it('should group events by date correctly', async () => {
      const date1 = new Date('2023-12-25T10:00:00Z').getTime();
      const date2 = new Date('2023-12-26T10:00:00Z').getTime();

      // Create events for two different dates
      const day1Events = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: date1,
        },
        1000
      );

      const day2Events = createOpenTimePair(
        {
          visitId: 'visit-2',
          url: 'https://example.com',
          timestamp: date2,
          id: 3, // Start with ID 3 for second pair
        },
        1000
      );

      const testEvents = [...day1Events, ...day2Events];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(2);
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2023-12-25',
          url: 'https://example.com',
        })
      );
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2023-12-26',
          url: 'https://example.com',
        })
      );
    });

    it('should aggregate same URL and date correctly', async () => {
      // Create two visits to the same URL for aggregation testing
      const visit1Events = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com/page1',
          timestamp: 1000,
        },
        1000
      );

      const visit2Events = createOpenTimePair(
        {
          visitId: 'visit-2',
          url: 'https://example.com/page1',
          timestamp: 3000,
          id: 3, // Start with ID 3 for second pair
        },
        2000
      );

      const testEvents = [...visit1Events, ...visit2Events];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(1);
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/page1',
          openTimeToAdd: 3000, // 1000 + 2000 from both visits
          activeTimeToAdd: 0,
        })
      );
    });

    it('should handle timezone-independent date calculation', async () => {
      // Test with UTC midnight boundary
      const beforeMidnight = new Date('2023-12-25T23:59:00Z').getTime();
      const afterMidnight = new Date('2023-12-26T00:01:00Z').getTime();

      // Create events that span midnight boundary
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: beforeMidnight,
        },
        afterMidnight - beforeMidnight
      ); // Exact time difference across midnight

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      // Should use the date from the first event
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2023-12-25',
        })
      );
    });
  });

  describe('concurrent processing and performance', () => {
    it('should handle concurrent upsert operations', async () => {
      // Create 5 concurrent visit pairs for testing concurrent operations
      const testEvents = Array.from(
        { length: 5 },
        (_, i) =>
          createOpenTimePair(
            {
              visitId: `visit-${i}`,
              url: `https://example${i}.com`,
              timestamp: 1000 + i * 100,
              id: i * 2 + 1,
            },
            500
          ) // 500ms duration for each visit
      ).flat();

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(5);
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith(
        testEvents.map(e => e.id)
      );
    });

    it('should handle empty event arrays gracefully', async () => {
      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue([]);

      const result = await engine.run();

      expect(result).toEqual({
        success: true,
        processedEvents: 0,
      });
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).not.toHaveBeenCalled();
    });
  });

  describe('visit group validation', () => {
    it('should process valid visit groups with complete open time sequences', async () => {
      const testEvents = createOpenTimePair(
        {
          visitId: 'visit-1',
          url: 'https://example.com',
          timestamp: 1000,
        },
        1000
      );

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          openTimeToAdd: 1000,
          activeTimeToAdd: 0,
        })
      );
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should skip visit groups with only start events', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });

    it('should skip visit groups with only end events', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 2000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });

    it('should process visit groups with valid checkpoint sequences', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.CHECKPOINT,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: null,
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 3,
          eventType: TEST_EVENT_TYPES.OPEN_TIME_END,
          timestamp: 3000,
          visitId: 'visit-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          openTimeToAdd: 2000, // 1000-2000 + 2000-3000 = 1000 + 1000 = 2000
          activeTimeToAdd: 0,
        })
      );
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 3, 2]);
    });

    it('should process visit groups with valid active time sequences', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        createTestEvent({
          id: 2,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_END,
          timestamp: 2000,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue('stat-1');
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          openTimeToAdd: 0,
          activeTimeToAdd: 1000,
        })
      );
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([1, 2]);
    });

    it('should skip visit groups with incomplete active time sequences', async () => {
      const testEvents = [
        createTestEvent({
          id: 1,
          eventType: TEST_EVENT_TYPES.ACTIVE_TIME_START,
          timestamp: 1000,
          visitId: 'visit-1',
          activityId: 'activity-1',
          url: 'https://example.com',
        }),
        // Missing active_time_end event
      ];

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(testEvents);
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(undefined);

      await engine.run();

      expect(mockAggregatedStatsRepo.upsertTimeAggregation).not.toHaveBeenCalled();
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([]);
    });
  });
});
