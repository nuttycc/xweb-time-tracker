/**
 * 时间相关常量定义
 * 定义日期格式、时区配置、时间间隔等常量
 */

/**
 * 日期格式常量
 */
export const DATE_FORMATS = {
  /** 标准日期格式 YYYY-MM-DD */
  STANDARD_DATE: 'yyyy-MM-dd',
  /** 标准日期时间格式 YYYY-MM-DD HH:mm:ss */
  STANDARD_DATETIME: 'yyyy-MM-dd HH:mm:ss',
  /** ISO 8601 格式 */
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  /** 显示格式 */
  DISPLAY_DATE: 'yyyy年MM月dd日',
  DISPLAY_DATETIME: 'yyyy年MM月dd日 HH:mm:ss',
  DISPLAY_TIME: 'HH:mm:ss',
  DISPLAY_TIME_SHORT: 'HH:mm',
  /** 紧凑格式 */
  COMPACT_DATE: 'yyyyMMdd',
  COMPACT_DATETIME: 'yyyyMMddHHmmss',
  /** 文件名安全格式 */
  FILENAME_SAFE: 'yyyy-MM-dd_HH-mm-ss',
} as const;

/**
 * 时间间隔常量 (毫秒)
 */
export const TIME_INTERVALS = {
  /** 1秒 */
  SECOND: 1000,
  /** 1分钟 */
  MINUTE: 60 * 1000,
  /** 1小时 */
  HOUR: 60 * 60 * 1000,
  /** 1天 */
  DAY: 24 * 60 * 60 * 1000,
  /** 1周 */
  WEEK: 7 * 24 * 60 * 60 * 1000,
  /** 1个月 (30天) */
  MONTH: 30 * 24 * 60 * 60 * 1000,
  /** 1年 (365天) */
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const;

/**
 * 应用特定的时间配置
 */
export const APP_TIME_CONFIG = {
  /** 检查点间隔 (30秒) */
  CHECKPOINT_INTERVAL: 30 * 1000,
  /** 非活跃超时 (5分钟) */
  INACTIVITY_TIMEOUT: 5 * 60 * 1000,
  /** 焦点检测延迟 (1秒) */
  FOCUS_DETECTION_DELAY: 1 * 1000,
  /** 最大会话时长 (24小时) */
  MAX_SESSION_DURATION: 24 * 60 * 60 * 1000,
  /** 数据清理检查间隔 (1小时) */
  CLEANUP_CHECK_INTERVAL: 60 * 60 * 1000,
  /** 同步间隔 (5分钟) */
  SYNC_INTERVAL: 5 * 60 * 1000,
} as const;

/**
 * 数据保留策略时间配置
 */
export const RETENTION_PERIODS = {
  /** 立即删除 */
  IMMEDIATE: 0,
  /** 短期保留 (7天) */
  SHORT: 7 * TIME_INTERVALS.DAY,
  /** 长期保留 (90天) */
  LONG: 90 * TIME_INTERVALS.DAY,
  /** 永久保留 */
  PERMANENT: Number.MAX_SAFE_INTEGER,
  /** 默认自定义保留期 (30天) */
  DEFAULT_CUSTOM: 30 * TIME_INTERVALS.DAY,
  /** 最大自定义保留期 (10年) */
  MAX_CUSTOM: 10 * TIME_INTERVALS.YEAR,
} as const;

/**
 * 时区配置
 */
export const TIMEZONE_CONFIG = {
  /** 存储时区（始终使用UTC） */
  STORAGE: 'UTC',
  /** 默认显示时区 */
  DEFAULT_DISPLAY: 'Asia/Shanghai',
  /** 支持的显示时区列表 */
  SUPPORTED_DISPLAY: [
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Hong_Kong',
    'Asia/Singapore',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'UTC',
  ] as const,
  /** UTC时区标识 */
  UTC: 'UTC',
} as const;

/**
 * 日期验证规则
 */
export const DATE_VALIDATION = {
  /** 最小有效时间戳 (2000-01-01) */
  MIN_TIMESTAMP: new Date('2000-01-01').getTime(),
  /** 最大有效时间戳 (当前时间 + 1天) */
  MAX_TIMESTAMP_OFFSET: TIME_INTERVALS.DAY,
  /** 日期格式正则表达式 */
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  /** 日期时间格式正则表达式 */
  DATETIME_REGEX: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  /** ISO格式正则表达式 */
  ISO_REGEX: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/,
} as const;

/**
 * 时间显示配置
 */
export const TIME_DISPLAY = {
  /** 相对时间阈值 */
  RELATIVE_TIME_THRESHOLDS: {
    /** 显示"刚刚"的阈值 (1分钟) */
    JUST_NOW: TIME_INTERVALS.MINUTE,
    /** 显示分钟的阈值 (1小时) */
    MINUTES: TIME_INTERVALS.HOUR,
    /** 显示小时的阈值 (1天) */
    HOURS: TIME_INTERVALS.DAY,
    /** 显示天数的阈值 (1周) */
    DAYS: TIME_INTERVALS.WEEK,
    /** 显示周数的阈值 (1个月) */
    WEEKS: TIME_INTERVALS.MONTH,
  },
  /** 持续时间显示精度 */
  DURATION_PRECISION: {
    /** 秒级精度阈值 (1分钟) */
    SECONDS: TIME_INTERVALS.MINUTE,
    /** 分钟级精度阈值 (1小时) */
    MINUTES: TIME_INTERVALS.HOUR,
    /** 小时级精度阈值 (1天) */
    HOURS: TIME_INTERVALS.DAY,
  },
} as const;

/**
 * 性能相关时间配置
 */
export const PERFORMANCE_CONFIG = {
  /** 批量操作超时 (30秒) */
  BATCH_OPERATION_TIMEOUT: 30 * 1000,
  /** 数据库操作超时 (10秒) */
  DATABASE_OPERATION_TIMEOUT: 10 * 1000,
  /** 网络请求超时 (5秒) */
  NETWORK_REQUEST_TIMEOUT: 5 * 1000,
  /** 缓存过期时间 (1小时) */
  CACHE_EXPIRY: TIME_INTERVALS.HOUR,
  /** 防抖延迟 (300毫秒) */
  DEBOUNCE_DELAY: 300,
  /** 节流间隔 (100毫秒) */
  THROTTLE_INTERVAL: 100,
} as const;

/**
 * 错误重试配置
 */
export const RETRY_CONFIG = {
  /** 默认重试次数 */
  DEFAULT_ATTEMPTS: 3,
  /** 重试延迟 (1秒) */
  RETRY_DELAY: 1000,
  /** 最大重试延迟 (30秒) */
  MAX_RETRY_DELAY: 30 * 1000,
  /** 指数退避因子 */
  BACKOFF_FACTOR: 2,
} as const;

/**
 * 类型定义
 */
export type DateFormatKey = keyof typeof DATE_FORMATS;
export type TimeIntervalKey = keyof typeof TIME_INTERVALS;
export type SupportedTimezone = (typeof TIMEZONE_CONFIG.SUPPORTED)[number];
export type RetentionPeriodKey = keyof typeof RETENTION_PERIODS;
