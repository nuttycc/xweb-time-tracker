/**
 * API Schema定义
 * 定义内部API接口的请求和响应格式
 *
 * 基于LLD文档设计，支持：
 * - 数据库操作API
 * - 配置管理API
 * - 统计查询API
 * - 错误响应格式
 */

import type {
  EventsLogSchema,
  AggregatedStatsSchema,
  EventQueryFilter,
  StatsQueryFilter,
  QueryOptions,
  BatchOperationResult,
  DatabaseStats,
} from './database-schema';

import type {
  UserConfigurationSchema,
  ApplicationConfigSchema,
  ConfigUpdateEvent,
  ConfigSyncStatus,
} from './config-schema';

/**
 * API响应状态枚举
 */
export enum ApiStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PARTIAL = 'partial',
}

/**
 * 基础API响应接口
 */
export interface BaseApiResponse<T = unknown> {
  /** 响应状态 */
  status: ApiStatus;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 错误代码 */
  errorCode?: string;
  /** 响应时间戳 */
  timestamp: number;
  /** 请求ID（用于追踪） */
  requestId?: string;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> extends BaseApiResponse<T[]> {
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页大小 */
    pageSize: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
    /** 是否有下一页 */
    hasNext: boolean;
    /** 是否有上一页 */
    hasPrev: boolean;
  };
}

/**
 * 事件日志API接口
 */
export namespace EventLogApi {
  /** 创建事件请求 */
  export interface CreateEventRequest {
    event: Omit<EventsLogSchema, 'id'>;
  }

  /** 创建事件响应 */
  export interface CreateEventResponse extends BaseApiResponse<{ id: number }> {}

  /** 批量创建事件请求 */
  export interface BatchCreateEventsRequest {
    events: Array<Omit<EventsLogSchema, 'id'>>;
  }

  /** 批量创建事件响应 */
  export interface BatchCreateEventsResponse extends BaseApiResponse<BatchOperationResult> {}

  /** 查询事件请求 */
  export interface QueryEventsRequest {
    filter?: EventQueryFilter;
    options?: QueryOptions;
  }

  /** 查询事件响应 */
  export interface QueryEventsResponse extends PaginatedResponse<EventsLogSchema> {}

  /** 更新事件请求 */
  export interface UpdateEventRequest {
    id: number;
    updates: Partial<Omit<EventsLogSchema, 'id'>>;
  }

  /** 更新事件响应 */
  export interface UpdateEventResponse extends BaseApiResponse<boolean> {}

  /** 批量更新事件请求 */
  export interface BatchUpdateEventsRequest {
    updates: Array<{
      id: number;
      updates: Partial<Omit<EventsLogSchema, 'id'>>;
    }>;
  }

  /** 批量更新事件响应 */
  export interface BatchUpdateEventsResponse extends BaseApiResponse<BatchOperationResult> {}

  /** 删除事件请求 */
  export interface DeleteEventRequest {
    id: number;
  }

  /** 删除事件响应 */
  export interface DeleteEventResponse extends BaseApiResponse<boolean> {}

  /** 批量删除事件请求 */
  export interface BatchDeleteEventsRequest {
    ids: number[];
  }

  /** 批量删除事件响应 */
  export interface BatchDeleteEventsResponse extends BaseApiResponse<BatchOperationResult> {}
}

/**
 * 聚合统计API接口
 */
export namespace StatsApi {
  /** 创建/更新统计请求 */
  export interface UpsertStatsRequest {
    stats: AggregatedStatsSchema;
  }

  /** 创建/更新统计响应 */
  export interface UpsertStatsResponse extends BaseApiResponse<boolean> {}

  /** 批量创建/更新统计请求 */
  export interface BatchUpsertStatsRequest {
    stats: AggregatedStatsSchema[];
  }

  /** 批量创建/更新统计响应 */
  export interface BatchUpsertStatsResponse extends BaseApiResponse<BatchOperationResult> {}

  /** 查询统计请求 */
  export interface QueryStatsRequest {
    filter?: StatsQueryFilter;
    options?: QueryOptions;
  }

  /** 查询统计响应 */
  export interface QueryStatsResponse extends PaginatedResponse<AggregatedStatsSchema> {}

  /** 聚合查询请求 */
  export interface AggregateStatsRequest {
    filter?: StatsQueryFilter;
    groupBy: Array<'date' | 'hostname' | 'parentDomain'>;
    metrics: Array<'total_open_time' | 'total_active_time' | 'count'>;
  }

  /** 聚合查询响应 */
  export interface AggregateStatsResponse
    extends BaseApiResponse<
      Array<{
        group: Record<string, string>;
        metrics: Record<string, number>;
      }>
    > {}

  /** 删除统计请求 */
  export interface DeleteStatsRequest {
    key: string;
  }

  /** 删除统计响应 */
  export interface DeleteStatsResponse extends BaseApiResponse<boolean> {}

  /** 批量删除统计请求 */
  export interface BatchDeleteStatsRequest {
    keys: string[];
  }

  /** 批量删除统计响应 */
  export interface BatchDeleteStatsResponse extends BaseApiResponse<BatchOperationResult> {}
}

/**
 * 配置管理API接口
 */
export namespace ConfigApi {
  /** 获取用户配置请求 */
  export type GetUserConfigRequest = {};

  /** 获取用户配置响应 */
  export interface GetUserConfigResponse extends BaseApiResponse<UserConfigurationSchema> {}

  /** 更新用户配置请求 */
  export interface UpdateUserConfigRequest {
    config: Partial<UserConfigurationSchema>;
  }

  /** 更新用户配置响应 */
  export interface UpdateUserConfigResponse extends BaseApiResponse<UserConfigurationSchema> {}

  /** 获取应用配置请求 */
  export type GetAppConfigRequest = {};

  /** 获取应用配置响应 */
  export interface GetAppConfigResponse extends BaseApiResponse<ApplicationConfigSchema> {}

  /** 更新应用配置请求 */
  export interface UpdateAppConfigRequest {
    config: Partial<ApplicationConfigSchema>;
  }

  /** 更新应用配置响应 */
  export interface UpdateAppConfigResponse extends BaseApiResponse<ApplicationConfigSchema> {}

  /** 重置配置请求 */
  export interface ResetConfigRequest {
    type: 'user' | 'app' | 'all';
  }

  /** 重置配置响应 */
  export interface ResetConfigResponse extends BaseApiResponse<boolean> {}

  /** 获取配置同步状态请求 */
  export type GetSyncStatusRequest = {};

  /** 获取配置同步状态响应 */
  export interface GetSyncStatusResponse extends BaseApiResponse<ConfigSyncStatus> {}

  /** 触发配置同步请求 */
  export type TriggerSyncRequest = {};

  /** 触发配置同步响应 */
  export interface TriggerSyncResponse extends BaseApiResponse<boolean> {}
}

/**
 * 数据库管理API接口
 */
export namespace DatabaseApi {
  /** 获取数据库统计请求 */
  export type GetStatsRequest = {};

  /** 获取数据库统计响应 */
  export interface GetStatsResponse extends BaseApiResponse<DatabaseStats> {}

  /** 清理数据库请求 */
  export interface CleanupRequest {
    /** 清理类型 */
    type: 'events' | 'stats' | 'all';
    /** 保留天数 */
    retentionDays?: number;
  }

  /** 清理数据库响应 */
  export interface CleanupResponse
    extends BaseApiResponse<{
      deletedEvents: number;
      deletedStats: number;
    }> {}

  /** 备份数据库请求 */
  export interface BackupRequest {
    /** 包含的表 */
    tables: Array<'events_log' | 'aggregated_stats'>;
    /** 是否压缩 */
    compress?: boolean;
  }

  /** 备份数据库响应 */
  export interface BackupResponse
    extends BaseApiResponse<{
      backupData: string;
      size: number;
      timestamp: number;
    }> {}

  /** 恢复数据库请求 */
  export interface RestoreRequest {
    /** 备份数据 */
    backupData: string;
    /** 是否覆盖现有数据 */
    overwrite?: boolean;
  }

  /** 恢复数据库响应 */
  export interface RestoreResponse
    extends BaseApiResponse<{
      restoredEvents: number;
      restoredStats: number;
    }> {}

  /** 检查数据库健康请求 */
  export type HealthCheckRequest = {};

  /** 检查数据库健康响应 */
  export interface HealthCheckResponse
    extends BaseApiResponse<{
      status: 'healthy' | 'warning' | 'error';
      issues: string[];
      recommendations: string[];
    }> {}
}

/**
 * 事件通知接口
 */
export namespace EventNotification {
  /** 配置更新通知 */
  export interface ConfigUpdatedNotification {
    type: 'config_updated';
    event: ConfigUpdateEvent;
  }

  /** 数据库错误通知 */
  export interface DatabaseErrorNotification {
    type: 'database_error';
    error: string;
    errorCode: string;
    timestamp: number;
  }

  /** 存储配额警告通知 */
  export interface StorageQuotaWarningNotification {
    type: 'storage_quota_warning';
    usagePercentage: number;
    availableSpace: number;
    timestamp: number;
  }

  /** 同步状态变更通知 */
  export interface SyncStatusChangedNotification {
    type: 'sync_status_changed';
    status: ConfigSyncStatus;
  }

  /** 联合通知类型 */
  export type Notification =
    | ConfigUpdatedNotification
    | DatabaseErrorNotification
    | StorageQuotaWarningNotification
    | SyncStatusChangedNotification;
}
