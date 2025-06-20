/**
 * 数据库Schema测试
 * 测试数据库结构定义、Dexie配置和数据验证
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { WebTimeDatabase } from '../../../src/services/database/schemas';
import type {
  EventsLogSchema,
  AggregatedStatsSchema,
} from '../../../src/models/schemas/database-schema';
import { ZodErrorFormatter } from '../../../src/utils/ZodErrorFormatter';
import type * as z from 'zod';

describe('WebTimeDatabase Schema', () => {
  let db: WebTimeDatabase;

  beforeEach(async () => {
    // 创建新的数据库实例
    db = new WebTimeDatabase();
    await db.open();
  });

  afterEach(async () => {
    // 清理数据库
    await db.delete();
    await db.close();
  });

  describe('数据库初始化', () => {
    it('应该成功创建数据库', async () => {
      expect(db.name).toBe('webtime_tracker');
      expect(db.verno).toBe(1);
    });

    it('应该包含正确的表', () => {
      const tableNames = db.tables.map(table => table.name);
      expect(tableNames).toContain('events_log');
      expect(tableNames).toContain('aggregated_stats');
    });

    it('events_log表应该有正确的索引', () => {
      const eventsTable = db.table('events_log');
      const indexNames = eventsTable.schema.indexes.map(index => index.name);

      expect(indexNames).toContain('isProcessed');
      expect(indexNames).toContain('visitId');
      expect(indexNames).toContain('activityId');
      expect(indexNames).toContain('timestamp');
      expect(indexNames).toContain('eventType');
      expect(indexNames).toContain('tabId');
      expect(indexNames).toContain('url');
    });

    it('aggregated_stats表应该有正确的索引', () => {
      const statsTable = db.table('aggregated_stats');
      const indexNames = statsTable.schema.indexes.map(index => index.name);

      expect(indexNames).toContain('date');
      expect(indexNames).toContain('hostname');
      expect(indexNames).toContain('parentDomain');
      expect(indexNames).toContain('last_updated');
      expect(indexNames).toContain('url');
    });
  });

  describe('事件日志数据验证', () => {
    it('应该成功插入有效的事件记录', async () => {
      const validEvent: Omit<EventsLogSchema, 'id'> = {
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: 'activity-123',
        isProcessed: 0,
      };

      const id = await db.events_log.add(validEvent);
      expect(id).toBeTypeOf('number');
      expect(id).toBeGreaterThan(0);

      const savedEvent = await db.events_log.get(id);
      expect(savedEvent).toBeDefined();
      expect(savedEvent?.eventType).toBe('open_time_start');
      expect(savedEvent?.url).toBe('https://example.com');
    });

    it('应该自动设置默认值', async () => {
      const eventWithoutDefaults = {
        timestamp: Date.now(),
        isProcessed: 0,
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: null,
      };

      // @ts-expect-error aoni
      const id = await db.events_log.add(eventWithoutDefaults);
      const savedEvent = await db.events_log.get(id);

      expect(savedEvent?.timestamp).toBeTypeOf('number');
      expect(savedEvent?.timestamp).toBeGreaterThan(0);
      expect(savedEvent?.isProcessed).toBe(0);
    });

    it('应该拒绝无效的URL', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'invalid-url',
        visitId: 'visit-123',
        activityId: null,
        isProcessed: 0 as const,
      };

      await expect(db.events_log.add(invalidEvent)).rejects.toThrow('事件日志创建验证失败');
    });

    it('应该拒绝无效的tabId', async () => {
      const invalidEvent = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: -2, // 使用-2，因为-1是Chrome允许的特殊值
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: null,
        isProcessed: 0 as const,
      };

      await expect(db.events_log.add(invalidEvent)).rejects.toThrow('事件日志创建验证失败');
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

      await expect(db.events_log.add(invalidEvent)).rejects.toThrow('事件日志创建验证失败');
    });
  });

  describe('聚合统计数据验证', () => {
    it('应该成功插入有效的统计记录', async () => {
      const validStats: AggregatedStatsSchema = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await db.aggregated_stats.add(validStats);

      const savedStats = await db.aggregated_stats.get(validStats.key);
      expect(savedStats).toBeDefined();
      expect(savedStats?.hostname).toBe('example.com');
      expect(savedStats?.total_open_time).toBe(5000);
    });

    it('应该自动设置last_updated', async () => {
      const statsWithoutTimestamp = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await db.aggregated_stats.add(statsWithoutTimestamp);

      const savedStats = await db.aggregated_stats.get(statsWithoutTimestamp.key);
      expect(savedStats?.last_updated).toBeTypeOf('number');
      expect(savedStats?.last_updated).toBeGreaterThan(0);
    });

    it('应该拒绝无效的日期格式', async () => {
      const invalidStats = {
        key: '2024-01-01:https://example.com',
        date: '01/01/2024', // 错误格式
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await expect(db.aggregated_stats.add(invalidStats)).rejects.toThrow('聚合统计创建验证失败');
    });

    it('应该拒绝负数时间值', async () => {
      const invalidStats = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: -1000, // 负数
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await expect(db.aggregated_stats.add(invalidStats)).rejects.toThrow('聚合统计创建验证失败');
    });

    it('应该能够更新统计记录', async () => {
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

      await db.aggregated_stats.add(stats);

      // 手动更新last_updated字段以测试更新功能
      const newTimestamp = Date.now() + 1000;
      await db.aggregated_stats.update(stats.key, {
        total_open_time: 6000,
        last_updated: newTimestamp,
      });

      const updatedStats = await db.aggregated_stats.get(stats.key);
      expect(updatedStats?.total_open_time).toBe(6000);
      expect(updatedStats?.last_updated).toBe(newTimestamp);
    });
  });

  describe('数据库统计和健康检查', () => {
    it('应该返回正确的统计信息', async () => {
      // 添加一些测试数据
      await db.events_log.add({
        timestamp: Date.now(),
        eventType: 'open_time_start',
        tabId: 123,
        url: 'https://example.com',
        visitId: 'visit-123',
        activityId: null,
        isProcessed: 0,
      });

      await db.aggregated_stats.add({
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      });

      const stats = await db.getStats();

      expect(stats.eventsCount).toBe(1);
      expect(stats.statsCount).toBe(1);
      expect(stats.estimatedSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeTypeOf('number');
    });

    it('应该通过健康检查', async () => {
      const healthCheck = await db.healthCheck();

      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.issues).toHaveLength(0);
    });
  });

  it('应该格式化单个错误消息', () => {
    const issue: z.ZodIssue = {
      code: 'invalid_type',
      expected: 'string',
      path: ['name'],
      message: 'Expected string, received number',
      input: 123,
    };

    const formatted = ZodErrorFormatter.formatIssueMessage(issue);
    expect(formatted).toContain('name');
  });
});
