/**
 * 配置Schema定义
 * 定义用户配置和应用配置的数据结构
 *
 * 基于LLD文档设计，支持：
 * - 用户配置：个人偏好设置
 * - 应用配置：系统运行参数
 * - 配置验证和类型安全
 */

/**
 * 数据保留策略类型
 */
export type RetentionPolicyType =
  | 'immediate' // 立即删除
  | 'short' // 短期保留 (7天)
  | 'long' // 长期保留 (90天)
  | 'permanent' // 永久保留
  | 'custom'; // 自定义天数

/**
 * UI主题类型
 */
export type UITheme = 'light' | 'dark' | 'auto';

/**
 * 语言类型
 */
export type Language = 'zh-CN' | 'en-US';

/**
 * 日期格式类型
 */
export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';

/**
 * 时间格式类型
 */
export type TimeFormat = '24h' | '12h';

/**
 * 冲突解决策略类型
 */
export type ConflictResolution = 'manual' | 'auto_latest' | 'auto_local';

/**
 * 数据保留策略配置
 */
export interface RetentionPolicy {
  /** 保留策略类型 */
  type: RetentionPolicyType;
  /** 自定义天数（当type为custom时使用） */
  customDays?: number;
}

/**
 * UI设置配置
 */
export interface UISettings {
  /** 界面主题 */
  theme: UITheme;
  /** 界面语言 */
  language: Language;
  /** 日期格式 */
  dateFormat: DateFormat;
  /** 时间格式 */
  timeFormat: TimeFormat;
}

/**
 * 过滤规则配置
 */
export interface FilterRules {
  /** 排除的域名列表 */
  excludedDomains: string[];
  /** 排除的URL模式列表 */
  excludedUrls: string[];
  /** 要移除的跟踪参数列表 */
  trackingParamsToRemove: string[];
  /** 最小追踪时长（秒） */
  minTrackingDuration: number;
}

/**
 * 用户配置Schema
 * 存储用户的个人偏好设置
 */
export interface UserConfigurationSchema {
  /** 配置版本 (semver格式) */
  version: string;
  /** 最后修改时间戳 */
  lastModified: number;
  /** 设备标识符 */
  deviceId: string;
  /** 数据保留设置 */
  retentionPolicy: RetentionPolicy;
  /** 界面设置 */
  uiSettings: UISettings;
  /** 过滤规则 */
  filterRules: FilterRules;
}

/**
 * 追踪设置配置
 */
export interface TrackingSettings {
  /** 检查点间隔（毫秒） */
  checkpointInterval: number;
  /** 非活跃超时（毫秒） */
  inactivityTimeout: number;
  /** 焦点检测延迟（毫秒） */
  focusDetectionDelay: number;
  /** 批处理大小 */
  batchSize: number;
}

/**
 * 存储设置配置
 */
export interface StorageSettings {
  /** 事件日志最大条数 */
  maxEventLogSize: number;
  /** 聚合数据最大条数 */
  maxAggregatedStatsSize: number;
  /** 配额警告阈值（百分比） */
  quotaWarningThreshold: number;
  /** 自动清理启用 */
  autoCleanupEnabled: boolean;
}

/**
 * 同步设置配置
 */
export interface SyncSettings {
  /** 同步启用 */
  enabled: boolean;
  /** 冲突解决策略 */
  conflictResolution: ConflictResolution;
  /** 同步间隔（毫秒） */
  syncInterval: number;
  /** 重试次数 */
  retryAttempts: number;
}

/**
 * 应用配置Schema
 * 存储应用的系统运行参数
 */
export interface ApplicationConfigSchema {
  /** 追踪设置 */
  tracking: TrackingSettings;
  /** 存储设置 */
  storage: StorageSettings;
  /** 同步设置 */
  sync: SyncSettings;
}

/**
 * 默认用户配置
 */
export const DEFAULT_USER_CONFIG: UserConfigurationSchema = {
  version: '1.0.0',
  lastModified: Date.now(),
  deviceId: '', // 将在初始化时生成
  retentionPolicy: {
    type: 'long',
  },
  uiSettings: {
    theme: 'auto',
    language: 'zh-CN',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
  },
  filterRules: {
    excludedDomains: [],
    excludedUrls: [],
    trackingParamsToRemove: [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      '_ga',
      '_gid',
    ],
    minTrackingDuration: 5, // 5秒
  },
};

/**
 * 默认应用配置
 */
export const DEFAULT_APP_CONFIG: ApplicationConfigSchema = {
  tracking: {
    checkpointInterval: 30000, // 30秒
    inactivityTimeout: 300000, // 5分钟
    focusDetectionDelay: 1000, // 1秒
    batchSize: 100,
  },
  storage: {
    maxEventLogSize: 100000, // 10万条记录
    maxAggregatedStatsSize: 50000, // 5万条记录
    quotaWarningThreshold: 80, // 80%
    autoCleanupEnabled: true,
  },
  sync: {
    enabled: true,
    conflictResolution: 'auto_latest',
    syncInterval: 300000, // 5分钟
    retryAttempts: 3,
  },
};

/**
 * 配置验证错误类型
 */
export enum ConfigValidationError {
  INVALID_VERSION = 'INVALID_VERSION',
  INVALID_DEVICE_ID = 'INVALID_DEVICE_ID',
  INVALID_RETENTION_POLICY = 'INVALID_RETENTION_POLICY',
  INVALID_UI_SETTINGS = 'INVALID_UI_SETTINGS',
  INVALID_FILTER_RULES = 'INVALID_FILTER_RULES',
  INVALID_TRACKING_SETTINGS = 'INVALID_TRACKING_SETTINGS',
  INVALID_STORAGE_SETTINGS = 'INVALID_STORAGE_SETTINGS',
  INVALID_SYNC_SETTINGS = 'INVALID_SYNC_SETTINGS',
}

/**
 * 配置更新事件类型
 */
export interface ConfigUpdateEvent {
  /** 更新的配置键 */
  key: string;
  /** 旧值 */
  oldValue: unknown;
  /** 新值 */
  newValue: unknown;
  /** 更新时间戳 */
  timestamp: number;
}

/**
 * 配置同步状态
 */
export interface ConfigSyncStatus {
  /** 是否正在同步 */
  syncing: boolean;
  /** 最后同步时间 */
  lastSyncTime: number;
  /** 同步错误信息 */
  syncError?: string;
  /** 冲突数量 */
  conflictCount: number;
}
