/**
 * 聚合数据Repository测试
 * 测试aggregated_stats表的CRUD操作、upsert功能和数据聚合
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { WebTimeDatabase } from '../../../src/services/database/schemas';
import { StatsRepository } from '../../../src/services/database/repositories/stats-repository';
import type { AggregatedStatsSchema } from '../../../src/models/schemas/database-schema';

describe('StatsRepository', () => {
  let db: WebTimeDatabase;
  let statsRepo: StatsRepository;

  beforeEach(async () => {
    db = new WebTimeDatabase();
    await db.open();
    statsRepo = new StatsRepository(db);
  });

  afterEach(async () => {
    await db.delete();
    await db.close();
  });

  describe('基本CRUD操作', () => {
    it('应该能够创建统计记录', async () => {
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

      const key = await statsRepo.create(stats);

      expect(key).toBe('2024-01-01:https://example.com');
    });

    it('应该能够根据key获取统计记录', async () => {
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

      await statsRepo.create(stats);
      const savedStats = await statsRepo.getByKey(stats.key);

      expect(savedStats).toBeDefined();
      expect(savedStats?.hostname).toBe('example.com');
      expect(savedStats?.total_open_time).toBe(5000);
      expect(savedStats?.total_active_time).toBe(3000);
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

      await statsRepo.create(stats);
      const updated = await statsRepo.update(stats.key, {
        total_open_time: 6000,
        total_active_time: 4000,
      });

      expect(updated).toBe(true);

      const savedStats = await statsRepo.getByKey(stats.key);
      expect(savedStats?.total_open_time).toBe(6000);
      expect(savedStats?.total_active_time).toBe(4000);
    });

    it('应该能够删除统计记录', async () => {
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

      await statsRepo.create(stats);
      const deleted = await statsRepo.delete(stats.key);

      expect(deleted).toBe(true);

      const savedStats = await statsRepo.getByKey(stats.key);
      expect(savedStats).toBeUndefined();
    });
  });

  describe('Upsert操作', () => {
    it('应该能够插入新的统计记录', async () => {
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

      const key = await statsRepo.upsert(stats);

      expect(key).toBe(stats.key);

      const savedStats = await statsRepo.getByKey(stats.key);
      expect(savedStats?.total_open_time).toBe(5000);
      expect(savedStats?.total_active_time).toBe(3000);
    });

    it('应该能够更新现有的统计记录（累加时间）', async () => {
      const initialStats: AggregatedStatsSchema = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 5000,
        total_active_time: 3000,
        last_updated: Date.now(),
      };

      await statsRepo.create(initialStats);

      const additionalStats: AggregatedStatsSchema = {
        key: '2024-01-01:https://example.com',
        date: '2024-01-01',
        url: 'https://example.com',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 2000,
        total_active_time: 1500,
        last_updated: Date.now(),
      };

      await statsRepo.upsert(additionalStats);

      const savedStats = await statsRepo.getByKey(initialStats.key);
      expect(savedStats?.total_open_time).toBe(7000); // 5000 + 2000
      expect(savedStats?.total_active_time).toBe(4500); // 3000 + 1500
    });

    it('应该能够批量upsert统计记录', async () => {
      const statsArray: AggregatedStatsSchema[] = [
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 5000,
          total_active_time: 3000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-01:https://test.com',
          date: '2024-01-01',
          url: 'https://test.com',
          hostname: 'test.com',
          parentDomain: 'test.com',
          total_open_time: 3000,
          total_active_time: 2000,
          last_updated: Date.now(),
        },
      ];

      const result = await statsRepo.upsertBatch(statsArray);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe('批量操作', () => {
    it('应该能够批量创建统计记录', async () => {
      const statsArray: AggregatedStatsSchema[] = [
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 5000,
          total_active_time: 3000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-01:https://test.com',
          date: '2024-01-01',
          url: 'https://test.com',
          hostname: 'test.com',
          parentDomain: 'test.com',
          total_open_time: 3000,
          total_active_time: 2000,
          last_updated: Date.now(),
        },
      ];

      const result = await statsRepo.createBatch(statsArray);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it('应该能够批量删除统计记录', async () => {
      const statsArray: AggregatedStatsSchema[] = [
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 5000,
          total_active_time: 3000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-01:https://test.com',
          date: '2024-01-01',
          url: 'https://test.com',
          hostname: 'test.com',
          parentDomain: 'test.com',
          total_open_time: 3000,
          total_active_time: 2000,
          last_updated: Date.now(),
        },
      ];

      await statsRepo.createBatch(statsArray);

      const keys = statsArray.map(s => s.key);
      const deleteResult = await statsRepo.deleteBatch(keys);

      expect(deleteResult.successCount).toBe(2);
      expect(deleteResult.failureCount).toBe(0);

      // 验证删除成功
      const remainingStats = await statsRepo.query();
      expect(remainingStats).toHaveLength(0);
    });
  });

  describe('查询和过滤', () => {
    beforeEach(async () => {
      // 创建测试数据
      const statsArray: AggregatedStatsSchema[] = [
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 5000,
          total_active_time: 3000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-02:https://example.com',
          date: '2024-01-02',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 3000,
          total_active_time: 2000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-01:https://test.com',
          date: '2024-01-01',
          url: 'https://test.com',
          hostname: 'test.com',
          parentDomain: 'test.com',
          total_open_time: 4000,
          total_active_time: 2500,
          last_updated: Date.now(),
        },
      ];

      await statsRepo.createBatch(statsArray);
    });

    it('应该能够查询所有统计记录', async () => {
      const stats = await statsRepo.query();
      expect(stats).toHaveLength(3);
    });

    it('应该能够按日期范围过滤', async () => {
      const stats = await statsRepo.query({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
      });

      expect(stats).toHaveLength(2);
      expect(stats.every(s => s.date === '2024-01-01')).toBe(true);
    });

    it('应该能够按主机名过滤', async () => {
      const stats = await statsRepo.query({
        hostnames: ['example.com'],
      });

      expect(stats).toHaveLength(2);
      expect(stats.every(s => s.hostname === 'example.com')).toBe(true);
    });

    it('应该能够按最小时间过滤', async () => {
      const stats = await statsRepo.query({
        minOpenTime: 4000,
      });

      expect(stats).toHaveLength(2);
      expect(stats.every(s => s.total_open_time >= 4000)).toBe(true);
    });

    it('应该能够分页查询', async () => {
      const firstPage = await statsRepo.query(
        {},
        {
          limit: 2,
          offset: 0,
        }
      );

      expect(firstPage).toHaveLength(2);

      const secondPage = await statsRepo.query(
        {},
        {
          limit: 2,
          offset: 2,
        }
      );

      expect(secondPage).toHaveLength(1);
    });

    it('应该能够统计记录数量', async () => {
      const totalCount = await statsRepo.count();
      expect(totalCount).toBe(3);

      const exampleCount = await statsRepo.count({
        hostnames: ['example.com'],
      });
      expect(exampleCount).toBe(2);
    });
  });

  describe('数据聚合', () => {
    beforeEach(async () => {
      const statsArray: AggregatedStatsSchema[] = [
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 5000,
          total_active_time: 3000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-02:https://example.com',
          date: '2024-01-02',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 3000,
          total_active_time: 2000,
          last_updated: Date.now(),
        },
        {
          key: '2024-01-01:https://test.com',
          date: '2024-01-01',
          url: 'https://test.com',
          hostname: 'test.com',
          parentDomain: 'test.com',
          total_open_time: 4000,
          total_active_time: 2500,
          last_updated: Date.now(),
        },
      ];

      await statsRepo.createBatch(statsArray);
    });

    it('应该能够按日期聚合', async () => {
      const aggregated = await statsRepo.aggregate(
        {},
        {
          groupBy: ['date'],
          metrics: ['total_open_time', 'total_active_time', 'count'],
        }
      );

      expect(aggregated).toHaveLength(2);

      const jan01 = aggregated.find(a => a.group.date === '2024-01-01');
      expect(jan01?.metrics.total_open_time).toBe(9000); // 5000 + 4000
      expect(jan01?.metrics.total_active_time).toBe(5500); // 3000 + 2500
      expect(jan01?.metrics.count).toBe(2);

      const jan02 = aggregated.find(a => a.group.date === '2024-01-02');
      expect(jan02?.metrics.total_open_time).toBe(3000);
      expect(jan02?.metrics.total_active_time).toBe(2000);
      expect(jan02?.metrics.count).toBe(1);
    });

    it('应该能够按主机名聚合', async () => {
      const aggregated = await statsRepo.aggregate(
        {},
        {
          groupBy: ['hostname'],
          metrics: ['total_open_time', 'total_active_time', 'count'],
        }
      );

      expect(aggregated).toHaveLength(2);

      const exampleCom = aggregated.find(a => a.group.hostname === 'example.com');
      expect(exampleCom?.metrics.total_open_time).toBe(8000); // 5000 + 3000
      expect(exampleCom?.metrics.total_active_time).toBe(5000); // 3000 + 2000
      expect(exampleCom?.metrics.count).toBe(2);

      const testCom = aggregated.find(a => a.group.hostname === 'test.com');
      expect(testCom?.metrics.total_open_time).toBe(4000);
      expect(testCom?.metrics.total_active_time).toBe(2500);
      expect(testCom?.metrics.count).toBe(1);
    });

    it('应该能够总计聚合（无分组）', async () => {
      const aggregated = await statsRepo.aggregate(
        {},
        {
          groupBy: [],
          metrics: ['total_open_time', 'total_active_time', 'count'],
        }
      );

      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].group).toEqual({});
      expect(aggregated[0].metrics.total_open_time).toBe(12000); // 5000 + 3000 + 4000
      expect(aggregated[0].metrics.total_active_time).toBe(7500); // 3000 + 2000 + 2500
      expect(aggregated[0].metrics.count).toBe(3);
    });

    it('应该能够多维度聚合', async () => {
      const aggregated = await statsRepo.aggregate(
        {},
        {
          groupBy: ['date', 'hostname'],
          metrics: ['total_open_time', 'count'],
        }
      );

      expect(aggregated).toHaveLength(3);

      const jan01Example = aggregated.find(
        a => a.group.date === '2024-01-01' && a.group.hostname === 'example.com'
      );
      expect(jan01Example?.metrics.total_open_time).toBe(5000);
      expect(jan01Example?.metrics.count).toBe(1);
    });
  });
});
