/**
 * 数据库Schema实现
 * 使用Dexie实现IndexedDB数据库操作
 *
 * 基于models/schemas/database-schema.ts的定义
 * 提供类型安全的数据库操作接口
 */

import Dexie, { type Table } from 'dexie';
import type {
  EventsLogSchema,
  AggregatedStatsSchema,
  WEBTIME_DB_CONFIG,
} from '../../models/schemas/database-schema';
import {
  EventsLogSchema as EventsLogZodSchema,
  AggregatedStatsSchema as AggregatedStatsZodSchema,
  CreateEventsLogSchema,
  UpdateEventsLogSchema,
} from '../validators/database-schemas';
import { ZodValidator } from '../validators/zod-validator';

/**
 * WebTime Tracker数据库类
 * 继承Dexie，提供类型安全的数据库操作
 */
export class WebTimeDatabase extends Dexie {
  /** 事件日志表 */
  events_log!: Table<EventsLogSchema, number>;

  /** 聚合统计表 */
  aggregated_stats!: Table<AggregatedStatsSchema, string>;

  /** 事件日志验证器 */
  private eventsLogValidator: ZodValidator;

  /** 聚合统计验证器 */
  private aggregatedStatsValidator: ZodValidator;

  constructor() {
    super('webtime_tracker');

    // 初始化验证器
    this.eventsLogValidator = new ZodValidator(EventsLogZodSchema, 'EventsLogValidator');
    this.aggregatedStatsValidator = new ZodValidator(
      AggregatedStatsZodSchema,
      'AggregatedStatsValidator'
    );

    // 定义数据库版本1的Schema
    this.version(1).stores({
      // events_log表：主键为自增id，建立多个索引
      events_log: `
        ++id,
        isProcessed,
        visitId,
        activityId,
        timestamp,
        eventType,
        tabId,
        url
      `,

      // aggregated_stats表：主键为key，建立多个索引
      aggregated_stats: `
        key,
        date,
        hostname,
        parentDomain,
        last_updated,
        url
      `,
    });

    // 设置表的钩子和验证
    this.setupHooks();
  }

  /**
   * 设置数据库钩子
   * 用于数据验证、自动字段填充等
   * 使用Zod验证器提供类型安全的数据验证
   */
  private setupHooks(): void {
    // events_log表钩子
    this.events_log.hook('creating', (primKey, obj, trans) => {
      try {
        // 确保timestamp存在
        if (!obj.timestamp) {
          obj.timestamp = Date.now();
        }

        // 确保isProcessed有默认值
        if (obj.isProcessed === undefined) {
          obj.isProcessed = 0;
        }

        // 使用Zod验证器验证数据
        this.validateEventLog(obj);
      } catch (error) {
        // 增强错误信息，包含上下文
        const enhancedError = new Error(
          `事件日志创建验证失败: ${error instanceof Error ? error.message : '未知错误'}`
        );
        (enhancedError as any).originalError = error;
        (enhancedError as any).context = { operation: 'creating', table: 'events_log', data: obj };
        throw enhancedError;
      }
    });

    this.events_log.hook(
      'updating',
      (modifications: Partial<EventsLogSchema>, primKey, obj: EventsLogSchema, trans) => {
        try {
          // 验证更新的数据
          if (
            modifications.timestamp !== undefined ||
            modifications.eventType !== undefined ||
            modifications.tabId !== undefined ||
            modifications.url !== undefined ||
            modifications.visitId !== undefined
          ) {
            // 如果更新关键字段，需要重新验证
            const updatedObj = { ...obj, ...modifications };
            this.validateEventLog(updatedObj);
          }
        } catch (error) {
          // 增强错误信息，包含上下文
          const enhancedError = new Error(
            `事件日志更新验证失败: ${error instanceof Error ? error.message : '未知错误'}`
          );
          (enhancedError as any).originalError = error;
          (enhancedError as any).context = {
            operation: 'updating',
            table: 'events_log',
            primKey,
            modifications,
          };
          throw enhancedError;
        }
      }
    );

    // aggregated_stats表钩子
    this.aggregated_stats.hook('creating', (primKey, obj, trans) => {
      try {
        // 确保last_updated存在
        if (!obj.last_updated) {
          obj.last_updated = Date.now();
        }

        // 使用Zod验证器验证数据
        this.validateAggregatedStats(obj);
      } catch (error) {
        // 增强错误信息，包含上下文
        const enhancedError = new Error(
          `聚合统计创建验证失败: ${error instanceof Error ? error.message : '未知错误'}`
        );
        (enhancedError as any).originalError = error;
        (enhancedError as any).context = {
          operation: 'creating',
          table: 'aggregated_stats',
          data: obj,
        };
        throw enhancedError;
      }
    });

    this.aggregated_stats.hook(
      'updating',
      (
        modifications: Partial<AggregatedStatsSchema>,
        primKey,
        obj: AggregatedStatsSchema,
        trans
      ) => {
        try {
          // 自动更新last_updated字段
          modifications.last_updated = Date.now();

          // 验证更新的数据
          const updatedObj = { ...obj, ...modifications };
          this.validateAggregatedStats(updatedObj);
        } catch (error) {
          // 增强错误信息，包含上下文
          const enhancedError = new Error(
            `聚合统计更新验证失败: ${error instanceof Error ? error.message : '未知错误'}`
          );
          (enhancedError as any).originalError = error;
          (enhancedError as any).context = {
            operation: 'updating',
            table: 'aggregated_stats',
            primKey,
            modifications,
          };
          throw enhancedError;
        }
      }
    );
  }

  /**
   * 验证事件日志数据
   * 使用Zod Schema验证器进行类型安全的数据验证
   */
  private validateEventLog(obj: EventsLogSchema): void {
    const result = this.eventsLogValidator.validate(obj);

    if (!result.success) {
      // 提取第一个错误信息，保持与原有错误格式的兼容性
      const errorMessage = result.error?.message || '事件日志数据验证失败';
      throw new Error(errorMessage);
    }
  }

  /**
   * 验证聚合统计数据
   * 使用Zod Schema验证器进行类型安全的数据验证
   */
  private validateAggregatedStats(obj: AggregatedStatsSchema): void {
    const result = this.aggregatedStatsValidator.validate(obj);

    if (!result.success) {
      // 提取第一个错误信息，保持与原有错误格式的兼容性
      const errorMessage = result.error?.message || '聚合统计数据验证失败';
      throw new Error(errorMessage);
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats() {
    const [eventsCount, statsCount] = await Promise.all([
      this.events_log.count(),
      this.aggregated_stats.count(),
    ]);

    return {
      eventsCount,
      statsCount,
      estimatedSize: await this.getEstimatedSize(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * 估算数据库大小
   */
  private async getEstimatedSize(): Promise<number> {
    try {
      // 使用navigator.storage.estimate()获取存储使用情况
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return estimate.usage || 0;
      }

      // 降级方案：基于记录数估算
      const [eventsCount, statsCount] = await Promise.all([
        this.events_log.count(),
        this.aggregated_stats.count(),
      ]);

      // 粗略估算：每个事件记录约200字节，每个统计记录约150字节
      return eventsCount * 200 + statsCount * 150;
    } catch (error) {
      console.warn('Failed to estimate database size:', error);
      return 0;
    }
  }

  /**
   * 清理过期数据
   */
  async cleanup(retentionDays: number): Promise<{ deletedEvents: number; deletedStats: number }> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];

    const deletedEvents = await this.events_log.where('timestamp').below(cutoffTime).delete();

    const deletedStats = await this.aggregated_stats.where('date').below(cutoffDate).delete();

    return { deletedEvents, deletedStats };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // 检查数据库连接
      await this.open();

      // 检查表是否存在
      const tables = this.tables;
      if (!tables.find(t => t.name === 'events_log')) {
        issues.push('events_log table not found');
      }
      if (!tables.find(t => t.name === 'aggregated_stats')) {
        issues.push('aggregated_stats table not found');
      }

      // 检查数据量
      const stats = await this.getStats();
      if (stats.eventsCount > 100000) {
        issues.push('Large number of events may impact performance');
        recommendations.push('Consider cleaning up old events');
      }

      // 检查存储配额
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.usage) {
          const usagePercentage = (estimate.usage / estimate.quota) * 100;
          if (usagePercentage > 80) {
            issues.push('Storage quota usage is high');
            recommendations.push('Clean up old data or increase storage quota');
          }
        }
      }

      const status = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'error';

      return { status, issues, recommendations };
    } catch (error) {
      return {
        status: 'error',
        issues: [`Database connection failed: ${error}`],
        recommendations: ['Check browser storage permissions', 'Try refreshing the page'],
      };
    }
  }
}

/**
 * 数据库实例
 * 全局单例，确保整个应用使用同一个数据库连接
 */
export const db = new WebTimeDatabase();
