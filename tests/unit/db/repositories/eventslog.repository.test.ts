/**
 * EventsLogRepository Unit Tests
 *
 * Tests for EventsLog repository CRUD operations, domain-specific queries,
 * validation, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import { EventsLogRepository } from '@/db/repositories/eventslog.repository';
import { ValidationError, RepositoryError } from '@/db/repositories/base.repository';
import type { EventsLogRecord, EventType } from '@/db/schemas/eventslog.schema';
import { randomUUID } from 'crypto';

// Test database class
class TestDB extends Dexie {
  public eventslog!: Dexie.Table<EventsLogRecord, number>;

  constructor() {
    super('TestEventsLogDB');
    this.version(1).stores({
      eventslog: '++id, timestamp, eventType, tabId, url, visitId, activityId, isProcessed',
    });
  }
}

describe('EventsLogRepository', () => {
  let db: TestDB;
  let repository: EventsLogRepository;

  beforeEach(async () => {
    db = new TestDB();
    repository = new EventsLogRepository(
      db as unknown as ConstructorParameters<typeof EventsLogRepository>[0]
    );
    await db.eventslog.clear();
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  // Helper function to create test event data
  const createTestEvent = (
    overrides: Partial<EventsLogRecord> = {}
  ): Omit<EventsLogRecord, 'id' | 'isProcessed'> => ({
    timestamp: Date.now(),
    eventType: 'checkpoint',
    tabId: 1,
    url: 'https://example.com',
    visitId: randomUUID(),
    activityId: randomUUID(),
    ...overrides,
  });

  describe('createEvent', () => {
    it('should create a new event with default isProcessed = 0', async () => {
      const eventData = createTestEvent();

      const eventId = await repository.createEvent(eventData);

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('number');

      const created = await repository.findById(eventId);
      expect(created).toBeDefined();
      expect(created!.eventType).toBe(eventData.eventType);
      expect(created!.url).toBe(eventData.url);
      expect(created!.isProcessed).toBe(0); // Should default to unprocessed
    });

    it('should validate event data before creation', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'invalid_type' as unknown as EventType, // Invalid event type
        tabId: 1,
        url: 'https://example.com',
        visitId: randomUUID(),
        activityId: randomUUID(),
      };

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });

    it('should handle invalid URL', async () => {
      const invalidEvent = createTestEvent({
        url: 'not-a-valid-url', // Invalid URL
      });

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });

    it('should handle invalid timestamp', async () => {
      const invalidEvent = createTestEvent({
        timestamp: 123, // Too small timestamp (should be in milliseconds)
      });

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });
  });

  describe('getUnprocessedEvents', () => {
    beforeEach(async () => {
      // Create test events with different processed states
      const events = [
        { ...createTestEvent(), isProcessed: 0 as const },
        { ...createTestEvent(), isProcessed: 1 as const },
        { ...createTestEvent(), isProcessed: 0 as const },
        { ...createTestEvent(), isProcessed: 0 as const },
      ];

      for (const event of events) {
        await db.eventslog.add(event as EventsLogRecord);
      }
    });

    it('should return only unprocessed events', async () => {
      const unprocessed = await repository.getUnprocessedEvents();

      expect(unprocessed).toHaveLength(3);
      unprocessed.forEach(event => {
        expect(event.isProcessed).toBe(0);
      });
    });

    it('should support pagination', async () => {
      const firstPage = await repository.getUnprocessedEvents({
        limit: 2,
        offset: 0,
      });

      expect(firstPage).toHaveLength(2);

      const secondPage = await repository.getUnprocessedEvents({
        limit: 2,
        offset: 2,
      });

      expect(secondPage).toHaveLength(1);
    });

    it('should support ordering by timestamp', async () => {
      const events = await repository.getUnprocessedEvents({
        orderBy: 'timestamp',
        orderDirection: 'desc',
      });

      expect(events.length).toBeGreaterThan(0);
      // Check if events are ordered by timestamp descending
      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].timestamp).toBeGreaterThanOrEqual(events[i].timestamp);
      }
    });

    it('should return empty array when no unprocessed events exist', async () => {
      await db.eventslog.clear();

      const unprocessed = await repository.getUnprocessedEvents();
      expect(unprocessed).toEqual([]);
    });
  });

  describe('markEventsAsProcessed', () => {
    it('should mark multiple events as processed', async () => {
      const eventIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const eventId = await repository.createEvent(createTestEvent());
        eventIds.push(eventId);
      }

      const updateCount = await repository.markEventsAsProcessed(eventIds);
      expect(updateCount).toBe(3);

      for (const eventId of eventIds) {
        const updated = await repository.findById(eventId);
        expect(updated!.isProcessed).toBe(1);
      }
    });

    it('should handle empty array gracefully', async () => {
      const updateCount = await repository.markEventsAsProcessed([]);
      expect(updateCount).toBe(0);
    });

    it('should handle non-existent event IDs gracefully', async () => {
      const updateCount = await repository.markEventsAsProcessed([999, 1000]);
      expect(updateCount).toBe(0);
    });
  });

  describe('getEventsByVisitId', () => {
    const testVisitId = randomUUID();

    beforeEach(async () => {
      // Create events with same visitId and different visitIds
      const events = [
        { ...createTestEvent(), visitId: testVisitId, isProcessed: 0 as const },
        { ...createTestEvent(), visitId: testVisitId, isProcessed: 0 as const },
        { ...createTestEvent(), visitId: randomUUID(), isProcessed: 0 as const }, // Different visitId
        { ...createTestEvent(), visitId: testVisitId, isProcessed: 0 as const },
      ];

      for (const event of events) {
        await db.eventslog.add(event as EventsLogRecord);
      }
    });

    it('should return events for specific visitId', async () => {
      const events = await repository.getEventsByVisitId(testVisitId);

      expect(events).toHaveLength(3);
      events.forEach(event => {
        expect(event.visitId).toBe(testVisitId);
      });
    });

    it('should support pagination for visitId query', async () => {
      const firstPage = await repository.getEventsByVisitId(testVisitId, {
        limit: 2,
        offset: 0,
      });

      expect(firstPage).toHaveLength(2);

      const secondPage = await repository.getEventsByVisitId(testVisitId, {
        limit: 2,
        offset: 2,
      });

      expect(secondPage).toHaveLength(1);
    });

    it('should return empty array for non-existent visitId', async () => {
      const events = await repository.getEventsByVisitId('non-existent-visit-id');
      expect(events).toEqual([]);
    });
  });

  describe('getEventsByActivityId', () => {
    const testActivityId = randomUUID();

    beforeEach(async () => {
      // Create events with same activityId and different activityIds
      const events = [
        { ...createTestEvent(), activityId: testActivityId, isProcessed: 0 as const },
        { ...createTestEvent(), activityId: testActivityId, isProcessed: 0 as const },
        { ...createTestEvent(), activityId: randomUUID(), isProcessed: 0 as const }, // Different activityId
        { ...createTestEvent(), activityId: null, isProcessed: 0 as const }, // Null activityId
      ];

      for (const event of events) {
        await db.eventslog.add(event as EventsLogRecord);
      }
    });

    it('should return events for specific activityId', async () => {
      const events = await repository.getEventsByActivityId(testActivityId);

      expect(events).toHaveLength(2);
      events.forEach(event => {
        expect(event.activityId).toBe(testActivityId);
      });
    });

    it('should support pagination for activityId query', async () => {
      const firstPage = await repository.getEventsByActivityId(testActivityId, {
        limit: 1,
        offset: 0,
      });

      expect(firstPage).toHaveLength(1);

      const secondPage = await repository.getEventsByActivityId(testActivityId, {
        limit: 1,
        offset: 1,
      });

      expect(secondPage).toHaveLength(1);
    });

    it('should return empty array for non-existent activityId', async () => {
      const events = await repository.getEventsByActivityId('non-existent-activity-id');
      expect(events).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      const mockError = new Error('Database connection failed');
      // Mock the add method to reject with error
      vi.spyOn(db.eventslog, 'add').mockImplementation(() => {
        return Promise.reject(mockError) as ReturnType<typeof db.eventslog.add>;
      });

      const eventData = createTestEvent();

      await expect(repository.createEvent(eventData)).rejects.toThrow(RepositoryError);
    });

    it('should handle query errors', async () => {
      const mockError = new Error('Query failed');
      // Mock the where method to throw error
      vi.spyOn(db.eventslog, 'where').mockImplementation(() => {
        throw mockError;
      });

      await expect(repository.getUnprocessedEvents()).rejects.toThrow(RepositoryError);
    });
  });

  describe('validation', () => {
    it('should validate event type enum', async () => {
      const invalidEvent = createTestEvent({
        eventType: 'invalid_event_type' as unknown as EventType,
      });

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });

    it('should validate UUID format for visitId', async () => {
      const invalidEvent = createTestEvent({
        visitId: 'not-a-uuid',
      });

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });

    it('should validate UUID format for activityId when not null', async () => {
      const invalidEvent = createTestEvent({
        activityId: 'not-a-uuid',
      });

      await expect(repository.createEvent(invalidEvent)).rejects.toThrow(ValidationError);
    });

    it('should allow null activityId', async () => {
      const validEvent = createTestEvent({
        activityId: null,
      });

      const eventId = await repository.createEvent(validEvent);
      expect(eventId).toBeDefined();

      const created = await repository.findById(eventId);
      expect(created!.activityId).toBeNull();
    });
  });
});
