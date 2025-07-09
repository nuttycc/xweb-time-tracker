import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { WebTimeTrackerDB } from '@/core/db/schemas';
import { DatabaseService } from '@/core/db/services';
import type { TimeAggregationData } from '@/core/db/repositories';
import { v4 as uuidv4 } from 'uuid';

/**
 * DatabaseService - Core CRUD Operations
 */
describe('DatabaseService - Core CRUD Operations', () => {
  let db: WebTimeTrackerDB;
  let service: DatabaseService;

  beforeEach(async () => {
    // Reset fake browser environment
    fakeBrowser.reset();

    db = new WebTimeTrackerDB();
    await db.open();

    service = new DatabaseService(db);
  });

  afterEach(async () => {
    if (db && db.isOpen()) {
      await db.delete();
      db.close();
    }
  });

  // ==================== EVENTS CRUD ====================
  describe('Events CRUD', () => {
    it('should add an event and retrieve it as unprocessed', async () => {
      // Arrange
      const eventData = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 100,
        url: 'https://event.test/1',
        visitId: uuidv4(),
        activityId: uuidv4(),
      };

      // Act
      const id = await service.addEvent(eventData);

      // Assert
      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);

      const unprocessed = await service.getUnprocessedEvents();
      expect(unprocessed).toHaveLength(1);
      expect(unprocessed[0].id).toBe(id);
      expect(unprocessed[0].isProcessed).toBe(0);
    });

    it('should mark events as processed', async () => {
      // Arrange
      const id1 = await service.addEvent({
        timestamp: Date.now(),
        eventType: 'active_time_start',
        tabId: 1,
        url: 'https://event.test/2',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });
      const id2 = await service.addEvent({
        timestamp: Date.now(),
        eventType: 'active_time_end',
        tabId: 1,
        url: 'https://event.test/3',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // Act
      const updatedCount = await service.markEventsAsProcessed([id1, id2]);

      // Assert
      expect(updatedCount).toBe(2);
      const unprocessedAfter = await service.getUnprocessedEvents();
      expect(unprocessedAfter).toHaveLength(0);
    });

    it('should delete events by IDs', async () => {
      // Arrange
      const id = await service.addEvent({
        timestamp: Date.now(),
        eventType: 'checkpoint',
        tabId: 2,
        url: 'https://event.test/4',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      const beforeDelete = await service.getUnprocessedEvents();
      expect(beforeDelete).toHaveLength(1);

      // Act
      const deletedCount = await service.deleteEventsByIds([id]);

      // Assert
      expect(deletedCount).toBe(1);
      const afterDelete = await service.getUnprocessedEvents();
      expect(afterDelete).toHaveLength(0);
    });

    it('should retrieve events by visit ID and activity ID', async () => {
      // Arrange – create two visits each with two events
      const visitId1 = uuidv4();
      const visitId2 = uuidv4();

      const activityId1 = uuidv4();
      const activityId2 = uuidv4();

      // Visit 1
      await service.addEvent({
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 10,
        url: 'https://visit.test/1',
        visitId: visitId1,
        activityId: activityId1,
      });
      await service.addEvent({
        timestamp: Date.now(),
        eventType: 'active_time_start',
        tabId: 10,
        url: 'https://visit.test/2',
        visitId: visitId1,
        activityId: activityId1,
      });

      // Visit 2
      await service.addEvent({
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 20,
        url: 'https://visit.test/3',
        visitId: visitId2,
        activityId: activityId2,
      });

      // Act & Assert – by visit ID
      const visit1Events = await service.getEventsByVisitId(visitId1);
      expect(visit1Events).toHaveLength(2);
      expect(visit1Events.every(e => e.visitId === visitId1)).toBe(true);

      const visit2Events = await service.getEventsByVisitId(visitId2);
      expect(visit2Events).toHaveLength(1);
      expect(visit2Events[0].visitId).toBe(visitId2);

      // Act & Assert – by activity ID
      const activityEvents = await service.getEventsByActivityId(activityId1);
      expect(activityEvents).toHaveLength(2);
      expect(activityEvents.every(e => e.activityId === activityId1)).toBe(true);
    });

    it('should retrieve events by type and time range', async () => {
      // Arrange – timestamps
      const now = Date.now();
      const start = now - 60_000; // 1 min ago
      const mid = now - 30_000; // 30s ago
      const end = now + 60_000; // 1 min later

      // Outside range event (should be ignored)
      await service.addEvent({
        timestamp: start - 10_000,
        eventType: 'checkpoint',
        tabId: 1,
        url: 'https://type.test/out',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // Inside range events
      await service.addEvent({
        timestamp: mid,
        eventType: 'checkpoint',
        tabId: 1,
        url: 'https://type.test/in1',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });
      await service.addEvent({
        timestamp: mid + 1000,
        eventType: 'checkpoint',
        tabId: 2,
        url: 'https://type.test/in2',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // Act
      const rangeEvents = await service.getEventsByTypeAndTimeRange(
        'checkpoint',
        start,
        end,
      );

      // Assert
      expect(rangeEvents).toHaveLength(2);
      expect(rangeEvents.every(e => e.eventType === 'checkpoint')).toBe(true);
      // Ensure timestamps within range
      expect(rangeEvents.every(e => e.timestamp >= start && e.timestamp <= end)).toBe(true);
    });

    it('should get all unprocessed events for recovery since a given time', async () => {
      // Construct 5 events with different types/processing states/timestamps
      const now = Date.now();
      const oldTs = now - 100_000;
      const midTs = now - 50_000;
      const newTs = now;

      // 1. Unprocessed, timestamp before cutoff, should be filtered
      await service.addEvent({
        timestamp: oldTs,
        eventType: 'open_time_start',
        tabId: 1,
        url: 'https://test/old',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // 2. Unprocessed, timestamp after cutoff, should be returned
      await service.addEvent({
        timestamp: midTs,
        eventType: 'active_time_start',
        tabId: 2,
        url: 'https://test/mid',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // 3. Processed, timestamp after cutoff, should not be returned
      const id3 = await service.addEvent({
        timestamp: midTs + 1000,
        eventType: 'checkpoint',
        tabId: 3,
        url: 'https://test/processed',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });
      await service.markEventsAsProcessed([id3]);

      // 4. Unprocessed, timestamp after cutoff, should be returned
      await service.addEvent({
        timestamp: newTs,
        eventType: 'open_time_start',
        tabId: 4,
        url: 'https://test/new',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });

      // 5. Processed, timestamp before cutoff, should not be returned
      const id5 = await service.addEvent({
        timestamp: oldTs,
        eventType: 'active_time_end',
        tabId: 5,
        url: 'https://test/old-processed',
        visitId: uuidv4(),
        activityId: uuidv4(),
      });
      await service.markEventsAsProcessed([id5]);

      // Set cutoff time to midTs
      const result = await service.getUnprocessedEventsForRecovery(midTs);

      // Assert: only return id2 and id4
      // only include unprocessed events
      expect(result.every(e => e.isProcessed === 0)).toBe(true);
      // only include events with timestamp >= midTs
      expect(result.every(e => e.timestamp >= midTs)).toBe(true);
      // id2 and id4 must be in the result
      const resultIds = result.map(e => e.tabId).sort();
      expect(resultIds).toEqual([2, 4]);

    });
  });

  // ==================== STATS CRUD ====================
  describe('Stats CRUD', () => {
    it('should upsert stats and reflect aggregated values', async () => {
      // Arrange
      const date = '2025-02-01';
      const url = 'https://stat.test/page';
      const baseData: TimeAggregationData = {
        date,
        url,
        hostname: 'stat.test',
        parentDomain: 'test',
        // Use explicit milliseconds for clarity, e.g., 60 seconds
        openTimeToAdd: 60000,
        activeTimeToAdd: 30000,
      };

      // Act 1 – create
      const key = await service.upsertStat(baseData);

      // Assert after creation
      const createdStats = await service.getStatsByDateRange(date, date);
      expect(createdStats).toHaveLength(1);
      expect(createdStats[0].total_open_time).toBe(60000);
      expect(createdStats[0].total_active_time).toBe(30000);

      // Act 2 – update same key
      await service.upsertStat({
        ...baseData,
        // Add 40 more seconds
        openTimeToAdd: 40000,
        activeTimeToAdd: 20000,
      });

      // Assert after update
      const updatedStats = await service.getStatsByDateRange(date, date);
      expect(updatedStats).toHaveLength(1);
      expect(updatedStats[0].key).toBe(key);
      // Assert the sum in milliseconds: 60000 + 40000
      expect(updatedStats[0].total_open_time).toBe(100000);
      // Assert the sum in milliseconds: 30000 + 20000
      expect(updatedStats[0].total_active_time).toBe(50000);
    });

    it('should query stats by hostname and parent domain', async () => {
      // Arrange – seed stats
      const records: TimeAggregationData[] = [
        {
          date: '2025-03-01',
          url: 'https://host1.example.com/a',
          hostname: 'host1.example.com',
          parentDomain: 'example.com',
          openTimeToAdd: 10,
          activeTimeToAdd: 5,
        },
        {
          date: '2025-03-02',
          url: 'https://host1.example.com/b',
          hostname: 'host1.example.com',
          parentDomain: 'example.com',
          openTimeToAdd: 20,
          activeTimeToAdd: 10,
        },
        {
          date: '2025-03-01',
          url: 'https://other.test.com/x',
          hostname: 'other.test.com',
          parentDomain: 'test.com',
          openTimeToAdd: 50,
          activeTimeToAdd: 25,
        },
      ];

      for (const r of records) {
        await service.upsertStat(r);
      }

      // Act – by hostname
      const host1Stats = await service.getStatsByHostname('host1.example.com');
      // Assert
      expect(host1Stats).toHaveLength(2);
      expect(host1Stats.every(s => s.hostname === 'host1.example.com')).toBe(true);

      // Act – by parent domain
      const exampleStats = await service.getStatsByParentDomain('example.com');
      expect(exampleStats).toHaveLength(2);
      expect(exampleStats.every(s => s.parentDomain === 'example.com')).toBe(true);
    });
  });

  // ==================== HEALTH ====================
  // NOT USED, will be deleted
  // describe('Database Health', () => {
  //   it('should return correct counts and healthy status', async () => {
  //     // Arrange – create events & stats
  //     await service.addEvent({
  //       timestamp: Date.now(),
  //       eventType: 'open_time_start',
  //       tabId: 123,
  //       url: 'https://health.test',
  //       visitId: uuidv4(),
  //       activityId: uuidv4(),
  //     });

  //     await service.upsertStat({
  //       date: '2025-04-01',
  //       url: 'https://health.test',
  //       hostname: 'health.test',
  //       parentDomain: 'test',
  //       openTimeToAdd: 5,
  //       activeTimeToAdd: 5,
  //     });

  //     // Mark event as processed so unprocessed count = 0
  //     const allEvents = await service.getUnprocessedEvents();
  //     await service.markEventsAsProcessed(allEvents.map(e => e.id!));

  //     // Act
  //     const health = await service.getDatabaseHealth();

  //     // Assert
  //     expect(health.isHealthy).toBe(true);
  //     expect(health.totalEventCount).toBe(1);
  //     expect(health.totalStatsCount).toBe(1);
  //     expect(health.unprocessedEventCount).toBe(0);
  //     expect(health.lastProcessedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  //   });
  // });
}); 