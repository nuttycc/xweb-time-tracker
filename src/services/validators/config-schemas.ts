/**
 * 配置Zod Schema定义
 * 为用户配置和应用配置提供类型安全的验证Schema
 *
 * 基于config-schema.ts的类型定义，提供：
 * - 用户配置验证
 * - 应用配置验证
 * - 配置导入导出验证
 * - 配置同步验证
 */

import * as z from 'zod/v4';
import { UTCTimestampSchema } from './database-schemas';
import {
  TIME_INTERVALS,
  RETENTION_PERIODS,
  APP_TIME_CONFIG,
  PERFORMANCE_CONFIG,
} from '../../shared/constants/time';

/**
 * 数据保留策略类型Schema
 */
export const RetentionPolicyTypeSchema = z.enum(
  ['immediate', 'short', 'long', 'permanent', 'custom'],
  {
    error: issue =>
      issue.input === undefined ? '数据保留策略类型是必需的' : '数据保留策略类型必须是有效的枚举值',
  }
);

/**
 * UI主题Schema
 */
export const UIThemeSchema = z.enum(['light', 'dark', 'auto'], {
  error: issue => (issue.input === undefined ? 'UI主题是必需的' : 'UI主题必须是有效的枚举值'),
});

/**
 * 语言Schema
 */
export const LanguageSchema = z.enum(['zh-CN', 'en-US'], {
  error: issue => (issue.input === undefined ? '语言设置是必需的' : '语言必须是有效的枚举值'),
});

/**
 * 日期格式Schema
 */
export const DateFormatSchema = z.enum(['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], {
  error: issue => (issue.input === undefined ? '日期格式是必需的' : '日期格式必须是有效的枚举值'),
});

/**
 * 时间格式Schema
 */
export const TimeFormatSchema = z.enum(['24h', '12h'], {
  error: issue => (issue.input === undefined ? '时间格式是必需的' : '时间格式必须是有效的枚举值'),
});

/**
 * 冲突解决策略Schema
 */
export const ConflictResolutionSchema = z.enum(['manual', 'auto_latest', 'auto_local'], {
  error: issue =>
    issue.input === undefined ? '冲突解决策略是必需的' : '冲突解决策略必须是有效的枚举值',
});

/**
 * 默认视图Schema
 */
export const DefaultViewSchema = z.enum(['daily', 'weekly', 'monthly'], {
  error: issue => (issue.input === undefined ? '默认视图是必需的' : '默认视图必须是有效的枚举值'),
});

/**
 * 默认分组Schema
 */
export const DefaultGroupingSchema = z.enum(['url', 'hostname', 'parentDomain'], {
  error: issue => (issue.input === undefined ? '默认分组是必需的' : '默认分组必须是有效的枚举值'),
});

/**
 * 版本号Schema (semver格式)
 */
export const VersionSchema = z
  .string({
    error: issue => (issue.input === undefined ? '版本号是必需的' : '版本号必须是字符串'),
  })
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/, {
    message: '版本号必须符合semver格式',
  });

/**
 * 设备ID Schema
 */
export const DeviceIdSchema = z
  .string({
    error: issue => (issue.input === undefined ? '设备ID是必需的' : '设备ID必须是字符串'),
  })
  .min(1, { message: '设备ID不能为空' })
  .max(100, { message: '设备ID长度不能超过100字符' });

/**
 * 域名列表Schema
 */
export const DomainListSchema = z
  .array(
    z
      .string()
      .min(1, { message: '域名不能为空' })
      .max(253, { message: '域名长度不能超过253字符' })
      .regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        { message: '域名格式无效' }
      ),
    {
      error: issue => (issue.input === undefined ? '域名列表是必需的' : '域名列表必须是数组'),
    }
  )
  .max(1000, { message: '域名列表不能超过1000个' });

/**
 * URL模式列表Schema
 */
export const URLPatternListSchema = z
  .array(
    z
      .string()
      .min(1, { message: 'URL模式不能为空' })
      .max(2048, { message: 'URL模式长度不能超过2048字符' }),
    {
      error: issue => (issue.input === undefined ? 'URL模式列表是必需的' : 'URL模式列表必须是数组'),
    }
  )
  .max(1000, { message: 'URL模式列表不能超过1000个' });

/**
 * 跟踪参数列表Schema
 */
export const TrackingParamsSchema = z
  .array(
    z
      .string()
      .min(1, { message: '跟踪参数不能为空' })
      .max(100, { message: '跟踪参数长度不能超过100字符' })
      .regex(/^[a-zA-Z0-9_-]+$/, { message: '跟踪参数只能包含字母、数字、下划线和连字符' }),
    {
      error: issue =>
        issue.input === undefined ? '跟踪参数列表是必需的' : '跟踪参数列表必须是数组',
    }
  )
  .max(100, { message: '跟踪参数列表不能超过100个' });

/**
 * 数据保留策略Schema
 */
export const RetentionPolicySchema = z
  .strictObject(
    {
      type: RetentionPolicyTypeSchema,
      customDays: z
        .number()
        .int({ message: '自定义天数必须是整数' })
        .min(1, { message: '自定义天数不能小于1天' })
        .max(3650, { message: '自定义天数不能超过10年' })
        .optional(),
    },
    {
      error: issue =>
        issue.input === undefined ? '数据保留策略是必需的' : '数据保留策略必须是对象',
    }
  )
  .refine(
    data => {
      if (data.type === 'custom') {
        return data.customDays !== undefined && data.customDays > 0;
      }
      return true;
    },
    {
      message: '当保留策略类型为custom时，必须提供有效的自定义天数',
      path: ['customDays'],
    }
  );

/**
 * UI设置Schema
 */
export const UISettingsSchema = z.strictObject(
  {
    theme: UIThemeSchema,
    language: LanguageSchema,
    dateFormat: DateFormatSchema,
    timeFormat: TimeFormatSchema,
  },
  {
    error: issue => (issue.input === undefined ? 'UI设置是必需的' : 'UI设置必须是对象'),
  }
);

/**
 * 过滤规则Schema
 */
export const FilterRulesSchema = z.strictObject(
  {
    excludedDomains: DomainListSchema,
    excludedUrls: URLPatternListSchema,
    trackingParamsToRemove: TrackingParamsSchema,
    minTrackingDuration: z
      .number({
        error: issue =>
          issue.input === undefined ? '最小追踪时长是必需的' : '最小追踪时长必须是数字',
      })
      .int({ message: '最小追踪时长必须是整数' })
      .min(0, { message: '最小追踪时长不能为负数' })
      .max(3600, { message: '最小追踪时长不能超过1小时' }),
  },
  {
    error: issue => (issue.input === undefined ? '过滤规则是必需的' : '过滤规则必须是对象'),
  }
);

/**
 * 显示偏好Schema
 */
export const DisplayPreferencesSchema = z.strictObject(
  {
    defaultView: DefaultViewSchema,
    defaultGrouping: DefaultGroupingSchema,
    showEfficiencyRatio: z.boolean({
      error: issue =>
        issue.input === undefined ? '效率比显示设置是必需的' : '效率比显示设置必须是布尔值',
    }),
    showActiveTimeOnly: z.boolean({
      error: issue =>
        issue.input === undefined ? '仅显示活跃时间设置是必需的' : '仅显示活跃时间设置必须是布尔值',
    }),
    compactMode: z.boolean({
      error: issue =>
        issue.input === undefined ? '紧凑模式设置是必需的' : '紧凑模式设置必须是布尔值',
    }),
  },
  {
    error: issue => (issue.input === undefined ? '显示偏好是必需的' : '显示偏好必须是对象'),
  }
);

/**
 * 通知设置Schema
 */
export const NotificationSettingsSchema = z.strictObject(
  {
    dailySummary: z.boolean({
      error: issue =>
        issue.input === undefined ? '每日摘要通知设置是必需的' : '每日摘要通知设置必须是布尔值',
    }),
    weeklyReport: z.boolean({
      error: issue =>
        issue.input === undefined ? '每周报告通知设置是必需的' : '每周报告通知设置必须是布尔值',
    }),
    storageWarnings: z.boolean({
      error: issue =>
        issue.input === undefined ? '存储警告通知设置是必需的' : '存储警告通知设置必须是布尔值',
    }),
    syncConflicts: z.boolean({
      error: issue =>
        issue.input === undefined ? '同步冲突通知设置是必需的' : '同步冲突通知设置必须是布尔值',
    }),
  },
  {
    error: issue => (issue.input === undefined ? '通知设置是必需的' : '通知设置必须是对象'),
  }
);

/**
 * 用户配置Schema
 */
export const UserConfigurationSchema = z.strictObject(
  {
    version: VersionSchema,
    lastModified: UTCTimestampSchema,
    deviceId: DeviceIdSchema,
    retentionPolicy: RetentionPolicySchema,
    uiSettings: UISettingsSchema,
    filterRules: FilterRulesSchema,
    displayPreferences: DisplayPreferencesSchema,
    notifications: NotificationSettingsSchema,
  },
  {
    error: issue => (issue.input === undefined ? '用户配置是必需的' : '用户配置必须是对象'),
  }
);

/**
 * 追踪设置Schema
 */
export const TrackingSettingsSchema = z.strictObject(
  {
    checkpointInterval: z
      .number({
        error: issue => (issue.input === undefined ? '检查点间隔是必需的' : '检查点间隔必须是数字'),
      })
      .int({ message: '检查点间隔必须是整数' })
      .min(1000, { message: '检查点间隔不能小于1秒' })
      .max(300000, { message: '检查点间隔不能超过5分钟' }),

    inactivityTimeout: z
      .number({
        error: issue => (issue.input === undefined ? '非活跃超时是必需的' : '非活跃超时必须是数字'),
      })
      .int({ message: '非活跃超时必须是整数' })
      .min(30000, { message: '非活跃超时不能小于30秒' })
      .max(3600000, { message: '非活跃超时不能超过1小时' }),

    focusDetectionDelay: z
      .number({
        error: issue =>
          issue.input === undefined ? '焦点检测延迟是必需的' : '焦点检测延迟必须是数字',
      })
      .int({ message: '焦点检测延迟必须是整数' })
      .min(100, { message: '焦点检测延迟不能小于100毫秒' })
      .max(10000, { message: '焦点检测延迟不能超过10秒' }),

    batchSize: z
      .number({
        error: issue => (issue.input === undefined ? '批处理大小是必需的' : '批处理大小必须是数字'),
      })
      .int({ message: '批处理大小必须是整数' })
      .min(1, { message: '批处理大小不能小于1' })
      .max(10000, { message: '批处理大小不能超过10000' }),
  },
  {
    error: issue => (issue.input === undefined ? '追踪设置是必需的' : '追踪设置必须是对象'),
  }
);

/**
 * 存储设置Schema
 */
export const StorageSettingsSchema = z.strictObject(
  {
    maxEventLogSize: z
      .number({
        error: issue =>
          issue.input === undefined ? '事件日志最大条数是必需的' : '事件日志最大条数必须是数字',
      })
      .int({ message: '事件日志最大条数必须是整数' })
      .min(1000, { message: '事件日志最大条数不能小于1000' })
      .max(1000000, { message: '事件日志最大条数不能超过100万' }),

    maxAggregatedStatsSize: z
      .number({
        error: issue =>
          issue.input === undefined ? '聚合数据最大条数是必需的' : '聚合数据最大条数必须是数字',
      })
      .int({ message: '聚合数据最大条数必须是整数' })
      .min(1000, { message: '聚合数据最大条数不能小于1000' })
      .max(500000, { message: '聚合数据最大条数不能超过50万' }),

    quotaWarningThreshold: z
      .number({
        error: issue =>
          issue.input === undefined ? '配额警告阈值是必需的' : '配额警告阈值必须是数字',
      })
      .min(50, { message: '配额警告阈值不能小于50%' })
      .max(95, { message: '配额警告阈值不能超过95%' }),

    autoCleanupEnabled: z.boolean({
      error: issue =>
        issue.input === undefined ? '自动清理启用设置是必需的' : '自动清理启用设置必须是布尔值',
    }),
  },
  {
    error: issue => (issue.input === undefined ? '存储设置是必需的' : '存储设置必须是对象'),
  }
);

/**
 * 同步设置Schema
 */
export const SyncSettingsSchema = z.strictObject(
  {
    enabled: z.boolean({
      error: issue =>
        issue.input === undefined ? '同步启用设置是必需的' : '同步启用设置必须是布尔值',
    }),

    conflictResolution: ConflictResolutionSchema,

    syncInterval: z
      .number({
        error: issue => (issue.input === undefined ? '同步间隔是必需的' : '同步间隔必须是数字'),
      })
      .int({ message: '同步间隔必须是整数' })
      .min(60000, { message: '同步间隔不能小于1分钟' })
      .max(3600000, { message: '同步间隔不能超过1小时' }),

    retryAttempts: z
      .number({
        error: issue => (issue.input === undefined ? '重试次数是必需的' : '重试次数必须是数字'),
      })
      .int({ message: '重试次数必须是整数' })
      .min(0, { message: '重试次数不能为负数' })
      .max(10, { message: '重试次数不能超过10次' }),
  },
  {
    error: issue => (issue.input === undefined ? '同步设置是必需的' : '同步设置必须是对象'),
  }
);

/**
 * 应用配置Schema
 */
export const ApplicationConfigSchema = z.strictObject(
  {
    tracking: TrackingSettingsSchema,
    storage: StorageSettingsSchema,
    sync: SyncSettingsSchema,
  },
  {
    error: issue => (issue.input === undefined ? '应用配置是必需的' : '应用配置必须是对象'),
  }
);

/**
 * 配置更新Schema（部分更新）
 */
export const UserConfigUpdateSchema = UserConfigurationSchema.partial();
export const ApplicationConfigUpdateSchema = ApplicationConfigSchema.partial();

/**
 * 配置导入导出Schema
 */
export const ConfigExportSchema = z.strictObject(
  {
    userConfig: UserConfigurationSchema,
    appConfig: ApplicationConfigSchema.optional(),
    exportedAt: UTCTimestampSchema,
    exportVersion: VersionSchema,
  },
  {
    error: issue => (issue.input === undefined ? '配置导出数据是必需的' : '配置导出数据必须是对象'),
  }
);

/**
 * 配置同步数据Schema
 */
export const ConfigSyncDataSchema = z.strictObject(
  {
    userConfig: UserConfigurationSchema,
    syncedAt: UTCTimestampSchema,
    deviceId: DeviceIdSchema,
    conflictResolved: z.boolean().optional(),
  },
  {
    error: issue => (issue.input === undefined ? '配置同步数据是必需的' : '配置同步数据必须是对象'),
  }
);

/**
 * 类型推断
 */
export type UserConfigurationData = z.infer<typeof UserConfigurationSchema>;
export type ApplicationConfigData = z.infer<typeof ApplicationConfigSchema>;
export type UserConfigUpdateData = z.infer<typeof UserConfigUpdateSchema>;
export type ApplicationConfigUpdateData = z.infer<typeof ApplicationConfigUpdateSchema>;
export type ConfigExportData = z.infer<typeof ConfigExportSchema>;
export type ConfigSyncData = z.infer<typeof ConfigSyncDataSchema>;
export type RetentionPolicyData = z.infer<typeof RetentionPolicySchema>;
export type UISettingsData = z.infer<typeof UISettingsSchema>;
export type FilterRulesData = z.infer<typeof FilterRulesSchema>;
export type DisplayPreferencesData = z.infer<typeof DisplayPreferencesSchema>;
export type NotificationSettingsData = z.infer<typeof NotificationSettingsSchema>;
export type TrackingSettingsData = z.infer<typeof TrackingSettingsSchema>;
export type StorageSettingsData = z.infer<typeof StorageSettingsSchema>;
export type SyncSettingsData = z.infer<typeof SyncSettingsSchema>;
