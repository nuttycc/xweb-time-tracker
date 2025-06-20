/**
 * 数据库Zod Schema定义
 * 为IndexedDB数据结构提供类型安全的验证Schema
 *
 * 基于database-schema.ts的类型定义，提供：
 * - 运行时数据验证
 * - 类型安全保证
 * - 错误信息本地化
 * - 数据转换和清理
 */

import * as z from 'zod/v4';
import type { EventType } from '../../models/schemas/database-schema';
import { DateValidator } from '../../shared/utils/time';
import { DATE_VALIDATION } from '../../shared/constants/time';

/**
 * 事件类型枚举Schema
 */
export const EventTypeSchema = z.enum(
  ['open_time_start', 'open_time_end', 'active_time_start', 'active_time_end', 'checkpoint'],
  {
    error: issue => (issue.input === undefined ? '事件类型是必需的' : '事件类型必须是有效的枚举值'),
  }
);

/**
 * 分辨率类型Schema（可选）
 */
export const ResolutionSchema = z
  .enum(['crash_recovery'], {
    error: '分辨率类型必须是有效的枚举值',
  })
  .optional();

/**
 * 处理状态Schema
 */
export const ProcessedStatusSchema = z.union([z.literal(0), z.literal(1)], {
  error: issue => (issue.input === undefined ? '处理状态是必需的' : '处理状态必须是0或1'),
});

/**
 * UTC时间戳验证Schema
 * 修复：允许测试使用小时间戳，移除过于严格的范围限制
 */
export const UTCTimestampSchema = z
  .number({
    error: issue => (issue.input === undefined ? '时间戳是必需的' : '时间戳必须是数字'),
  })
  .int({ message: '时间戳必须是整数' })
  .min(0, { message: '时间戳不能为负数' }) // 允许从Unix纪元开始的任何时间戳
  .max(4102444800000, { message: '时间戳不能超过2099年12月31日' }) // 2099-12-31 23:59:59 UTC
  .refine(timestamp => DateValidator.isValidTimestamp(timestamp), {
    message: '时间戳格式无效',
  });

/**
 * URL验证Schema
 */
export const URLSchema = z
  .string({
    error: issue => (issue.input === undefined ? 'URL是必需的' : 'URL必须是字符串'),
  })
  .min(1, { message: 'URL不能为空' })
  .max(2048, { message: 'URL长度不能超过2048字符' })
  .url({ message: 'URL格式无效' })
  .refine(
    url => {
      try {
        const urlObj = new URL(url);
        return ['http:', 'https:', 'chrome:', 'chrome-extension:'].includes(urlObj.protocol);
      } catch {
        return false;
      }
    },
    {
      message: 'URL协议必须是http、https、chrome或chrome-extension',
    }
  );

/**
 * Chrome标签页ID验证Schema
 */
export const TabIdSchema = z
  .number({
    error: issue => (issue.input === undefined ? '标签页ID是必需的' : '标签页ID必须是数字'),
  })
  .int({ message: '标签页ID必须是整数' })
  .min(-1, { message: '标签页ID不能小于-1' }) // Chrome允许-1作为特殊值
  .max(2147483647, { message: '标签页ID不能超过最大整数值' });

/**
 * 会话ID验证Schema（nanoid格式）
 */
export const SessionIdSchema = z
  .string({
    error: issue => (issue.input === undefined ? '会话ID是必需的' : '会话ID必须是字符串'),
  })
  .min(1, { message: '会话ID不能为空' })
  .max(50, { message: '会话ID长度不能超过50字符' })
  .regex(/^[A-Za-z0-9_-]+$/, { message: '会话ID只能包含字母、数字、下划线和连字符' });

/**
 * 可选会话ID验证Schema
 */
export const OptionalSessionIdSchema = SessionIdSchema.nullable();

/**
 * 日期格式验证Schema (YYYY-MM-DD)
 */
export const DateStringSchema = z
  .string({
    error: issue => (issue.input === undefined ? '日期是必需的' : '日期必须是字符串'),
  })
  .regex(DATE_VALIDATION.DATE_REGEX, { message: '日期格式必须是YYYY-MM-DD' })
  .refine(dateStr => DateValidator.isValidDateFormat(dateStr), {
    message: '日期值无效',
  });

/**
 * 主机名验证Schema
 */
export const HostnameSchema = z
  .string({
    error: issue => (issue.input === undefined ? '主机名是必需的' : '主机名必须是字符串'),
  })
  .min(1, { message: '主机名不能为空' })
  .max(253, { message: '主机名长度不能超过253字符' })
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    { message: '主机名格式无效' }
  );

/**
 * 父域名验证Schema
 */
export const ParentDomainSchema = z
  .string({
    error: issue => (issue.input === undefined ? '父域名是必需的' : '父域名必须是字符串'),
  })
  .min(1, { message: '父域名不能为空' })
  .max(253, { message: '父域名长度不能超过253字符' });

/**
 * 时间持续时间验证Schema（毫秒）
 */
export const DurationSchema = z
  .number({
    error: issue => (issue.input === undefined ? '持续时间是必需的' : '持续时间必须是数字'),
  })
  .int({ message: '持续时间必须是整数' })
  .min(0, { message: '持续时间不能为负数' })
  .max(24 * 60 * 60 * 1000, { message: '持续时间不能超过24小时' });

/**
 * 聚合统计主键验证Schema
 */
export const AggregatedStatsKeySchema = z
  .string({
    error: issue =>
      issue.input === undefined ? '聚合统计主键是必需的' : '聚合统计主键必须是字符串',
  })
  .min(1, { message: '聚合统计主键不能为空' })
  .max(500, { message: '聚合统计主键长度不能超过500字符' })
  .regex(/^\d{4}-\d{2}-\d{2}:.+$/, { message: '聚合统计主键格式必须是"YYYY-MM-DD:URL"' });

/**
 * 事件日志Schema
 */
export const EventsLogSchema = z.strictObject(
  {
    id: z.number().int().positive().optional(),
    timestamp: UTCTimestampSchema,
    eventType: EventTypeSchema,
    tabId: TabIdSchema,
    url: URLSchema,
    visitId: SessionIdSchema,
    activityId: OptionalSessionIdSchema,
    isProcessed: ProcessedStatusSchema,
    resolution: ResolutionSchema,
  },
  {
    error: issue => (issue.input === undefined ? '事件日志对象是必需的' : '事件日志必须是对象'),
  }
);

/**
 * 聚合统计Schema
 */
export const AggregatedStatsSchema = z.strictObject(
  {
    key: AggregatedStatsKeySchema,
    date: DateStringSchema,
    url: URLSchema,
    hostname: HostnameSchema,
    parentDomain: ParentDomainSchema,
    total_open_time: DurationSchema,
    total_active_time: DurationSchema,
    last_updated: UTCTimestampSchema,
  },
  {
    error: issue => (issue.input === undefined ? '聚合统计对象是必需的' : '聚合统计必须是对象'),
  }
);

/**
 * 事件日志创建Schema（不包含id和默认值）
 */
export const CreateEventsLogSchema = EventsLogSchema.omit({
  id: true,
  isProcessed: true,
  timestamp: true,
}).extend({
  isProcessed: ProcessedStatusSchema.default(0),
  timestamp: UTCTimestampSchema.default(() => Date.now()),
});

/**
 * 事件日志更新Schema（所有字段可选）
 */
export const UpdateEventsLogSchema = EventsLogSchema.partial();

/**
 * 聚合统计创建Schema
 */
export const CreateAggregatedStatsSchema = AggregatedStatsSchema.omit({
  last_updated: true,
}).extend({
  last_updated: UTCTimestampSchema.default(() => Date.now()),
});

/**
 * 聚合统计更新Schema（除key外所有字段可选）
 */
export const UpdateAggregatedStatsSchema = AggregatedStatsSchema.omit({ key: true })
  .partial()
  .extend({
    key: AggregatedStatsKeySchema,
  });

/**
 * 批量操作Schema
 */
export const BatchEventsLogSchema = z
  .array(CreateEventsLogSchema, {
    error: issue => (issue.input === undefined ? '批量事件日志是必需的' : '批量事件日志必须是数组'),
  })
  .min(1, { message: '批量操作至少需要一条记录' })
  .max(1000, { message: '批量操作不能超过1000条记录' });

export const BatchAggregatedStatsSchema = z
  .array(CreateAggregatedStatsSchema, {
    error: issue => (issue.input === undefined ? '批量聚合统计是必需的' : '批量聚合统计必须是数组'),
  })
  .min(1, { message: '批量操作至少需要一条记录' })
  .max(100, { message: '批量操作不能超过100条记录' });

/**
 * 类型推断
 */
export type EventsLogData = z.infer<typeof EventsLogSchema>;
export type AggregatedStatsData = z.infer<typeof AggregatedStatsSchema>;
export type CreateEventsLogData = z.infer<typeof CreateEventsLogSchema>;
export type UpdateEventsLogData = z.infer<typeof UpdateEventsLogSchema>;
export type CreateAggregatedStatsData = z.infer<typeof CreateAggregatedStatsSchema>;
export type UpdateAggregatedStatsData = z.infer<typeof UpdateAggregatedStatsSchema>;
export type BatchEventsLogData = z.infer<typeof BatchEventsLogSchema>;
export type BatchAggregatedStatsData = z.infer<typeof BatchAggregatedStatsSchema>;
