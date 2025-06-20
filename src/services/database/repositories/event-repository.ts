/**
 * 事件存储Repository
 * 负责events_log表的CRUD操作、批量处理和查询功能
 *
 * 功能特性：
 * - 完整的CRUD操作支持
 * - 高性能批量插入和更新
 * - 灵活的查询和过滤接口
 * - 事务支持和错误处理
 * - 性能监控和优化
 */

import type { WebTimeDatabase } from '../schemas';
import type {
  EventsLogSchema,
  EventQueryFilter,
  QueryOptions,
  BatchOperationResult,
  DatabaseError,
} from '../../../models/schemas/database-schema';

/**
 * 事件Repository类
 * 提供events_log表的所有数据操作功能
 */
export class EventRepository {
  private db: WebTimeDatabase;

  constructor(db: WebTimeDatabase) {
    this.db = db;
  }

  /**
   * 创建单个事件记录
   */
  async create(event: Omit<EventsLogSchema, 'id'>): Promise<number> {
    try {
      const id = await this.db.events_log.add(event);
      return id;
    } catch (error) {
      throw this.createRepositoryError('Failed to create event', error);
    }
  }

  /**
   * 批量创建事件记录
   */
  async createBatch(events: Array<Omit<EventsLogSchema, 'id'>>): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      // 使用事务确保数据一致性
      await this.db.transaction('rw', this.db.events_log, async () => {
        for (let i = 0; i < events.length; i++) {
          try {
            await this.db.events_log.add(events[i]);
            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: events[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to create events batch', error);
    }
  }

  /**
   * 根据ID获取事件记录
   */
  async getById(id: number): Promise<EventsLogSchema | undefined> {
    try {
      return await this.db.events_log.get(id);
    } catch (error) {
      throw this.createRepositoryError('Failed to get event by ID', error);
    }
  }

  /**
   * 根据条件查询事件记录
   */
  async query(filter?: EventQueryFilter, options?: QueryOptions): Promise<EventsLogSchema[]> {
    try {
      let collection = this.db.events_log.orderBy('timestamp');

      // 应用过滤条件
      if (filter) {
        collection = this.applyFilters(collection, filter);
      }

      // 应用排序
      if (options?.orderBy && options.orderBy !== 'timestamp') {
        collection = this.db.events_log.orderBy(options.orderBy);
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
      throw this.createRepositoryError('Failed to query events', error);
    }
  }

  /**
   * 统计符合条件的事件数量
   */
  async count(filter?: EventQueryFilter): Promise<number> {
    try {
      let collection = this.db.events_log.toCollection();

      if (filter) {
        collection = this.applyFilters(collection, filter);
      }

      return await collection.count();
    } catch (error) {
      throw this.createRepositoryError('Failed to count events', error);
    }
  }

  /**
   * 更新事件记录
   */
  async update(id: number, updates: Partial<Omit<EventsLogSchema, 'id'>>): Promise<boolean> {
    try {
      const updateCount = await this.db.events_log.update(id, updates);
      return updateCount > 0;
    } catch (error) {
      throw this.createRepositoryError('Failed to update event', error);
    }
  }

  /**
   * 批量更新事件记录
   */
  async updateBatch(
    updates: Array<{ id: number; updates: Partial<Omit<EventsLogSchema, 'id'>> }>
  ): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      await this.db.transaction('rw', this.db.events_log, async () => {
        for (let i = 0; i < updates.length; i++) {
          try {
            const updateCount = await this.db.events_log.update(updates[i].id, updates[i].updates);
            if (updateCount > 0) {
              result.successCount++;
            } else {
              result.failureCount++;
              result.failures.push({
                index: i,
                error: 'Record not found',
                data: updates[i],
              });
            }
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: updates[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to update events batch', error);
    }
  }

  /**
   * 删除事件记录
   */
  async delete(id: number): Promise<boolean> {
    try {
      // 先检查记录是否存在
      const existing = await this.db.events_log.get(id);
      if (!existing) {
        return false; // 记录不存在，返回false
      }

      await this.db.events_log.delete(id);
      return true; // 删除成功，返回true
    } catch (error) {
      throw this.createRepositoryError('Failed to delete event', error);
    }
  }

  /**
   * 批量删除事件记录
   */
  async deleteBatch(ids: number[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      failures: [],
    };

    try {
      await this.db.transaction('rw', this.db.events_log, async () => {
        for (let i = 0; i < ids.length; i++) {
          try {
            await this.db.events_log.delete(ids[i]);
            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.failures.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: ids[i],
            });
          }
        }
      });

      return result;
    } catch (error) {
      throw this.createRepositoryError('Failed to delete events batch', error);
    }
  }

  /**
   * 根据条件删除事件记录
   */
  async deleteByFilter(filter: EventQueryFilter): Promise<number> {
    try {
      let collection = this.db.events_log.toCollection();
      collection = this.applyFilters(collection, filter);
      return await collection.delete();
    } catch (error) {
      throw this.createRepositoryError('Failed to delete events by filter', error);
    }
  }

  /**
   * 标记事件为已处理
   */
  async markAsProcessed(ids: number[]): Promise<BatchOperationResult> {
    return this.updateBatch(
      ids.map(id => ({
        id,
        updates: { isProcessed: 1 as const },
      }))
    );
  }

  /**
   * 获取未处理的事件
   */
  async getUnprocessed(limit?: number): Promise<EventsLogSchema[]> {
    return this.query({ isProcessed: 0 }, { limit, orderBy: 'timestamp', direction: 'asc' });
  }

  /**
   * 根据访问ID获取事件
   */
  async getByVisitId(visitId: string): Promise<EventsLogSchema[]> {
    return this.query({ visitIds: [visitId] });
  }

  /**
   * 根据活动ID获取事件
   */
  async getByActivityId(activityId: string): Promise<EventsLogSchema[]> {
    return this.query({ activityIds: [activityId] });
  }

  /**
   * 应用过滤条件到集合
   */
  private applyFilters(collection: any, filter: EventQueryFilter): any {
    // 时间范围过滤
    if (filter.startTime !== undefined && filter.endTime !== undefined) {
      collection = collection.filter(
        (event: EventsLogSchema) =>
          event.timestamp >= filter.startTime! && event.timestamp <= filter.endTime!
      );
    } else if (filter.startTime !== undefined) {
      collection = collection.filter(
        (event: EventsLogSchema) => event.timestamp >= filter.startTime!
      );
    } else if (filter.endTime !== undefined) {
      collection = collection.filter(
        (event: EventsLogSchema) => event.timestamp <= filter.endTime!
      );
    }

    // 其他过滤条件使用filter方法，避免多个where冲突
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      collection = collection.filter((event: EventsLogSchema) =>
        filter.eventTypes!.includes(event.eventType)
      );
    }

    if (filter.visitIds && filter.visitIds.length > 0) {
      collection = collection.filter((event: EventsLogSchema) =>
        filter.visitIds!.includes(event.visitId)
      );
    }

    if (filter.activityIds && filter.activityIds.length > 0) {
      collection = collection.filter(
        (event: EventsLogSchema) =>
          event.activityId && filter.activityIds!.includes(event.activityId)
      );
    }

    if (filter.isProcessed !== undefined) {
      collection = collection.filter(
        (event: EventsLogSchema) => event.isProcessed === filter.isProcessed
      );
    }

    if (filter.tabIds && filter.tabIds.length > 0) {
      collection = collection.filter((event: EventsLogSchema) =>
        filter.tabIds!.includes(event.tabId)
      );
    }

    if (filter.urlPattern) {
      collection = collection.filter((event: EventsLogSchema) =>
        event.url.includes(filter.urlPattern!)
      );
    }

    return collection;
  }

  /**
   * 创建Repository错误
   */
  private createRepositoryError(message: string, originalError: unknown): DatabaseError {
    const error = new Error(`EventRepository: ${message}`) as DatabaseError;
    error.code = 'OPERATION_FAILED';
    error.originalError =
      originalError instanceof Error ? originalError : new Error(String(originalError));
    error.context = {
      repository: 'EventRepository',
      timestamp: Date.now(),
    };
    return error;
  }
}
