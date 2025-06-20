/**
 * 时间处理工具
 * 提供时间格式化、计算、比较等通用功能
 *
 * 基于date-fns实现，支持：
 * - 时间戳与ISO字符串互转
 * - 多种格式化选项
 * - 日期验证和解析
 * - 时区处理
 * - 相对时间计算
 */

import {
  format,
  parseISO,
  isValid,
  formatISO,
  fromUnixTime,
  getUnixTime,
  formatDistanceToNow,
  isAfter,
  isBefore,
  isEqual,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  differenceInMilliseconds,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DATE_FORMATS, TIME_INTERVALS, DATE_VALIDATION, TIME_DISPLAY } from '../constants/time';

/**
 * 时间戳转换工具
 *
 * 重要说明：
 * - IndexedDB中存储的时间戳必须是UTC时间戳
 * - 所有转换操作都基于UTC时区进行
 * - 显示给用户时才根据用户时区进行本地化
 */
export class TimestampConverter {
  /**
   * 时间戳转ISO字符串（UTC时区）
   * @param timestamp 毫秒时间戳（UTC）
   * @returns ISO字符串（UTC时区，以Z结尾）
   */
  static toISO(timestamp: number): string {
    // 直接使用UTC时间戳创建Date对象，确保时区一致性
    const date = new Date(timestamp);
    return date.toISOString(); // 始终返回UTC格式的ISO字符串
  }

  /**
   * ISO字符串转时间戳（UTC时区）
   * @param isoString ISO字符串
   * @returns 毫秒时间戳（UTC）
   */
  static fromISO(isoString: string): number {
    const date = parseISO(isoString);
    if (!isValid(date)) {
      throw new Error(`Invalid ISO string: ${isoString}`);
    }
    // 返回UTC时间戳
    return date.getTime();
  }

  /**
   * 当前UTC时间戳
   * @returns 毫秒时间戳（UTC）
   */
  static now(): number {
    return Date.now(); // Date.now()始终返回UTC时间戳
  }

  /**
   * 时间戳转Date对象（UTC）
   * @param timestamp 毫秒时间戳（UTC）
   * @returns Date对象
   */
  static toDate(timestamp: number): Date {
    return new Date(timestamp);
  }

  /**
   * Date对象转UTC时间戳
   * @param date Date对象
   * @returns 毫秒时间戳（UTC）
   */
  static fromDate(date: Date): number {
    return date.getTime(); // getTime()始终返回UTC时间戳
  }

  /**
   * 验证时间戳是否为有效的UTC时间戳
   * @param timestamp 毫秒时间戳
   * @returns 是否为有效的UTC时间戳
   */
  static isValidUTCTimestamp(timestamp: number): boolean {
    if (!Number.isInteger(timestamp) || timestamp < 0) {
      return false;
    }

    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  /**
   * 创建UTC时间戳（从年月日时分秒）
   * @param year 年
   * @param month 月（1-12）
   * @param day 日
   * @param hour 时（可选，默认0）
   * @param minute 分（可选，默认0）
   * @param second 秒（可选，默认0）
   * @returns UTC时间戳
   */
  static createUTCTimestamp(
    year: number,
    month: number,
    day: number,
    hour: number = 0,
    minute: number = 0,
    second: number = 0
  ): number {
    // 使用Date.UTC确保创建UTC时间戳
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }
}

/**
 * 日期格式化工具
 *
 * 重要说明：
 * - 输入的时间戳必须是UTC时间戳
 * - 格式化时会根据系统本地时区进行显示
 * - 如需UTC时间显示，请使用formatTimestampUTC方法
 */
export class DateFormatter {
  /**
   * 格式化UTC时间戳为本地时区格式
   * @param timestamp 毫秒时间戳（UTC）
   * @param formatStr 格式字符串
   * @returns 格式化后的字符串（本地时区）
   */
  static formatTimestamp(
    timestamp: number,
    formatStr: string = DATE_FORMATS.STANDARD_DATETIME
  ): string {
    const date = TimestampConverter.toDate(timestamp);
    return format(date, formatStr, { locale: zhCN });
  }

  /**
   * 格式化UTC时间戳为UTC时区格式
   * @param timestamp 毫秒时间戳（UTC）
   * @param formatStr 格式字符串
   * @returns 格式化后的字符串（UTC时区）
   */
  static formatTimestampUTC(
    timestamp: number,
    formatStr: string = DATE_FORMATS.STANDARD_DATETIME
  ): string {
    const date = TimestampConverter.toDate(timestamp);
    // 使用UTC方法确保格式化为UTC时间
    const utcDate = new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    );
    return format(utcDate, formatStr, { locale: zhCN });
  }

  /**
   * 格式化为标准日期格式 (YYYY-MM-DD)
   * @param timestamp 毫秒时间戳
   * @returns YYYY-MM-DD格式字符串
   */
  static toStandardDate(timestamp: number): string {
    return DateFormatter.formatTimestamp(timestamp, DATE_FORMATS.STANDARD_DATE);
  }

  /**
   * 格式化为标准日期时间格式 (YYYY-MM-DD HH:mm:ss)
   * @param timestamp 毫秒时间戳
   * @returns YYYY-MM-DD HH:mm:ss格式字符串
   */
  static toStandardDateTime(timestamp: number): string {
    return DateFormatter.formatTimestamp(timestamp, DATE_FORMATS.STANDARD_DATETIME);
  }

  /**
   * 格式化为显示格式
   * @param timestamp 毫秒时间戳
   * @returns 中文显示格式字符串
   */
  static toDisplayDate(timestamp: number): string {
    return DateFormatter.formatTimestamp(timestamp, DATE_FORMATS.DISPLAY_DATE);
  }

  /**
   * 格式化为相对时间
   * @param timestamp 毫秒时间戳
   * @returns 相对时间字符串 (如: "2小时前")
   */
  static toRelativeTime(timestamp: number): string {
    const date = TimestampConverter.toDate(timestamp);
    return formatDistanceToNow(date, {
      addSuffix: true,
      locale: zhCN,
    });
  }
}

/**
 * 日期验证工具
 */
export class DateValidator {
  /**
   * 验证时间戳是否有效
   * @param timestamp 毫秒时间戳
   * @returns 是否有效
   * 修复：允许测试使用小时间戳，移除过于严格的范围限制
   */
  static isValidTimestamp(timestamp: number): boolean {
    return (
      Number.isInteger(timestamp) &&
      timestamp >= 0 && // 允许从Unix纪元开始的任何时间戳
      timestamp <= 4102444800000
    ); // 2099-12-31 23:59:59 UTC
  }

  /**
   * 验证ISO字符串是否有效
   * @param isoString ISO字符串
   * @returns 是否有效
   */
  static isValidISOString(isoString: string): boolean {
    try {
      const date = parseISO(isoString);
      return isValid(date);
    } catch {
      return false;
    }
  }

  /**
   * 验证日期格式 (YYYY-MM-DD)
   * @param dateString 日期字符串
   * @returns 是否有效
   */
  static isValidDateFormat(dateString: string): boolean {
    if (!DATE_VALIDATION.DATE_REGEX.test(dateString)) {
      return false;
    }

    try {
      const date = parseISO(dateString);
      return isValid(date) && format(date, DATE_FORMATS.STANDARD_DATE) === dateString;
    } catch {
      return false;
    }
  }

  /**
   * 验证时间范围是否有效
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @returns 验证结果
   */
  static validateTimeRange(
    startTime: number,
    endTime: number
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!DateValidator.isValidTimestamp(startTime)) {
      errors.push('Invalid start timestamp');
    }

    if (!DateValidator.isValidTimestamp(endTime)) {
      errors.push('Invalid end timestamp');
    }

    if (startTime >= endTime) {
      errors.push('Start time must be before end time');
    }

    if (endTime - startTime > TIME_INTERVALS.DAY) {
      errors.push('Time range cannot exceed 24 hours');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 日期计算工具
 */
export class DateCalculator {
  /**
   * 计算两个时间戳之间的差值
   * @param timestamp1 时间戳1
   * @param timestamp2 时间戳2
   * @returns 差值对象
   */
  static getDifference(timestamp1: number, timestamp2: number) {
    const date1 = TimestampConverter.toDate(timestamp1);
    const date2 = TimestampConverter.toDate(timestamp2);

    return {
      milliseconds: Math.abs(differenceInMilliseconds(date1, date2)),
      seconds: Math.abs(differenceInSeconds(date1, date2)),
      minutes: Math.abs(differenceInMinutes(date1, date2)),
      hours: Math.abs(differenceInHours(date1, date2)),
      days: Math.abs(differenceInDays(date1, date2)),
    };
  }

  /**
   * 添加天数
   * @param timestamp 时间戳
   * @param days 天数
   * @returns 新的时间戳
   */
  static addDays(timestamp: number, days: number): number {
    const date = TimestampConverter.toDate(timestamp);
    const newDate = addDays(date, days);
    return TimestampConverter.fromDate(newDate);
  }

  /**
   * 减去天数
   * @param timestamp 时间戳
   * @param days 天数
   * @returns 新的时间戳
   */
  static subtractDays(timestamp: number, days: number): number {
    const date = TimestampConverter.toDate(timestamp);
    const newDate = subDays(date, days);
    return TimestampConverter.fromDate(newDate);
  }

  /**
   * 获取一天的开始时间
   * @param timestamp 时间戳
   * @returns 当天开始时间戳
   */
  static getStartOfDay(timestamp: number): number {
    const date = TimestampConverter.toDate(timestamp);
    const startDate = startOfDay(date);
    return TimestampConverter.fromDate(startDate);
  }

  /**
   * 获取一天的结束时间
   * @param timestamp 时间戳
   * @returns 当天结束时间戳
   */
  static getEndOfDay(timestamp: number): number {
    const date = TimestampConverter.toDate(timestamp);
    const endDate = endOfDay(date);
    return TimestampConverter.fromDate(endDate);
  }

  /**
   * 比较两个时间戳
   * @param timestamp1 时间戳1
   * @param timestamp2 时间戳2
   * @returns 比较结果
   */
  static compare(
    timestamp1: number,
    timestamp2: number
  ): {
    isAfter: boolean;
    isBefore: boolean;
    isEqual: boolean;
  } {
    const date1 = TimestampConverter.toDate(timestamp1);
    const date2 = TimestampConverter.toDate(timestamp2);

    return {
      isAfter: isAfter(date1, date2),
      isBefore: isBefore(date1, date2),
      isEqual: isEqual(date1, date2),
    };
  }
}

/**
 * 时间持续时间格式化工具
 */
export class DurationFormatter {
  /**
   * 格式化毫秒为人类可读的时间
   * @param milliseconds 毫秒数
   * @returns 格式化后的字符串
   */
  static formatDuration(milliseconds: number): string {
    if (milliseconds < 0) {
      return '0秒';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      const remainingMinutes = minutes % 60;
      return `${days}天${remainingHours > 0 ? remainingHours + '小时' : ''}${remainingMinutes > 0 ? remainingMinutes + '分钟' : ''}`;
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      const remainingSeconds = seconds % 60;
      let result = `${hours}小时`;
      if (remainingMinutes > 0) {
        result += `${remainingMinutes}分钟`;
      }
      if (remainingSeconds > 0) {
        result += `${remainingSeconds}秒`;
      }
      return result;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}分钟${remainingSeconds > 0 ? remainingSeconds + '秒' : ''}`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * 格式化为简洁的时间格式 (HH:mm:ss)
   * @param milliseconds 毫秒数
   * @returns HH:mm:ss格式字符串
   */
  static formatToTimeString(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * 格式化为紧凑格式
   * @param milliseconds 毫秒数
   * @returns 紧凑格式字符串 (如: "2h 30m", "45s")
   */
  static formatCompact(milliseconds: number): string {
    if (milliseconds < 0) {
      return '0s';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * 便捷的时间工具函数
 */

/**
 * 获取当前时间戳
 * @returns 毫秒时间戳
 */
export const now = (): number => TimestampConverter.now();

/**
 * 时间戳转ISO字符串
 * @param timestamp 毫秒时间戳
 * @returns ISO字符串
 */
export const toISO = (timestamp: number): string => TimestampConverter.toISO(timestamp);

/**
 * ISO字符串转时间戳
 * @param isoString ISO字符串
 * @returns 毫秒时间戳
 */
export const fromISO = (isoString: string): number => TimestampConverter.fromISO(isoString);

/**
 * 格式化时间戳为标准日期格式
 * @param timestamp 毫秒时间戳
 * @returns YYYY-MM-DD格式字符串
 */
export const formatDate = (timestamp: number): string => DateFormatter.toStandardDate(timestamp);

/**
 * 格式化时间戳为标准日期时间格式
 * @param timestamp 毫秒时间戳
 * @returns YYYY-MM-DD HH:mm:ss格式字符串
 */
export const formatDateTime = (timestamp: number): string =>
  DateFormatter.toStandardDateTime(timestamp);

/**
 * 格式化持续时间
 * @param milliseconds 毫秒数
 * @returns 人类可读的时间字符串
 */
export const formatDuration = (milliseconds: number): string =>
  DurationFormatter.formatDuration(milliseconds);

/**
 * 验证时间戳是否有效
 * @param timestamp 毫秒时间戳
 * @returns 是否有效
 */
export const isValidTimestamp = (timestamp: number): boolean =>
  DateValidator.isValidTimestamp(timestamp);

/**
 * 验证日期格式是否有效
 * @param dateString 日期字符串
 * @returns 是否有效
 */
export const isValidDateFormat = (dateString: string): boolean =>
  DateValidator.isValidDateFormat(dateString);
