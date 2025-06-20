/**
 * 数据库边界条件测试
 * 测试极限情况、边界值和异常场景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { WebTimeDatabase } from '../../../src/services/database/schemas';
import { EventRepository, StatsRepository } from '../../../src/services/database/repositories';
import { TestDataFactory } from '../../fixtures/database/test-data-factory';
import type {
  EventsLogSchema,
  AggregatedStatsSchema,
} from '../../../src/models/schemas/database-schema';

describe('数据库边界条件测试', () => {
  let db: WebTimeDatabase;
  let eventRepo: EventRepository;
  let statsRepo: StatsRepository;
  let testDataFactory: TestDataFactory;

  beforeEach(async () => {
    db = new WebTimeDatabase();
    await db.open();
    eventRepo = new EventRepository(db);
    statsRepo = new StatsRepository(db);
    testDataFactory = new TestDataFactory();
  });

  afterEach(async () => {
    await db.delete();
    await db.close();
    testDataFactory.reset();
  });

  describe('数据验证边界测试', () => {
    it('应该处理最小有效数据', async () => {
      const minimalEvent: Omit<EventsLogSchema, 'id'> = {
        timestamp: 1,
        eventType: 'checkpoint',
        tabId: 1,
        url: 'https://a.com',
        visitId: 'v',
        activityId: null,
        isProcessed: 0,
      };

      const id = await eventRepo.create(minimalEvent);
      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);
    });

    it('应该处理最大有效数据', async () => {
      const maximalEvent: Omit<EventsLogSchema, 'id'> = {
        timestamp: 4102444800000, // 2099-12-31 23:59:59 UTC (合理的最大时间戳)
        eventType: 'open_time_start',
        tabId: 2147483647, // Chrome实际支持的最大tabId
        url: 'https://' + 'a'.repeat(100) + '.com',
        visitId: 'v'.repeat(50),
        activityId: 'a'.repeat(50),
        isProcessed: 1,
      };

      const id = await eventRepo.create(maximalEvent);
      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);
    });

    it('应该拒绝无效的URL格式', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'invalid-url',
        visitId: 'visit-1',
        activityId: null,
        isProcessed: 0 as const,
      };

      await expect(eventRepo.create(invalidEvent)).rejects.toThrow();
    });

    it('应该拒绝无效的负数tabId', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: -2, // 使用-2，因为-1是Chrome允许的特殊值
        url: 'https://example.com',
        visitId: 'visit-1',
        activityId: null,
        isProcessed: 0 as const,
      };

      await expect(eventRepo.create(invalidEvent)).rejects.toThrow();
    });

    it('应该拒绝空的visitId', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com',
        visitId: '',
        activityId: null,
        isProcessed: 0 as const,
      };

      await expect(eventRepo.create(invalidEvent)).rejects.toThrow();
    });
  });

  describe('大量数据处理测试', () => {
    it('应该处理大批量事件创建', async () => {
      const largeEventBatch = testDataFactory.createPerformanceTestEvents(1000);

      const result = await eventRepo.createBatch(largeEventBatch);
      expect(result.successCount).toBeGreaterThanOrEqual(999); // 允许少量失败
      expect(result.failureCount).toBeLessThanOrEqual(1);
    });

    it('应该处理大量查询操作', async () => {
      // 先创建大量数据
      const events = testDataFactory.createPerformanceTestEvents(500);
      await eventRepo.createBatch(events);

      // 执行各种查询
      const allEvents = await eventRepo.query();
      expect(allEvents.length).toBeGreaterThanOrEqual(499);

      const filteredEvents = await eventRepo.query({
        eventTypes: ['open_time_start', 'open_time_end'],
      });
      expect(filteredEvents.length).toBeGreaterThan(0);

      const count = await eventRepo.count();
      expect(count).toBeGreaterThanOrEqual(499);
    });

    it('应该处理大量删除操作', async () => {
      // 创建大量数据
      const events = testDataFactory.createPerformanceTestEvents(200);
      await eventRepo.createBatch(events);

      // 获取所有ID
      const allEvents = await eventRepo.query();
      const ids = allEvents.map(e => e.id!);

      // 批量删除
      const deleteResult = await eventRepo.deleteBatch(ids);
      expect(deleteResult.successCount).toBeGreaterThanOrEqual(199);

      // 验证删除
      const remainingCount = await eventRepo.count();
      expect(remainingCount).toBeLessThanOrEqual(1);
    });
  });

  describe('空数据处理测试', () => {
    it('应该处理空查询结果', async () => {
      const emptyEvents = await eventRepo.query({ eventTypes: ['checkpoint'] });
      expect(emptyEvents).toHaveLength(0);

      const emptyStats = await statsRepo.query({ hostnames: ['nonexistent.com'] });
      expect(emptyStats).toHaveLength(0);
    });

    it('应该处理空批量操作', async () => {
      const emptyCreateResult = await eventRepo.createBatch([]);
      expect(emptyCreateResult.successCount).toBe(0);
      expect(emptyCreateResult.failureCount).toBe(0);

      const emptyDeleteResult = await eventRepo.deleteBatch([]);
      expect(emptyDeleteResult.successCount).toBe(0);
      expect(emptyDeleteResult.failureCount).toBe(0);
    });

    it('应该处理不存在的记录操作', async () => {
      const nonExistentEvent = await eventRepo.getById(999999);
      expect(nonExistentEvent).toBeUndefined();

      const updateResult = await eventRepo.update(999999, { isProcessed: 1 });
      expect(updateResult).toBe(false);

      const deleteResult = await eventRepo.delete(999999);
      expect(deleteResult).toBe(false);
    });
  });

  describe('并发操作边界测试', () => {
    it('应该处理并发创建操作', async () => {
      const promises = [];

      // 创建50个并发操作
      for (let i = 0; i < 50; i++) {
        promises.push(
          eventRepo.create({
            timestamp: Date.now() + i,
            eventType: 'checkpoint',
            tabId: i + 1,
            url: `https://concurrent${i}.com`,
            visitId: `visit-${i}`,
            activityId: null,
            isProcessed: 0,
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      expect(successCount).toBeGreaterThanOrEqual(48); // 允许少量失败
    });

    it('应该处理并发读写操作', async () => {
      // 先创建一些数据
      const events = testDataFactory.createEvents(10);
      await eventRepo.createBatch(events);

      const promises = [];

      // 混合读写操作
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          // 读操作
          promises.push(eventRepo.query());
        } else {
          // 写操作
          promises.push(eventRepo.create(testDataFactory.createEvent()));
        }
      }

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      expect(successCount).toBeGreaterThanOrEqual(18); // 允许少量失败
    });
  });

  describe('内存和性能边界测试', () => {
    it('应该处理内存密集型操作', async () => {
      // 创建大量数据但分批处理
      const batchSize = 100;
      const totalBatches = 5;

      for (let batch = 0; batch < totalBatches; batch++) {
        const events = testDataFactory.createEvents(batchSize);
        const result = await eventRepo.createBatch(events);
        expect(result.successCount).toBe(batchSize);
      }

      const totalCount = await eventRepo.count();
      expect(totalCount).toBe(batchSize * totalBatches);
    });

    it('应该处理复杂查询操作', async () => {
      // 创建多样化的测试数据
      const events = testDataFactory.createPerformanceTestEvents(200);
      await eventRepo.createBatch(events);

      // 执行复杂查询
      const complexQuery = await eventRepo.query(
        {
          startTime: Date.now() - 86400000, // 24小时前
          endTime: Date.now(),
          eventTypes: ['open_time_start', 'active_time_start'],
          isProcessed: 0,
        },
        {
          limit: 50,
          offset: 10,
        }
      );

      expect(Array.isArray(complexQuery)).toBe(true);
      expect(complexQuery.length).toBeLessThanOrEqual(50);
    });
  });

  describe('数据一致性边界测试', () => {
    it('应该维护事务一致性', async () => {
      const testEvents = testDataFactory.createEventSequence('visit-consistency', 'activity-1');

      // 批量创建相关事件
      const createResult = await eventRepo.createBatch(testEvents);
      expect(createResult.successCount).toBe(testEvents.length);

      // 验证数据一致性
      const savedEvents = await eventRepo.getByVisitId('visit-consistency');
      expect(savedEvents).toHaveLength(testEvents.length);

      // 验证时间序列正确
      const sortedEvents = savedEvents.sort((a, b) => a.timestamp - b.timestamp);
      expect(sortedEvents[0].eventType).toBe('open_time_start');
      expect(sortedEvents[sortedEvents.length - 1].eventType).toBe('open_time_end');
    });

    it('应该处理数据完整性约束', async () => {
      // 测试唯一性约束
      const stats: AggregatedStatsSchema = {
        key: '2024-01-01:https://unique-test.com',
        date: '2024-01-01',
        url: 'https://unique-test.com',
        hostname: 'unique-test.com',
        parentDomain: 'unique-test.com',
        total_open_time: 1000,
        total_active_time: 500,
        last_updated: Date.now(),
      };

      // 第一次创建应该成功
      await statsRepo.create(stats);

      // 第二次创建相同key应该失败或更新
      const duplicateStats = { ...stats, total_open_time: 2000 };

      // 使用upsert应该成功更新（累加时间数据）
      await statsRepo.upsert(duplicateStats);

      const savedStats = await statsRepo.getByKey(stats.key);
      expect(savedStats?.total_open_time).toBe(3000); // 1000 + 2000 = 3000 (累加)
    });
  });
});
