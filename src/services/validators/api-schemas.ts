/**
 * API Zod Schema定义
 * 为内部API接口提供类型安全的验证Schema
 *
 * 基于api-schema.ts的类型定义，提供：
 * - API请求验证
 * - API响应验证
 * - 分页参数验证
 * - 错误响应验证
 */

import * as z from 'zod/v4';
import {
  EventsLogSchema,
  AggregatedStatsSchema,
  CreateEventsLogSchema,
  CreateAggregatedStatsSchema,
  BatchEventsLogSchema,
  BatchAggregatedStatsSchema,
  UTCTimestampSchema,
} from './database-schemas';
import {
  UserConfigurationSchema,
  ApplicationConfigSchema,
  UserConfigUpdateSchema,
  ApplicationConfigUpdateSchema,
} from './config-schemas';

/**
 * API状态枚举Schema
 */
export const ApiStatusSchema = z.enum(['success', 'error', 'partial'], {
  error: issue => (issue.input === undefined ? 'API状态是必需的' : 'API状态必须是有效的枚举值'),
});

/**
 * 请求ID Schema
 */
export const RequestIdSchema = z
  .string({
    error: '请求ID必须是字符串',
  })
  .min(1, '请求ID不能为空')
  .max(100, '请求ID长度不能超过100字符')
  .optional();

/**
 * 错误代码Schema
 */
export const ErrorCodeSchema = z
  .string({
    error: '错误代码必须是字符串',
  })
  .min(1, '错误代码不能为空')
  .max(50, '错误代码长度不能超过50字符')
  .optional();

/**
 * 基础API响应Schema
 */
export const BaseApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.strictObject(
    {
      status: ApiStatusSchema,
      data: dataSchema.optional(),
      error: z
        .string({
          error: '错误信息必须是字符串',
        })
        .optional(),
      errorCode: ErrorCodeSchema,
      timestamp: UTCTimestampSchema,
      requestId: RequestIdSchema,
    },
    {
      error: issue => (issue.input === undefined ? 'API响应是必需的' : 'API响应必须是对象'),
    }
  );

/**
 * 分页信息Schema
 */
export const PaginationSchema = z.strictObject(
  {
    page: z
      .number({
        error: issue => (issue.input === undefined ? '页码是必需的' : '页码必须是数字'),
      })
      .int({ message: '页码必须是整数' })
      .min(1, { message: '页码不能小于1' }),

    pageSize: z
      .number({
        error: issue => (issue.input === undefined ? '每页大小是必需的' : '每页大小必须是数字'),
      })
      .int({ message: '每页大小必须是整数' })
      .min(1, { message: '每页大小不能小于1' })
      .max(1000, { message: '每页大小不能超过1000' }),

    total: z
      .number({
        error: issue => (issue.input === undefined ? '总记录数是必需的' : '总记录数必须是数字'),
      })
      .int({ message: '总记录数必须是整数' })
      .min(0, { message: '总记录数不能为负数' }),

    totalPages: z
      .number({
        error: issue => (issue.input === undefined ? '总页数是必需的' : '总页数必须是数字'),
      })
      .int({ message: '总页数必须是整数' })
      .min(0, { message: '总页数不能为负数' }),

    hasNext: z.boolean({
      error: issue =>
        issue.input === undefined ? '是否有下一页是必需的' : '是否有下一页必须是布尔值',
    }),

    hasPrev: z.boolean({
      error: issue =>
        issue.input === undefined ? '是否有上一页是必需的' : '是否有上一页必须是布尔值',
    }),
  },
  {
    error: issue => (issue.input === undefined ? '分页信息是必需的' : '分页信息必须是对象'),
  }
);

/**
 * 分页响应Schema
 */
export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  BaseApiResponseSchema(z.array(itemSchema)).extend({
    pagination: PaginationSchema,
  });

/**
 * 查询选项Schema
 */
export const QueryOptionsSchema = z
  .strictObject(
    {
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(1000).optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      limit: z.number().int().min(1).max(10000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    {
      error: '查询选项必须是对象',
    }
  )
  .optional();

/**
 * 日期范围Schema
 */
export const DateRangeSchema = z
  .strictObject(
    {
      startDate: z
        .string({
          error: issue => (issue.input === undefined ? '开始日期是必需的' : '开始日期必须是字符串'),
        })
        .regex(/^\d{4}-\d{2}-\d{2}$/, '开始日期格式必须是YYYY-MM-DD'),

      endDate: z
        .string({
          error: issue => (issue.input === undefined ? '结束日期是必需的' : '结束日期必须是字符串'),
        })
        .regex(/^\d{4}-\d{2}-\d{2}$/, '结束日期格式必须是YYYY-MM-DD'),
    },
    {
      error: issue => (issue.input === undefined ? '日期范围是必需的' : '日期范围必须是对象'),
    }
  )
  .refine(
    data => {
      return new Date(data.startDate) <= new Date(data.endDate);
    },
    {
      message: '开始日期不能晚于结束日期',
    }
  );

/**
 * 事件查询过滤器Schema
 */
export const EventQueryFilterSchema = z
  .strictObject(
    {
      dateRange: DateRangeSchema.optional(),
      eventTypes: z
        .array(
          z.enum([
            'open_time_start',
            'open_time_end',
            'active_time_start',
            'active_time_end',
            'checkpoint',
          ])
        )
        .optional(),
      tabIds: z.array(z.number().int()).optional(),
      urls: z.array(z.url()).optional(),
      visitIds: z.array(z.string()).optional(),
      activityIds: z.array(z.string()).optional(),
      isProcessed: z.union([z.literal(0), z.literal(1)]).optional(),
    },
    {
      error: '事件查询过滤器必须是对象',
    }
  )
  .optional();

/**
 * 统计查询过滤器Schema
 */
export const StatsQueryFilterSchema = z
  .strictObject(
    {
      dateRange: DateRangeSchema.optional(),
      hostnames: z.array(z.string()).optional(),
      parentDomains: z.array(z.string()).optional(),
      urls: z.array(z.url()).optional(),
      minOpenTime: z.number().int().min(0).optional(),
      minActiveTime: z.number().int().min(0).optional(),
    },
    {
      error: '统计查询过滤器必须是对象',
    }
  )
  .optional();

/**
 * 批量操作结果Schema
 */
export const BatchOperationResultSchema = z
  .strictObject(
    {
      total: z
        .number({
          error: issue => (issue.input === undefined ? '总数是必需的' : '总数必须是数字'),
        })
        .int({ message: '总数必须是整数' })
        .min(0, { message: '总数不能为负数' }),

      successful: z
        .number({
          error: issue => (issue.input === undefined ? '成功数是必需的' : '成功数必须是数字'),
        })
        .int({ message: '成功数必须是整数' })
        .min(0, { message: '成功数不能为负数' }),

      failed: z
        .number({
          error: issue => (issue.input === undefined ? '失败数是必需的' : '失败数必须是数字'),
        })
        .int({ message: '失败数必须是整数' })
        .min(0, { message: '失败数不能为负数' }),

      errors: z
        .array(
          z.strictObject({
            index: z.number().int().min(0),
            error: z.string(),
            errorCode: z.string().optional(),
          })
        )
        .optional(),
    },
    {
      error: issue =>
        issue.input === undefined ? '批量操作结果是必需的' : '批量操作结果必须是对象',
    }
  )
  .refine(
    data => {
      return data.successful + data.failed === data.total;
    },
    {
      message: '成功数和失败数之和必须等于总数',
    }
  );

/**
 * 数据库统计Schema
 */
export const DatabaseStatsSchema = z.strictObject(
  {
    eventsLogCount: z.number().int().min(0),
    aggregatedStatsCount: z.number().int().min(0),
    totalSize: z.number().int().min(0),
    lastCleanup: UTCTimestampSchema.optional(),
    quotaUsage: z.number().min(0).max(100),
  },
  {
    error: issue => (issue.input === undefined ? '数据库统计是必需的' : '数据库统计必须是对象'),
  }
);

// ==================== 事件日志API Schema ====================

/**
 * 创建事件请求Schema
 */
export const CreateEventRequestSchema = z.strictObject(
  {
    event: CreateEventsLogSchema,
  },
  {
    error: issue => (issue.input === undefined ? '创建事件请求是必需的' : '创建事件请求必须是对象'),
  }
);

/**
 * 创建事件响应Schema
 */
export const CreateEventResponseSchema = BaseApiResponseSchema(
  z.strictObject({
    id: z.number().int().positive(),
  })
);

/**
 * 批量创建事件请求Schema
 */
export const BatchCreateEventsRequestSchema = z.strictObject(
  {
    events: BatchEventsLogSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '批量创建事件请求是必需的' : '批量创建事件请求必须是对象',
  }
);

/**
 * 批量创建事件响应Schema
 */
export const BatchCreateEventsResponseSchema = BaseApiResponseSchema(BatchOperationResultSchema);

/**
 * 查询事件请求Schema
 */
export const QueryEventsRequestSchema = z
  .strictObject(
    {
      filter: EventQueryFilterSchema,
      options: QueryOptionsSchema,
    },
    {
      error: '查询事件请求必须是对象',
    }
  )
  .optional();

/**
 * 查询事件响应Schema
 */
export const QueryEventsResponseSchema = PaginatedResponseSchema(EventsLogSchema);

/**
 * 更新事件请求Schema
 */
export const UpdateEventRequestSchema = z.strictObject(
  {
    id: z.number().int().positive(),
    updates: EventsLogSchema.partial(),
  },
  {
    error: issue => (issue.input === undefined ? '更新事件请求是必需的' : '更新事件请求必须是对象'),
  }
);

/**
 * 更新事件响应Schema
 */
export const UpdateEventResponseSchema = BaseApiResponseSchema(z.boolean());

/**
 * 删除事件请求Schema
 */
export const DeleteEventRequestSchema = z.strictObject(
  {
    id: z.number().int().positive(),
  },
  {
    error: issue => (issue.input === undefined ? '删除事件请求是必需的' : '删除事件请求必须是对象'),
  }
);

/**
 * 删除事件响应Schema
 */
export const DeleteEventResponseSchema = BaseApiResponseSchema(z.boolean());

// ==================== 聚合统计API Schema ====================

/**
 * 创建/更新统计请求Schema
 */
export const UpsertStatsRequestSchema = z.strictObject(
  {
    stats: CreateAggregatedStatsSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '创建/更新统计请求是必需的' : '创建/更新统计请求必须是对象',
  }
);

/**
 * 创建/更新统计响应Schema
 */
export const UpsertStatsResponseSchema = BaseApiResponseSchema(z.boolean());

/**
 * 批量创建/更新统计请求Schema
 */
export const BatchUpsertStatsRequestSchema = z.strictObject(
  {
    stats: BatchAggregatedStatsSchema,
  },
  {
    error: issue =>
      issue.input === undefined
        ? '批量创建/更新统计请求是必需的'
        : '批量创建/更新统计请求必须是对象',
  }
);

/**
 * 批量创建/更新统计响应Schema
 */
export const BatchUpsertStatsResponseSchema = BaseApiResponseSchema(BatchOperationResultSchema);

/**
 * 查询统计请求Schema
 */
export const QueryStatsRequestSchema = z
  .strictObject(
    {
      filter: StatsQueryFilterSchema,
      options: QueryOptionsSchema,
    },
    {
      error: '查询统计请求必须是对象',
    }
  )
  .optional();

/**
 * 查询统计响应Schema
 */
export const QueryStatsResponseSchema = PaginatedResponseSchema(AggregatedStatsSchema);

/**
 * 聚合查询请求Schema
 */
export const AggregateStatsRequestSchema = z.strictObject(
  {
    filter: StatsQueryFilterSchema,
    groupBy: z
      .array(z.enum(['date', 'hostname', 'parentDomain']), {
        error: issue => (issue.input === undefined ? '分组字段是必需的' : '分组字段必须是数组'),
      })
      .min(1, '至少需要一个分组字段'),
    metrics: z
      .array(z.enum(['total_open_time', 'total_active_time', 'count']), {
        error: issue => (issue.input === undefined ? '指标字段是必需的' : '指标字段必须是数组'),
      })
      .min(1, '至少需要一个指标字段'),
  },
  {
    error: issue => (issue.input === undefined ? '聚合查询请求是必需的' : '聚合查询请求必须是对象'),
  }
);

/**
 * 聚合查询响应Schema
 */
export const AggregateStatsResponseSchema = BaseApiResponseSchema(
  z.array(
    z.strictObject({
      group: z.record(z.string(), z.string()),
      metrics: z.record(z.string(), z.number()),
    })
  )
);

/**
 * 删除统计请求Schema
 */
export const DeleteStatsRequestSchema = z.strictObject(
  {
    key: z.string().min(1),
  },
  {
    error: issue => (issue.input === undefined ? '删除统计请求是必需的' : '删除统计请求必须是对象'),
  }
);

/**
 * 删除统计响应Schema
 */
export const DeleteStatsResponseSchema = BaseApiResponseSchema(z.boolean());

// ==================== 配置管理API Schema ====================

/**
 * 获取用户配置响应Schema
 */
export const GetUserConfigResponseSchema = BaseApiResponseSchema(UserConfigurationSchema);

/**
 * 更新用户配置请求Schema
 */
export const UpdateUserConfigRequestSchema = z.strictObject(
  {
    config: UserConfigUpdateSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '更新用户配置请求是必需的' : '更新用户配置请求必须是对象',
  }
);

/**
 * 更新用户配置响应Schema
 */
export const UpdateUserConfigResponseSchema = BaseApiResponseSchema(UserConfigurationSchema);

/**
 * 获取应用配置响应Schema
 */
export const GetAppConfigResponseSchema = BaseApiResponseSchema(ApplicationConfigSchema);

/**
 * 更新应用配置请求Schema
 */
export const UpdateAppConfigRequestSchema = z.strictObject(
  {
    config: ApplicationConfigUpdateSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '更新应用配置请求是必需的' : '更新应用配置请求必须是对象',
  }
);

/**
 * 更新应用配置响应Schema
 */
export const UpdateAppConfigResponseSchema = BaseApiResponseSchema(ApplicationConfigSchema);

/**
 * 重置配置请求Schema
 */
export const ResetConfigRequestSchema = z.strictObject(
  {
    type: z.enum(['user', 'app', 'all'], {
      error: issue =>
        issue.input === undefined ? '重置类型是必需的' : '重置类型必须是有效的枚举值',
    }),
  },
  {
    error: issue => (issue.input === undefined ? '重置配置请求是必需的' : '重置配置请求必须是对象'),
  }
);

/**
 * 重置配置响应Schema
 */
export const ResetConfigResponseSchema = BaseApiResponseSchema(z.boolean());

// ==================== 数据库管理API Schema ====================

/**
 * 获取数据库统计响应Schema
 */
export const GetDatabaseStatsResponseSchema = BaseApiResponseSchema(DatabaseStatsSchema);

/**
 * 清理数据库请求Schema
 */
export const CleanupDatabaseRequestSchema = z.strictObject(
  {
    type: z.enum(['events', 'stats', 'all'], {
      error: issue =>
        issue.input === undefined ? '清理类型是必需的' : '清理类型必须是有效的枚举值',
    }),
    retentionDays: z
      .number({
        error: '保留天数必须是数字',
      })
      .int({ message: '保留天数必须是整数' })
      .min(0, { message: '保留天数不能为负数' })
      .max(3650, { message: '保留天数不能超过10年' })
      .optional(),
  },
  {
    error: issue =>
      issue.input === undefined ? '清理数据库请求是必需的' : '清理数据库请求必须是对象',
  }
);

/**
 * 清理数据库响应Schema
 */
export const CleanupDatabaseResponseSchema = BaseApiResponseSchema(
  z.strictObject({
    deletedEvents: z.number().int().min(0),
    deletedStats: z.number().int().min(0),
  })
);

/**
 * 备份数据库请求Schema
 */
export const BackupDatabaseRequestSchema = z.strictObject(
  {
    tables: z
      .array(z.enum(['events_log', 'aggregated_stats']), {
        error: issue => (issue.input === undefined ? '表列表是必需的' : '表列表必须是数组'),
      })
      .min(1, '至少需要选择一个表'),
    compress: z
      .boolean({
        error: '压缩选项必须是布尔值',
      })
      .optional(),
  },
  {
    error: issue =>
      issue.input === undefined ? '备份数据库请求是必需的' : '备份数据库请求必须是对象',
  }
);

/**
 * 备份数据库响应Schema
 */
export const BackupDatabaseResponseSchema = BaseApiResponseSchema(
  z.strictObject({
    backupData: z.string(),
    size: z.number().int().min(0),
    timestamp: UTCTimestampSchema,
  })
);

/**
 * 恢复数据库请求Schema
 */
export const RestoreDatabaseRequestSchema = z.strictObject(
  {
    backupData: z
      .string({
        error: issue => (issue.input === undefined ? '备份数据是必需的' : '备份数据必须是字符串'),
      })
      .min(1, '备份数据不能为空'),
    overwrite: z
      .boolean({
        error: '覆盖选项必须是布尔值',
      })
      .optional(),
  },
  {
    error: issue =>
      issue.input === undefined ? '恢复数据库请求是必需的' : '恢复数据库请求必须是对象',
  }
);

/**
 * 恢复数据库响应Schema
 */
export const RestoreDatabaseResponseSchema = BaseApiResponseSchema(
  z.strictObject({
    restoredEvents: z.number().int().min(0),
    restoredStats: z.number().int().min(0),
  })
);

/**
 * 数据库健康检查响应Schema
 */
export const DatabaseHealthCheckResponseSchema = BaseApiResponseSchema(
  z.strictObject({
    status: z.enum(['healthy', 'warning', 'error']),
    issues: z.array(z.string()),
    recommendations: z.array(z.string()),
  })
);

// ==================== 事件通知Schema ====================

/**
 * 配置更新通知Schema
 */
export const ConfigUpdatedNotificationSchema = z.strictObject(
  {
    type: z.literal('config_updated'),
    event: z.strictObject({
      configType: z.enum(['user', 'app']),
      changes: z.record(z.string(), z.unknown()),
      timestamp: UTCTimestampSchema,
    }),
  },
  {
    error: issue => (issue.input === undefined ? '配置更新通知是必需的' : '配置更新通知必须是对象'),
  }
);

/**
 * 数据库错误通知Schema
 */
export const DatabaseErrorNotificationSchema = z.strictObject(
  {
    type: z.literal('database_error'),
    error: z.string(),
    errorCode: z.string(),
    timestamp: UTCTimestampSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '数据库错误通知是必需的' : '数据库错误通知必须是对象',
  }
);

/**
 * 存储配额警告通知Schema
 */
export const StorageQuotaWarningNotificationSchema = z.strictObject(
  {
    type: z.literal('storage_quota_warning'),
    usagePercentage: z.number().min(0).max(100),
    availableSpace: z.number().int().min(0),
    timestamp: UTCTimestampSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '存储配额警告通知是必需的' : '存储配额警告通知必须是对象',
  }
);

/**
 * 同步状态变更通知Schema
 */
export const SyncStatusChangedNotificationSchema = z.strictObject(
  {
    type: z.literal('sync_status_changed'),
    status: z.enum(['syncing', 'synced', 'error', 'disabled']),
    timestamp: UTCTimestampSchema,
  },
  {
    error: issue =>
      issue.input === undefined ? '同步状态变更通知是必需的' : '同步状态变更通知必须是对象',
  }
);

/**
 * 联合通知Schema
 */
export const NotificationSchema = z.union([
  ConfigUpdatedNotificationSchema,
  DatabaseErrorNotificationSchema,
  StorageQuotaWarningNotificationSchema,
  SyncStatusChangedNotificationSchema,
]);

// ==================== 类型推断 ====================

export type ApiStatusData = z.infer<typeof ApiStatusSchema>;
export type BaseApiResponseData<T> = z.infer<
  ReturnType<typeof BaseApiResponseSchema<z.ZodType<T>>>
>;
export type PaginationData = z.infer<typeof PaginationSchema>;
export type PaginatedResponseData<T> = z.infer<
  ReturnType<typeof PaginatedResponseSchema<z.ZodType<T>>>
>;
export type QueryOptionsData = z.infer<typeof QueryOptionsSchema>;
export type DateRangeData = z.infer<typeof DateRangeSchema>;
export type EventQueryFilterData = z.infer<typeof EventQueryFilterSchema>;
export type StatsQueryFilterData = z.infer<typeof StatsQueryFilterSchema>;
export type BatchOperationResultData = z.infer<typeof BatchOperationResultSchema>;
export type DatabaseStatsData = z.infer<typeof DatabaseStatsSchema>;
export type NotificationData = z.infer<typeof NotificationSchema>;
