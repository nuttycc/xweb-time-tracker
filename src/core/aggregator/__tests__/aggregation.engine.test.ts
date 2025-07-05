import { describe, it, expect, beforeEach } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';
import { AggregationEngine } from '../AggregationEngine';
import type { EventsLogRecord } from '../../db/models/eventslog.model';
import type { EventsLogRepository } from '../../db/repositories/eventslog.repository';
import type { AggregatedStatsRepository } from '../../db/repositories/aggregatedstats.repository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to build an EventsLogRecord with sensible defaults.
 */
function buildEvent(partial: Partial<EventsLogRecord>): EventsLogRecord {
  return {
    id: partial.id!,
    timestamp: partial.timestamp!,
    eventType: partial.eventType as EventsLogRecord['eventType'],
    tabId: partial.tabId ?? 1,
    url: partial.url!,
    visitId: partial.visitId!,
    activityId: partial.activityId ?? null,
    isProcessed: 0,
  } as EventsLogRecord;
}

describe('AggregationEngine', () => {
  const sampleUrl = 'https://example.com/page';
  let aggregationEngine: AggregationEngine;
  // Re-created before每个测试，保持严格类型
  let eventsLogRepoMock: MockProxy<EventsLogRepository>;
  let aggregatedStatsRepoMock: MockProxy<AggregatedStatsRepository>;

  beforeEach(() => {
    // 使用 vitest-mock-extended 生成深度 mock，自动保持类型安全
    eventsLogRepoMock = mock<EventsLogRepository>();
    aggregatedStatsRepoMock = mock<AggregatedStatsRepository>();

    aggregationEngine = new AggregationEngine(eventsLogRepoMock, aggregatedStatsRepoMock);
  });

  it('should return success with 0 processed events when there is nothing to process', async () => {
    // Arrange
    eventsLogRepoMock.getUnprocessedEvents.mockResolvedValue([]);

    // Act
    const result = await aggregationEngine.run();

    // Assert
    expect(result).toEqual({ success: true, processedEvents: 0 });
    expect(eventsLogRepoMock.getUnprocessedEvents).toHaveBeenCalledTimes(1);
    expect(aggregatedStatsRepoMock.upsertTimeAggregation).not.toHaveBeenCalled();
    expect(eventsLogRepoMock.markEventsAsProcessed).not.toHaveBeenCalled();
  });

  it('should aggregate open and active time and mark events processed', async () => {
    // Arrange – construct a valid open & active time lifecycle
    const visitId = uuidv4();
    const activityId = uuidv4();
    const baseTs = Date.now();

    const events: EventsLogRecord[] = [
      // Open-time lifecycle
      buildEvent({ id: 1, timestamp: baseTs, eventType: 'open_time_start', url: sampleUrl, visitId }),
      buildEvent({ id: 2, timestamp: baseTs + 2000, eventType: 'checkpoint', url: sampleUrl, visitId }),
      buildEvent({ id: 3, timestamp: baseTs + 3000, eventType: 'checkpoint', url: sampleUrl, visitId }),
      // Active-time lifecycle (includes its own checkpoint)
      buildEvent({ id: 4, timestamp: baseTs + 5000, eventType: 'active_time_start', url: sampleUrl, visitId, activityId }),
      buildEvent({ id: 5, timestamp: baseTs + 7000, eventType: 'checkpoint', url: sampleUrl, visitId, activityId }),
      buildEvent({ id: 6, timestamp: baseTs + 8000, eventType: 'checkpoint', url: sampleUrl, visitId, activityId }),
      buildEvent({ id: 7, timestamp: baseTs + 8000, eventType: 'active_time_end', url: sampleUrl, visitId, activityId }),
      // Close open-time
      buildEvent({ id: 8, timestamp: baseTs + 12000, eventType: 'open_time_end', url: sampleUrl, visitId }),
    ];

    eventsLogRepoMock.getUnprocessedEvents.mockResolvedValue(events);
    aggregatedStatsRepoMock.upsertTimeAggregation.mockResolvedValue('key');
    eventsLogRepoMock.markEventsAsProcessed.mockResolvedValue(events.length);

    const expectedDate = new Date(baseTs).toISOString().split('T')[0];

    // Act
    const result = await aggregationEngine.run();

    // Assert – engine result
    expect(result).toEqual({ success: true, processedEvents: events.length });

    // Assert – aggregation repository called with aggregated time
    expect(aggregatedStatsRepoMock.upsertTimeAggregation).toHaveBeenCalledTimes(1);
    expect(aggregatedStatsRepoMock.upsertTimeAggregation).toHaveBeenCalledWith({
      date: expectedDate,
      url: sampleUrl,
      hostname: 'example.com',
      parentDomain: 'example.com',
      openTimeToAdd: 12000, // 12s open time
      activeTimeToAdd: 3000, // 3s active time
    });

    // Assert – processed events marked
    expect(eventsLogRepoMock.markEventsAsProcessed).toHaveBeenCalledTimes(1);
    const processedIdsArg = eventsLogRepoMock.markEventsAsProcessed.mock.calls[0][0];
    expect(processedIdsArg.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should aggregate open time for start→checkpoint sequence and leave checkpoint unprocessed', async () => {
    const visitId = uuidv4();
    const baseTs = Date.now();

    const events: EventsLogRecord[] = [
      buildEvent({ id: 10, timestamp: baseTs, eventType: 'open_time_start', url: sampleUrl, visitId }),
      buildEvent({ id: 11, timestamp: baseTs + 4000, eventType: 'checkpoint', url: sampleUrl, visitId }),
      buildEvent({ id: 12, timestamp: baseTs + 9000, eventType: 'checkpoint', url: sampleUrl, visitId }),
    ];

    eventsLogRepoMock.getUnprocessedEvents.mockResolvedValue(events);
    aggregatedStatsRepoMock.upsertTimeAggregation.mockResolvedValue('key');
    eventsLogRepoMock.markEventsAsProcessed.mockResolvedValue(2);

    const expectedDate = new Date(baseTs).toISOString().split('T')[0];

    const result = await aggregationEngine.run();

    expect(result).toEqual({ success: true, processedEvents: events.length });

    expect(aggregatedStatsRepoMock.upsertTimeAggregation).toHaveBeenCalledWith({
      date: expectedDate,
      url: sampleUrl,
      hostname: 'example.com',
      parentDomain: 'example.com',
      openTimeToAdd: 9000,
      activeTimeToAdd: 0,
    });

    const processedIds = eventsLogRepoMock.markEventsAsProcessed.mock.calls[0][0];
    expect(processedIds.sort()).toEqual([10, 11]);
  });

  it('should aggregate active time for start→checkpoint sequence and leave checkpoint unprocessed', async () => {
    const visitId = uuidv4();
    const activityId = uuidv4();
    const baseTs = Date.now();

    const events: EventsLogRecord[] = [
      buildEvent({ id: 20, timestamp: baseTs, eventType: 'active_time_start', url: sampleUrl, visitId, activityId }),
      buildEvent({ id: 21, timestamp: baseTs + 3000, eventType: 'checkpoint', url: sampleUrl, visitId, activityId }),
      buildEvent({ id: 22, timestamp: baseTs + 8000, eventType: 'checkpoint', url: sampleUrl, visitId, activityId }),
    ];

    eventsLogRepoMock.getUnprocessedEvents.mockResolvedValue(events);
    aggregatedStatsRepoMock.upsertTimeAggregation.mockResolvedValue('key');
    eventsLogRepoMock.markEventsAsProcessed.mockResolvedValue(2);

    const expectedDate = new Date(baseTs).toISOString().split('T')[0];

    const result = await aggregationEngine.run();

    expect(result).toEqual({ success: true, processedEvents: events.length });

    expect(aggregatedStatsRepoMock.upsertTimeAggregation).toHaveBeenCalledWith({
      date: expectedDate,
      url: sampleUrl,
      hostname: 'example.com',
      parentDomain: 'example.com',
      openTimeToAdd: 0,
      activeTimeToAdd: 8000,
    });

    const processedIds = eventsLogRepoMock.markEventsAsProcessed.mock.calls[0][0];
    expect(processedIds.sort()).toEqual([20, 21]);
  });
}); 