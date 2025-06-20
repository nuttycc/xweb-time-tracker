/**
 * 聚合数据Repository
 * 负责aggregated_stats表的CRUD操作、upsert功能和数据聚合
 *
 * 功能特性：
 * - 完整的CRUD操作支持
 * - 高效的upsert操作（插入或更新）
 * - 复杂的查询和聚合接口
 * - 数据统计和分析功能
 * - 性能优化和缓存支持
 */

import type { WebTimeDatabase } from '../schemas';
import type {
  AggregatedStatsSchema,
  StatsQueryFilter,
  QueryOptions,
  BatchOperationResult,
  DatabaseError,
} from '../../../models/schemas/database-schema';

/**
 * 聚合统计数据接口
 */
export interface AggregatedData {
  group: Record<string, string>;
  metrics: {
    total_open_time: number;
    total_active_time: number;
    count: number;
  };
}

/**
 * 聚合查询选项
 */
export interface AggregateOptions {
  groupBy: Array<'date' | 'hostname' | 'parentDomain'>;
  metrics: Array<'total_open_time' | 'total_active_time' | 'count'>;
}

/**
 * 聚合数据Repository类
 * 提供aggregated_stats表的所有数据操作功能
 */
export class StatsRepository {
  private db: WebTimeDatabase;

  constructor(db: WebTimeDatabase) {
    this.db = db;
  }

  /**
   * 创建单个统计记录
   */
  async create(stats: AggregatedStatsSchema): Promise<string> {
    try {
      await this.db.aggregated_stats.add(stats);
      return stats.key;
    } catch (error) {
      throw this.createRepositoryError('Failed to create stats', error);
    }
  }

  /**
   * 批量创建统计记录
   */
  async createBatch(statsArray: AggregatedStatsSchema[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      await this.db.transaction('rw', this.db.aggregated_stats, async () => {
        for (let i = 0; i < statsArray.length; i++) {
          try {
            await this.db.aggregated_stats.add(statsArray[i]);
            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: statsArray[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to create stats batch', error);
    }
  }

  /**
   * 根据key获取统计记录
   */
  async getByKey(key: string): Promise<AggregatedStatsSchema | undefined> {
    try {
      return await this.db.aggregated_stats.get(key);
    } catch (error) {
      throw this.createRepositoryError('Failed to get stats by key', error);
    }
  }

  /**
   * 根据条件查询统计记录
   */
  async query(filter?: StatsQueryFilter, options?: QueryOptions): Promise<AggregatedStatsSchema[]> {
    try {
      let collection = this.db.aggregated_stats.orderBy('date');

      // 应用过滤条件
      if (filter) {
        collection = this.applyFilters(collection, filter);
      }

      // 应用排序
      if (options?.orderBy && options.orderBy !== 'date') {
        collection = this.db.aggregated_stats.orderBy(options.orderBy);
        if (options.direction === 'desc') {
          collection = collection.reverse();
        }
      } else if (options?.direction === 'desc') {
        collection = collection.reverse();
      }

      // 应用分页
      if (options?.offset) {
        collection = collection.offset(options.offset);
      }
      if (options?.limit) {
        collection = collection.limit(options.limit);
      }

      return await collection.toArray();
    } catch (error) {
      throw this.createRepositoryError('Failed to query stats', error);
    }
  }

  /**
   * 统计符合条件的记录数量
   */
  async count(filter?: StatsQueryFilter): Promise<number> {
    try {
      let collection = this.db.aggregated_stats.toCollection();

      if (filter) {
        collection = this.applyFilters(collection, filter);
      }

      return await collection.count();
    } catch (error) {
      throw this.createRepositoryError('Failed to count stats', error);
    }
  }

  /**
   * 更新统计记录
   */
  async update(
    key: string,
    updates: Partial<Omit<AggregatedStatsSchema, 'key'>>
  ): Promise<boolean> {
    try {
      const updateCount = await this.db.aggregated_stats.update(key, updates);
      return updateCount > 0;
    } catch (error) {
      throw this.createRepositoryError('Failed to update stats', error);
    }
  }

  /**
   * Upsert操作：插入或更新统计记录
   */
  async upsert(stats: AggregatedStatsSchema): Promise<string> {
    try {
      const existing = await this.db.aggregated_stats.get(stats.key);

      if (existing) {
        // 更新现有记录，累加时间数据
        const updatedStats: AggregatedStatsSchema = {
          ...existing,
          total_open_time: existing.total_open_time + stats.total_open_time,
          total_active_time: existing.total_active_time + stats.total_active_time,
          last_updated: Date.now(),
        };

        await this.db.aggregated_stats.put(updatedStats);
      } else {
        // 插入新记录
        await this.db.aggregated_stats.add(stats);
      }

      return stats.key;
    } catch (error) {
      throw this.createRepositoryError('Failed to upsert stats', error);
    }
  }

  /**
   * 批量upsert操作
   */
  async upsertBatch(statsArray: AggregatedStatsSchema[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      await this.db.transaction('rw', this.db.aggregated_stats, async () => {
        for (let i = 0; i < statsArray.length; i++) {
          try {
            await this.upsert(statsArray[i]);
            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: statsArray[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to upsert stats batch', error);
    }
  }

  /**
   * 删除统计记录
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.db.aggregated_stats.delete(key);
      return true;
    } catch (error) {
      throw this.createRepositoryError('Failed to delete stats', error);
    }
  }

  /**
   * 批量删除统计记录
   */
  async deleteBatch(keys: string[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      await this.db.transaction('rw', this.db.aggregated_stats, async () => {
        for (let i = 0; i < keys.length; i++) {
          try {
            await this.db.aggregated_stats.delete(keys[i]);
            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: keys[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to delete stats batch', error);
    }
  }

  /**
   * 根据条件删除统计记录
   */
  async deleteByFilter(filter: StatsQueryFilter): Promise<number> {
    try {
      let collection = this.db.aggregated_stats.toCollection();
      collection = this.applyFilters(collection, filter);
      return await collection.delete();
    } catch (error) {
      throw this.createRepositoryError('Failed to delete stats by filter', error);
    }
  }

  /**
   * 聚合查询
   */
  async aggregate(
    filter?: StatsQueryFilter,
    options?: AggregateOptions
  ): Promise<AggregatedData[]> {
    try {
      const stats = await this.query(filter);

      if (!options || !options.groupBy.length) {
        // 如果没有分组，返回总计
        const totalMetrics = this.calculateMetrics(stats, options?.metrics);
        return [
          {
            group: {},
            metrics: totalMetrics,
          },
        ];
      }

      // 按指定字段分组
      const groups = new Map<string, AggregatedStatsSchema[]>();

      for (const stat of stats) {
        const groupKey = options.groupBy.map(field => `${field}:${stat[field]}`).join('|');

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(stat);
      }

      // 计算每组的聚合数据
      const result: AggregatedData[] = [];

      for (const [groupKey, groupStats] of groups) {
        const groupInfo: Record<string, string> = {};
        const keyParts = groupKey.split('|');

        for (let i = 0; i < options.groupBy.length; i++) {
          const [field, value] = keyParts[i].split(':');
          groupInfo[field] = value;
        }

        const metrics = this.calculateMetrics(groupStats, options.metrics);

        result.push({
          group: groupInfo,
          metrics,
        });
      }

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to aggregate stats', error);
    }
  }

  /**
   * 应用过滤条件到集合
   */
  private applyFilters(collection: any, filter: StatsQueryFilter): any {
    // 日期范围过滤
    if (filter.startDate && filter.endDate) {
      collection = collection.filter(
        (stats: AggregatedStatsSchema) =>
          stats.date >= filter.startDate! && stats.date <= filter.endDate!
      );
    } else if (filter.startDate) {
      collection = collection.filter(
        (stats: AggregatedStatsSchema) => stats.date >= filter.startDate!
      );
    } else if (filter.endDate) {
      collection = collection.filter(
        (stats: AggregatedStatsSchema) => stats.date <= filter.endDate!
      );
    }

    // 其他过滤条件
    if (filter.hostnames && filter.hostnames.length > 0) {
      collection = collection.filter((stats: AggregatedStatsSchema) =>
        filter.hostnames!.includes(stats.hostname)
      );
    }

    if (filter.parentDomains && filter.parentDomains.length > 0) {
      collection = collection.filter((stats: AggregatedStatsSchema) =>
        filter.parentDomains!.includes(stats.parentDomain)
      );
    }

    if (filter.urlPattern) {
      collection = collection.filter((stats: AggregatedStatsSchema) =>
        stats.url.includes(filter.urlPattern!)
      );
    }

    if (filter.minOpenTime !== undefined) {
      collection = collection.filter(
        (stats: AggregatedStatsSchema) => stats.total_open_time >= filter.minOpenTime!
      );
    }

    if (filter.minActiveTime !== undefined) {
      collection = collection.filter(
        (stats: AggregatedStatsSchema) => stats.total_active_time >= filter.minActiveTime!
      );
    }

    return collection;
  }

  /**
   * 计算聚合指标
   */
  private calculateMetrics(stats: AggregatedStatsSchema[], requestedMetrics?: string[]) {
    const metrics = {
      total_open_time: 0,
      total_active_time: 0,
      count: stats.length,
    };

    for (const stat of stats) {
      metrics.total_open_time += stat.total_open_time;
      metrics.total_active_time += stat.total_active_time;
    }

    // 如果指定了特定指标，只返回请求的指标
    if (requestedMetrics && requestedMetrics.length > 0) {
      const filteredMetrics: any = {};
      for (const metric of requestedMetrics) {
        if (metric in metrics) {
          filteredMetrics[metric] = metrics[metric as keyof typeof metrics];
        }
      }
      return filteredMetrics;
    }

    return metrics;
  }

  /**
   * 创建Repository错误
   */
  private createRepositoryError(message: string, originalError: unknown): DatabaseError {
    const error = new Error(`StatsRepository: ${message}`) as DatabaseError;
    error.code = 'OPERATION_FAILED';
    error.originalError =
      originalError instanceof Error ? originalError : new Error(String(originalError));
    error.context = {
      repository: 'StatsRepository',
      timestamp: Date.now(),
    };
    return error;
  }
}
