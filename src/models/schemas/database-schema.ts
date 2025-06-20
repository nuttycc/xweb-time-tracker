/**
 * 数据库Schema定义
 * 定义IndexedDB数据库结构、表结构和索引策略
 *
 * 基于LLD文档设计，支持：
 * - events_log表：原始事件日志存储
 * - aggregated_stats表：聚合统计数据存储
 * - 完整的索引策略优化查询性能
 */

/**
 * 事件类型枚举
 * 定义所有可能的事件类型
 */
export type EventType =
  | 'open_time_start' // 页面打开开始
  | 'open_time_end' // 页面打开结束
  | 'active_time_start' // 活跃时间开始
  | 'active_time_end' // 活跃时间结束
  | 'checkpoint'; // 检查点事件

/**
 * 事件日志表Schema
 * 存储所有原始事件数据，作为系统的事实数据源
 */
export interface EventsLogSchema {
  /** 主键，自增ID */
  id?: number;
  /** 事件发生时间戳 (毫秒) */
  timestamp: number;
  /** 事件类型 */
  eventType: EventType;
  /** Chrome标签页ID */
  tabId: number;
  /** 完整URL地址 */
  url: string;
  /** 访问会话标识符 (nanoid) */
  visitId: string;
  /** 活动会话标识符 (nanoid)，可为null */
  activityId: string | null;
  /** 是否已处理标志 (0=未处理, 1=已处理) */
  isProcessed: 0 | 1;
  /** 特殊标记，用于崩溃恢复等场景 */
  resolution?: 'crash_recovery';
}

/**
 * 聚合统计表Schema
 * 存储按日期和URL聚合的统计数据
 */
export interface AggregatedStatsSchema {
  /** 主键：date:url的组合键 */
  key: string;
  /** 日期 (YYYY-MM-DD格式) */
  date: string;
  /** 完整URL地址 */
  url: string;
  /** 主机名 (从URL提取) */
  hostname: string;
  /** 父域名 (使用PSL库提取) */
  parentDomain: string;
  /** 总打开时间 (毫秒) */
  total_open_time: number;
  /** 总活跃时间 (毫秒) */
  total_active_time: number;
  /** 最后更新时间戳 (毫秒) */
  last_updated: number;
}

/**
 * 数据库配置接口
 * 定义数据库的基本信息和配置
 */
export interface DatabaseConfig {
  /** 数据库名称 */
  name: string;
  /** 数据库版本号 */
  version: number;
  /** 对象存储配置列表 */
  stores: ObjectStoreConfig[];
}

/**
 * 对象存储配置接口
 * 定义单个表的结构和索引
 */
export interface ObjectStoreConfig {
  /** 表名 */
  name: string;
  /** 主键字段路径 */
  keyPath: string;
  /** 是否自动递增主键 */
  autoIncrement?: boolean;
  /** 索引配置列表 */
  indexes: IndexConfig[];
}

/**
 * 索引配置接口
 * 定义单个索引的配置
 */
export interface IndexConfig {
  /** 索引名称 */
  name: string;
  /** 索引字段路径 */
  keyPath: string;
  /** 是否唯一索引 */
  unique?: boolean;
  /** 是否多值索引 */
  multiEntry?: boolean;
}

/**
 * WebTime Tracker数据库配置
 * 完整的数据库结构定义
 */
export const WEBTIME_DB_CONFIG: DatabaseConfig = {
  name: 'webtime_tracker',
  version: 1,
  stores: [
    {
      name: 'events_log',
      keyPath: 'id',
      autoIncrement: true,
      indexes: [
        { name: 'isProcessed_idx', keyPath: 'isProcessed' },
        { name: 'visitId_idx', keyPath: 'visitId' },
        { name: 'activityId_idx', keyPath: 'activityId' },
        { name: 'timestamp_idx', keyPath: 'timestamp' },
        { name: 'eventType_idx', keyPath: 'eventType' },
        { name: 'tabId_idx', keyPath: 'tabId' },
        { name: 'url_idx', keyPath: 'url' },
      ],
    },
    {
      name: 'aggregated_stats',
      keyPath: 'key',
      indexes: [
        { name: 'date_idx', keyPath: 'date' },
        { name: 'hostname_idx', keyPath: 'hostname' },
        { name: 'parentDomain_idx', keyPath: 'parentDomain' },
        { name: 'lastUpdated_idx', keyPath: 'last_updated' },
        { name: 'url_idx', keyPath: 'url' },
      ],
    },
  ],
};

/**
 * 数据库错误类型枚举
 * 定义所有可能的数据库错误类型
 */
export enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  QUOTA_EXCEEDED = 'DB_QUOTA_EXCEEDED',
  SCHEMA_ERROR = 'DB_SCHEMA_ERROR',
  MIGRATION_FAILED = 'DB_MIGRATION_FAILED',
  OPERATION_FAILED = 'DB_OPERATION_FAILED',
  VALIDATION_ERROR = 'DB_VALIDATION_ERROR',
}

/**
 * 数据库错误接口
 * 标准化的错误信息结构
 */
export interface DatabaseError extends Error {
  code: DatabaseErrorCode;
  originalError?: Error;
  context?: Record<string, unknown>;
}

/**
 * 查询选项接口
 * 定义查询操作的通用选项
 */
export interface QueryOptions {
  /** 限制返回结果数量 */
  limit?: number;
  /** 跳过指定数量的结果 */
  offset?: number;
  /** 排序字段 */
  orderBy?: string;
  /** 排序方向 */
  direction?: 'asc' | 'desc';
}

/**
 * 事件查询过滤器
 * 定义事件日志查询的过滤条件
 */
export interface EventQueryFilter {
  /** 时间范围开始 */
  startTime?: number;
  /** 时间范围结束 */
  endTime?: number;
  /** 事件类型过滤 */
  eventTypes?: EventType[];
  /** 访问ID过滤 */
  visitIds?: string[];
  /** 活动ID过滤 */
  activityIds?: string[];
  /** 处理状态过滤 */
  isProcessed?: 0 | 1;
  /** URL模式过滤 */
  urlPattern?: string;
  /** 标签页ID过滤 */
  tabIds?: number[];
}

/**
 * 聚合数据查询过滤器
 * 定义聚合统计查询的过滤条件
 */
export interface StatsQueryFilter {
  /** 日期范围开始 (YYYY-MM-DD) */
  startDate?: string;
  /** 日期范围结束 (YYYY-MM-DD) */
  endDate?: string;
  /** 主机名过滤 */
  hostnames?: string[];
  /** 父域名过滤 */
  parentDomains?: string[];
  /** URL模式过滤 */
  urlPattern?: string;
  /** 最小打开时间过滤 (毫秒) */
  minOpenTime?: number;
  /** 最小活跃时间过滤 (毫秒) */
  minActiveTime?: number;
}

/**
 * 批量操作结果接口
 * 定义批量操作的返回结果
 */
export interface BatchOperationResult {
  /** 成功处理的记录数 */
  successCount: number;
  /** 失败的记录数 */
  failureCount: number;
  /** 失败的记录详情 */
  failures: Array<{
    index: number;
    error: string;
    data?: unknown;
  }>;
}

/**
 * 数据库统计信息接口
 * 定义数据库使用情况统计
 */
export interface DatabaseStats {
  /** 事件日志表记录数 */
  eventsCount: number;
  /** 聚合统计表记录数 */
  statsCount: number;
  /** 数据库大小估算 (字节) */
  estimatedSize: number;
  /** 最后更新时间 */
  lastUpdated: number;
}
