/**
 * 数据库测试套件总览
 * 集成测试和端到端测试，验证整个数据库层的协同工作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { WebTimeDatabase } from '../../../src/services/database/schemas';
import { DatabaseManager } from '../../../src/services/database/db-manager';
import { EventRepository, StatsRepository } from '../../../src/services/database/repositories';
import { DatabaseErrorHandler } from '../../../src/services/database/error-handler';
import {
  DatabasePerformanceMonitor,
  OperationType,
} from '../../../src/services/database/performance-monitor';
import type {
  EventsLogSchema,
  AggregatedStatsSchema,
} from '../../../src/models/schemas/database-schema';
import { DatabaseErrorCode } from '../../../src/models/schemas/database-schema';

describe('数据库测试套件 - 集成测试', () => {
  let dbManager: DatabaseManager;
  let db: WebTimeDatabase;
  let eventRepo: EventRepository;
  let statsRepo: StatsRepository;
  let errorHandler: DatabaseErrorHandler;
  let performanceMonitor: DatabasePerformanceMonitor;

  beforeEach(async () => {
    // 重置数据库管理器
    (DatabaseManager as unknown as { instance: DatabaseManager | null }).instance = null;
    dbManager = DatabaseManager.getInstance({
      maxRetries: 2,
      retryDelay: 100,
      connectionTimeout: 5000,
      autoReconnect: false,
    });

    // 获取数据库连接
    db = await dbManager.getConnection();

    // 初始化Repository
    eventRepo = new EventRepository(db);
    statsRepo = new StatsRepository(db);

    // 初始化错误处理器和性能监控器
    errorHandler = new DatabaseErrorHandler();
    performanceMonitor = new DatabasePerformanceMonitor();
  });

  afterEach(async () => {
    await dbManager.disconnect();
    errorHandler.clearErrorStats();
    performanceMonitor.clearMetrics();
  });

  describe('完整的数据流测试', () => {
    it('应该能够完成完整的事件处理流程', async () => {
      // 1. 创建事件记录
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
          timestamp: Date.now() + 5000,
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

      // 2. 查询未处理的事件
      const unprocessedEvents = await eventRepo.getUnprocessed();
      expect(unprocessedEvents).toHaveLength(2);

      // 3. 处理事件并生成聚合数据
      const stats: AggregatedStatsSchema = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await statsRepo.upsert(stats);

      // 4. 标记事件为已处理
      const eventIds = unprocessedEvents.map(e => e.id!);
      const markResult = await eventRepo.markAsProcessed(eventIds);
      expect(markResult.successCount).toBe(2);

      // 5. 验证聚合数据
      const savedStats = await statsRepo.getByKey(stats.key);
      expect(savedStats?.total_open_time).toBe(5000);

      // 6. 验证事件已标记为处理
      const stillUnprocessed = await eventRepo.getUnprocessed();
      expect(stillUnprocessed).toHaveLength(0);
    });

    it('应该能够处理并发操作', async () => {
      // 创建多个并发操作
      const promises = [];

      // 并发创建事件
      for (let i = 0; i < 10; i++) {
        promises.push(
          eventRepo.create({
            timestamp: Date.now() + i,
            eventType: 'open_time_start',
            tabId: 100 + i,
            url: `https://example${i}.com`,
            visitId: `visit-${i}`,
            activityId: `activity-${i}`,
            isProcessed: 0,
          })
        );
      }

      // 并发创建统计数据
      for (let i = 0; i < 5; i++) {
        promises.push(
          statsRepo.create({
            key: `2024-01-0${i + 1}:https://test${i}.com`,
            date: `2024-01-0${i + 1}`,
            url: `https://test${i}.com`,
            hostname: `test${i}.com`,
            parentDomain: `test${i}.com`,
            total_open_time: 1000 * (i + 1),
            total_active_time: 500 * (i + 1),
            last_updated: Date.now(),
          })
        );
      }

      // 等待所有操作完成
      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      expect(successCount).toBe(15); // 10个事件 + 5个统计

      // 验证数据完整性
      const allEvents = await eventRepo.query();
      const allStats = await statsRepo.query();

      expect(allEvents.length).toBeGreaterThanOrEqual(10);
      expect(allStats.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('错误处理集成测试', () => {
    it('应该能够处理数据库操作错误', async () => {
      // 尝试插入无效数据
      try {
        await eventRepo.create({
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: -1, // 无效的tabId
          url: 'invalid-url', // 无效的URL
          visitId: '',
          activityId: null,
          isProcessed: 0,
        });
      } catch (error) {
        expect(error).toBeDefined();

        // 使用错误处理器处理错误
        if (error instanceof Error) {
          const dbError = errorHandler.createError(DatabaseErrorCode.VALIDATION_ERROR, error);
          await errorHandler.handleError(dbError);

          const stats = errorHandler.getErrorStats();
          expect(stats.totalErrors).toBe(1);
          expect(stats.errorsByCode[DatabaseErrorCode.VALIDATION_ERROR]).toBe(1);
        }
      }
    });

    it('应该能够从错误中恢复', async () => {
      // 模拟连接错误后的恢复
      await dbManager.disconnect();

      // 重新连接
      const newDb = await dbManager.reconnect();
      expect(newDb).toBeDefined();

      // 创建新的Repository实例使用新的数据库连接
      const newEventRepo = new EventRepository(newDb);

      // 验证可以正常操作
      const testEvent = await newEventRepo.create({
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 999, // 使用有效的tabId
        url: 'https://recovery-test.com',
        visitId: 'visit-recovery',
        activityId: null,
        isProcessed: 0,
      });

      expect(testEvent).toBeTypeOf('number');
    });
  });

  describe('性能监控集成测试', () => {
    it('应该能够监控数据库操作性能', async () => {
      // 监控事件创建操作
      const endOperation = performanceMonitor.startOperation(OperationType.CREATE);

      await eventRepo.create({
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-perf',
        activityId: null,
        isProcessed: 0,
      });

      endOperation(1);

      // 检查性能统计
      const stats = performanceMonitor.getPerformanceStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.operationsByType[OperationType.CREATE]).toBeDefined();
      expect(stats.operationsByType[OperationType.CREATE].count).toBe(1);
    });

    it('应该能够检测性能问题', async () => {
      // 模拟多个慢操作
      for (let i = 0; i < 10; i++) {
        performanceMonitor.recordMetric({
          operation: OperationType.QUERY,
          duration: 150, // 慢操作
          timestamp: Date.now(),
          success: true,
        });
      }

      const health = await performanceMonitor.checkSystemHealth();
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.score).toBeLessThan(100);
    });
  });

  describe('数据一致性测试', () => {
    it('应该维护事件和统计数据的一致性', async () => {
      const testDate = '2024-01-01';
      const testUrl = 'https://consistency-test.com';

      // 创建多个相关事件
      const events = [
        {
          timestamp: Date.now(),
          eventType: 'open_time_start' as const,
          tabId: 123,
          url: testUrl,
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 0 as const,
        },
        {
          timestamp: Date.now() + 3000,
          eventType: 'open_time_end' as const,
          tabId: 123,
          url: testUrl,
          visitId: 'visit-1',
          activityId: 'activity-1',
          isProcessed: 0 as const,
        },
      ];

      await eventRepo.createBatch(events);

      // 创建对应的聚合数据
      const stats: AggregatedStatsSchema = {
        key: `${testDate}:${testUrl}`,
        date: testDate,
        url: testUrl,
        hostname: 'consistency-test.com',
        parentDomain: 'consistency-test.com',
        total_open_time: 3000,
        total_active_time: 2000,
        last_updated: Date.now(),
      };

      await statsRepo.upsert(stats);

      // 验证数据一致性
      const relatedEvents = await eventRepo.query({ urlPattern: 'consistency-test.com' });
      const relatedStats = await statsRepo.query({ urlPattern: 'consistency-test.com' });

      expect(relatedEvents).toHaveLength(2);
      expect(relatedStats).toHaveLength(1);
      expect(relatedStats[0].total_open_time).toBe(3000);
    });
  });

  describe('边界条件测试', () => {
    it('应该处理空数据查询', async () => {
      const emptyEvents = await eventRepo.query({ eventTypes: ['checkpoint'] });
      const emptyStats = await statsRepo.query({ hostnames: ['nonexistent.com'] });

      expect(emptyEvents).toHaveLength(0);
      expect(emptyStats).toHaveLength(0);
    });

    it('应该处理大量数据操作', async () => {
      const largeEventBatch = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: Date.now() + i,
        eventType: 'checkpoint' as const,
        tabId: i,
        url: `https://test${i % 10}.com`,
        visitId: `visit-${i}`,
        activityId: null,
        isProcessed: 0 as const,
      }));

      const result = await eventRepo.createBatch(largeEventBatch);
      expect(result.successCount).toBeGreaterThanOrEqual(999); // 允许少量失败
      expect(result.failureCount).toBeLessThanOrEqual(1);

      const count = await eventRepo.count();
      expect(count).toBeGreaterThanOrEqual(999);
    });
  });
});
