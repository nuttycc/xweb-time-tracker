/**
 * 事件Repository测试
 * 测试events_log表的CRUD操作、批量处理和查询功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { WebTimeDatabase } from '../../../src/services/database/schemas';
import { EventRepository } from '../../../src/services/database/repositories/event-repository';
import type { EventsLogSchema } from '../../../src/models/schemas/database-schema';

describe('EventRepository', () => {
  let db: WebTimeDatabase;
  let eventRepo: EventRepository;

  beforeEach(async () => {
    db = new WebTimeDatabase();
    await db.open();
    eventRepo = new EventRepository(db);
  });

  afterEach(async () => {
    await db.delete();
    await db.close();
  });

  describe('基本CRUD操作', () => {
    it('应该能够创建事件记录', async () => {
      const event: Omit<EventsLogSchema, 'id'> = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: 'activity-123',
        isProcessed: 0,
      };

      const id = await eventRepo.create(event);

      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);
    });

    it('应该能够根据ID获取事件记录', async () => {
      const event: Omit<EventsLogSchema, 'id'> = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: 'activity-123',
        isProcessed: 0,
      };

      const id = await eventRepo.create(event);
      const savedEvent = await eventRepo.getById(id);

      expect(savedEvent).toBeDefined();
      expect(savedEvent?.eventType).toBe('open_time_start');
      expect(savedEvent?.url).toBe('https://example.com');
      expect(savedEvent?.visitId).toBe('visit-123');
    });

    it('应该能够更新事件记录', async () => {
      const event: Omit<EventsLogSchema, 'id'> = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: 'activity-123',
        isProcessed: 0,
      };

      const id = await eventRepo.create(event);
      const updated = await eventRepo.update(id, { isProcessed: 1 });

      expect(updated).toBe(true);

      const savedEvent = await eventRepo.getById(id);
      expect(savedEvent?.isProcessed).toBe(1);
    });

    it('应该能够删除事件记录', async () => {
      const event: Omit<EventsLogSchema, 'id'> = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: 'activity-123',
        isProcessed: 0,
      };

      const id = await eventRepo.create(event);
      const deleted = await eventRepo.delete(id);

      expect(deleted).toBe(true);

      const savedEvent = await eventRepo.getById(id);
      expect(savedEvent).toBeUndefined();
    });
  });

  describe('批量操作', () => {
    it('应该能够批量创建事件记录', async () => {
      const events: Array<Omit<EventsLogSchema, 'id'>> = [
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
        {
          timestamp: Date.now() + 1000,
          eventType: 'open_time_end',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
      ];

      const result = await eventRepo.createBatch(events);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it('应该能够批量更新事件记录', async () => {
      // 先创建一些事件
      const events: Array<Omit<EventsLogSchema, 'id'>> = [
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
        {
          timestamp: Date.now() + 1000,
          eventType: 'open_time_end',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
      ];

      const createResult = await eventRepo.createBatch(events);
      expect(createResult.successCount).toBe(2);

      // 获取创建的事件ID
      const allEvents = await eventRepo.query();
      const ids = allEvents.map(e => e.id!);

      // 批量更新
      const updates = ids.map(id => ({
        id,
        updates: { isProcessed: 1 as const },
      }));

      const updateResult = await eventRepo.updateBatch(updates);

      expect(updateResult.successCount).toBe(2);
      expect(updateResult.failureCount).toBe(0);
    });

    it('应该能够批量删除事件记录', async () => {
      // 先创建一些事件
      const events: Array<Omit<EventsLogSchema, 'id'>> = [
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
        {
          timestamp: Date.now() + 1000,
          eventType: 'open_time_end',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-123',
          activityId: 'activity-123',
          isProcessed: 0,
        },
      ];

      await eventRepo.createBatch(events);

      // 获取创建的事件ID
      const allEvents = await eventRepo.query();
      const ids = allEvents.map(e => e.id!);

      // 批量删除
      const deleteResult = await eventRepo.deleteBatch(ids);

      expect(deleteResult.successCount).toBe(2);
      expect(deleteResult.failureCount).toBe(0);

      // 验证删除成功
      const remainingEvents = await eventRepo.query();
      expect(remainingEvents).toHaveLength(0);
    });
  });

  describe('查询和过滤', () => {
    beforeEach(async () => {
      // 创建测试数据
      const events: Array<Omit<EventsLogSchema, 'id'>> = [
        {
          timestamp: 1000,
          eventType: 'open_time_start',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 0,
        },
        {
          timestamp: 2000,
          eventType: 'open_time_end',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 1,
        },
        {
          timestamp: 3000,
          eventType: 'active_time_start',
          tabId: 456,
          url: 'https://test.com',
          visitId: 'visit-2',
          activityId: 'activity-2',
          isProcessed: 0,
        },
      ];

      await eventRepo.createBatch(events);
    });

    it('应该能够查询所有事件', async () => {
      const events = await eventRepo.query();
      expect(events).toHaveLength(3);
    });

    it('应该能够按时间范围过滤', async () => {
      const events = await eventRepo.query({
        startTime: 1500,
        endTime: 2500,
      });

      expect(events).toHaveLength(1);
      expect(events[0].timestamp).toBe(2000);
    });

    it('应该能够按事件类型过滤', async () => {
      const events = await eventRepo.query({
        eventTypes: ['open_time_start', 'open_time_end'],
      });

      expect(events).toHaveLength(2);
    });

    it('应该能够按处理状态过滤', async () => {
      const unprocessedEvents = await eventRepo.query({
        isProcessed: 0,
      });

      expect(unprocessedEvents).toHaveLength(2);

      const processedEvents = await eventRepo.query({
        isProcessed: 1,
      });

      expect(processedEvents).toHaveLength(1);
    });

    it('应该能够按访问ID过滤', async () => {
      const events = await eventRepo.query({
        visitIds: ['visit-1'],
      });

      expect(events).toHaveLength(2);
      expect(events.every(e => e.visitId === 'visit-1')).toBe(true);
    });

    it('应该能够按URL模式过滤', async () => {
      const events = await eventRepo.query({
        urlPattern: 'example.com',
      });

      expect(events).toHaveLength(2);
      expect(events.every(e => e.url.includes('example.com'))).toBe(true);
    });

    it('应该能够分页查询', async () => {
      const firstPage = await eventRepo.query(
        {},
        {
          limit: 2,
          offset: 0,
        }
      );

      expect(firstPage).toHaveLength(2);

      const secondPage = await eventRepo.query(
        {},
        {
          limit: 2,
          offset: 2,
        }
      );

      expect(secondPage).toHaveLength(1);
    });

    it('应该能够统计事件数量', async () => {
      const totalCount = await eventRepo.count();
      expect(totalCount).toBe(3);

      const unprocessedCount = await eventRepo.count({
        isProcessed: 0,
      });
      expect(unprocessedCount).toBe(2);
    });
  });

  describe('专用查询方法', () => {
    beforeEach(async () => {
      const events: Array<Omit<EventsLogSchema, 'id'>> = [
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 0,
        },
        {
          timestamp: Date.now() + 1000,
          eventType: 'open_time_end',
          tabId: 123,
          url: 'https://example.com',
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 1,
        },
      ];

      await eventRepo.createBatch(events);
    });

    it('应该能够获取未处理的事件', async () => {
      const unprocessedEvents = await eventRepo.getUnprocessed();

      expect(unprocessedEvents).toHaveLength(1);
      expect(unprocessedEvents[0].isProcessed).toBe(0);
    });

    it('应该能够根据访问ID获取事件', async () => {
      const events = await eventRepo.getByVisitId('visit-1');

      expect(events).toHaveLength(2);
      expect(events.every(e => e.visitId === 'visit-1')).toBe(true);
    });

    it('应该能够根据活动ID获取事件', async () => {
      const events = await eventRepo.getByActivityId('activity-1');

      expect(events).toHaveLength(2);
      expect(events.every(e => e.activityId === 'activity-1')).toBe(true);
    });

    it('应该能够标记事件为已处理', async () => {
      const allEvents = await eventRepo.query();
      const ids = allEvents.map(e => e.id!);

      const result = await eventRepo.markAsProcessed(ids);

      expect(result.successCount).toBe(2);

      const processedEvents = await eventRepo.query({ isProcessed: 1 });
      expect(processedEvents).toHaveLength(2);
    });
  });
});
