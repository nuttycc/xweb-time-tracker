/**
 * EventQueue Deduplication Tests
 * 
 * Tests for the intelligent deduplication mechanism in EventQueue.
 * Verifies LRU cache functionality, duplicate detection, and statistics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventQueue, createEventQueue } from '@/core/tracker/queue/EventQueue';
import { WebTimeTrackerDB } from '@/core/db/schemas';
import { DomainEvent } from '@/core/tracker/types';

// Mock database for testing
class MockWebTimeTrackerDB {
  public eventslog = {
    bulkAdd: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(1),
    clear: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    toArray: vi.fn().mockResolvedValue([]),
  };

  public aggregatedstats = {
    bulkAdd: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue('key'),
    clear: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    toArray: vi.fn().mockResolvedValue([]),
  };
}

const mockDB = new MockWebTimeTrackerDB() as unknown as WebTimeTrackerDB;

// Mock logger
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('EventQueue Deduplication Mechanism', () => {
  let eventQueue: EventQueue;

  // Helper function to create valid test events
  const createTestEvent = (overrides: Partial<DomainEvent> = {}): DomainEvent => ({
    eventType: 'open_time_end',
    tabId: 1,
    url: 'https://example.com',
    visitId: crypto.randomUUID(),
    activityId: null,
    timestamp: Date.now(),
    isProcessed: 0,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    eventQueue = createEventQueue(mockDB, {
      maxQueueSize: 100, // Increase to prevent auto-flush
      maxWaitTime: 60000, // Increase to prevent auto-flush
      maxDeduplicationCacheSize: 100,
      deduplicationTimeWindow: 60000, // 1 minute
    });
  });

  describe('Event Fingerprint Generation', () => {
    it('should generate unique fingerprints for different events', async () => {
      const event1 = createTestEvent({ eventType: 'open_time_start' });
      const event2 = createTestEvent({ eventType: 'open_time_end' });

      // Both events should be enqueued (different event types)
      await eventQueue.enqueue(event1);
      await eventQueue.enqueue(event2);

      expect(eventQueue.size()).toBe(2);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(0);
    });

    it('should generate same fingerprint for identical events', async () => {
      const sharedVisitId = crypto.randomUUID();
      const event1 = createTestEvent({ visitId: sharedVisitId });
      const event2 = createTestEvent({ visitId: sharedVisitId });

      // First event should be enqueued
      await eventQueue.enqueue(event1);
      expect(eventQueue.size()).toBe(1);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(0);

      // Second identical event should be filtered
      await eventQueue.enqueue(event2);
      expect(eventQueue.size()).toBe(1);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(1);
    });
  });

  describe('Duplicate Detection Logic', () => {
    it('should detect duplicates within time window', async () => {
      const baseEvent = createTestEvent();

      // Enqueue first event
      await eventQueue.enqueue(baseEvent);
      expect(eventQueue.size()).toBe(1);

      // Enqueue duplicate within time window
      await eventQueue.enqueue({ ...baseEvent, timestamp: Date.now() });
      expect(eventQueue.size()).toBe(1);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(1);
    });

    it('should allow events outside time window', async () => {
      const baseEvent = createTestEvent();

      // Enqueue first event
      await eventQueue.enqueue(baseEvent);
      expect(eventQueue.size()).toBe(1);

      // Mock time passage beyond deduplication window
      const futureTime = Date.now() + 70000; // 70 seconds later
      vi.spyOn(Date, 'now').mockReturnValue(futureTime);

      // Enqueue same event outside time window
      await eventQueue.enqueue({ ...baseEvent, timestamp: futureTime });
      expect(eventQueue.size()).toBe(2);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(0);
    });
  });

  describe('LRU Cache Management', () => {
    it('should manage cache size correctly', async () => {
      // Add several events to cache
      for (let i = 1; i <= 10; i++) {
        const event = createTestEvent({
          tabId: i,
          visitId: crypto.randomUUID(),
        });
        await eventQueue.enqueue(event);
      }

      expect(eventQueue.getStats().deduplicationCacheSize).toBe(10);
      expect(eventQueue.size()).toBe(10);
    });

    it('should detect duplicates correctly with cache', async () => {
      const event = createTestEvent();

      // Enqueue original event
      await eventQueue.enqueue(event);
      expect(eventQueue.getStats().deduplicationCacheSize).toBe(1);

      // Enqueue duplicate - should be filtered
      await eventQueue.enqueue(event);
      expect(eventQueue.getStats().deduplicationCacheSize).toBe(1);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(1);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track deduplication statistics correctly', async () => {
      const event = createTestEvent();

      // Enqueue original event
      await eventQueue.enqueue(event);

      // Enqueue duplicates
      await eventQueue.enqueue(event);
      await eventQueue.enqueue(event);

      const stats = eventQueue.getDeduplicationStats();
      expect(stats.duplicatesFiltered).toBe(2);
      expect(stats.cacheSize).toBe(1);
      expect(stats.cacheCapacity).toBe(100);
      expect(stats.timeWindow).toBe(60000);
      expect(stats.filterRate).toBeGreaterThan(0);
    });

    it('should calculate filter rate correctly', async () => {
      const sharedVisitId = crypto.randomUUID();
      const event = createTestEvent({ visitId: sharedVisitId });

      // Enqueue 1 original + 3 duplicates = 4 total, 3 filtered
      await eventQueue.enqueue(event);
      await eventQueue.enqueue(event);
      await eventQueue.enqueue(event);
      await eventQueue.enqueue(event);

      const stats = eventQueue.getDeduplicationStats();
      expect(stats.filterRate).toBe(75); // 3/4 = 75%
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with null activityId', async () => {
      const sharedVisitId = crypto.randomUUID();
      const event1 = createTestEvent({
        eventType: 'checkpoint',
        visitId: sharedVisitId,
        activityId: null,
      });

      const event2 = createTestEvent({
        eventType: 'checkpoint',
        visitId: sharedVisitId,
        activityId: null,
      });

      await eventQueue.enqueue(event1);
      await eventQueue.enqueue(event2);

      expect(eventQueue.size()).toBe(1);
      expect(eventQueue.getStats().duplicatesFiltered).toBe(1);
    });

    it('should handle empty cache gracefully', () => {
      const stats = eventQueue.getDeduplicationStats();
      expect(stats.duplicatesFiltered).toBe(0);
      expect(stats.cacheSize).toBe(0);
      expect(stats.filterRate).toBe(0);
    });
  });
});
