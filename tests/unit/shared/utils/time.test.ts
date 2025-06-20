/**
 * 时间处理工具单元测试
 * 测试时间转换、格式化、验证等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TimestampConverter,
  DateFormatter,
  DateValidator,
  DateCalculator,
  DurationFormatter,
  now,
  toISO,
  fromISO,
  formatDate,
  formatDateTime,
  formatDuration,
  isValidTimestamp,
  isValidDateFormat,
} from '../../../../src/shared/utils/time';
import { DATE_FORMATS } from '../../../../src/shared/constants/time';

describe('TimestampConverter', () => {
  const testTimestamp = 1640995200000; // 2022-01-01 00:00:00 UTC
  const testISOString = '2022-01-01T00:00:00.000Z';

  describe('toISO', () => {
    it('应该将UTC时间戳转换为UTC ISO字符串', () => {
      const result = TimestampConverter.toISO(testTimestamp);
      expect(result).toBe(testISOString);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('应该处理毫秒时间戳并保持UTC时区', () => {
      const timestampWithMs = 1640995200123;
      const result = TimestampConverter.toISO(timestampWithMs);
      expect(result).toBe('2022-01-01T00:00:00.123Z');
      expect(result.endsWith('Z')).toBe(true); // 确保是UTC时区
    });

    it('应该确保输出始终是UTC时区', () => {
      const result = TimestampConverter.toISO(testTimestamp);
      expect(result.endsWith('Z')).toBe(true);
    });
  });

  describe('fromISO', () => {
    it('应该将ISO字符串转换为时间戳', () => {
      const result = TimestampConverter.fromISO(testISOString);
      expect(result).toBe(testTimestamp);
    });

    it('应该抛出错误当ISO字符串无效时', () => {
      expect(() => TimestampConverter.fromISO('invalid-iso')).toThrow('Invalid ISO string');
    });

    it('应该处理不同的ISO格式', () => {
      const isoWithoutMs = '2022-01-01T00:00:00Z';
      const result = TimestampConverter.fromISO(isoWithoutMs);
      expect(result).toBe(testTimestamp);
    });
  });

  describe('now', () => {
    it('应该返回当前时间戳', () => {
      const mockNow = 1640995200000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = TimestampConverter.now();
      expect(result).toBe(mockNow);

      vi.restoreAllMocks();
    });
  });

  describe('toDate和fromDate', () => {
    it('应该正确转换UTC时间戳和Date对象', () => {
      const date = TimestampConverter.toDate(testTimestamp);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(testTimestamp);

      const backToTimestamp = TimestampConverter.fromDate(date);
      expect(backToTimestamp).toBe(testTimestamp);
    });
  });

  describe('isValidUTCTimestamp', () => {
    it('应该验证有效的UTC时间戳', () => {
      expect(TimestampConverter.isValidUTCTimestamp(testTimestamp)).toBe(true);
      expect(TimestampConverter.isValidUTCTimestamp(Date.now())).toBe(true);
    });

    it('应该拒绝无效的时间戳', () => {
      expect(TimestampConverter.isValidUTCTimestamp(-1)).toBe(false);
      expect(TimestampConverter.isValidUTCTimestamp(1.5)).toBe(false);
      expect(TimestampConverter.isValidUTCTimestamp(NaN)).toBe(false);
      expect(TimestampConverter.isValidUTCTimestamp(Infinity)).toBe(false);
    });
  });

  describe('createUTCTimestamp', () => {
    it('应该创建正确的UTC时间戳', () => {
      const utcTimestamp = TimestampConverter.createUTCTimestamp(2022, 1, 1, 0, 0, 0);
      expect(utcTimestamp).toBe(testTimestamp);

      // 验证创建的时间戳确实是UTC
      const isoString = TimestampConverter.toISO(utcTimestamp);
      expect(isoString).toBe('2022-01-01T00:00:00.000Z');
    });

    it('应该处理默认参数', () => {
      const utcTimestamp = TimestampConverter.createUTCTimestamp(2022, 1, 1);
      expect(utcTimestamp).toBe(testTimestamp);
    });
  });
});

describe('DateFormatter', () => {
  const testTimestamp = 1640995200000; // 2022-01-01 00:00:00 UTC

  describe('formatTimestamp', () => {
    it('应该使用默认格式格式化时间戳', () => {
      const result = DateFormatter.formatTimestamp(testTimestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('应该使用指定格式格式化时间戳', () => {
      const result = DateFormatter.formatTimestamp(testTimestamp, DATE_FORMATS.STANDARD_DATE);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('toStandardDate', () => {
    it('应该格式化为YYYY-MM-DD格式', () => {
      const result = DateFormatter.toStandardDate(testTimestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('toStandardDateTime', () => {
    it('应该格式化为YYYY-MM-DD HH:mm:ss格式', () => {
      const result = DateFormatter.toStandardDateTime(testTimestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('toDisplayDate', () => {
    it('应该格式化为中文显示格式', () => {
      const result = DateFormatter.toDisplayDate(testTimestamp);
      expect(result).toMatch(/^\d{4}年\d{2}月\d{2}日$/);
    });
  });

  describe('toRelativeTime', () => {
    it('应该返回相对时间字符串', () => {
      const pastTimestamp = Date.now() - 3600000; // 1小时前
      const result = DateFormatter.toRelativeTime(pastTimestamp);
      expect(result).toContain('前');
    });
  });

  describe('formatTimestampUTC', () => {
    it('应该格式化为UTC时区格式', () => {
      const result = DateFormatter.formatTimestampUTC(testTimestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('应该与本地时区格式化结果可能不同', () => {
      const localResult = DateFormatter.formatTimestamp(testTimestamp);
      const utcResult = DateFormatter.formatTimestampUTC(testTimestamp);

      // 在非UTC时区环境下，两个结果可能不同
      // 但都应该是有效的时间格式
      expect(localResult).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(utcResult).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });
});

describe('DateValidator', () => {
  describe('isValidTimestamp', () => {
    it('应该验证有效的时间戳', () => {
      const validTimestamp = Date.now();
      expect(DateValidator.isValidTimestamp(validTimestamp)).toBe(true);
    });

    it('应该拒绝无效的时间戳', () => {
      expect(DateValidator.isValidTimestamp(-1)).toBe(false);
      expect(DateValidator.isValidTimestamp(1.5)).toBe(false);
      expect(DateValidator.isValidTimestamp(4102444800001)).toBe(false); // 超过2099年的时间戳
    });
  });

  describe('isValidISOString', () => {
    it('应该验证有效的ISO字符串', () => {
      expect(DateValidator.isValidISOString('2022-01-01T00:00:00.000Z')).toBe(true);
      expect(DateValidator.isValidISOString('2022-01-01T00:00:00Z')).toBe(true);
    });

    it('应该拒绝无效的ISO字符串', () => {
      expect(DateValidator.isValidISOString('invalid')).toBe(false);
      expect(DateValidator.isValidISOString('2022-13-01T00:00:00Z')).toBe(false);
    });
  });

  describe('isValidDateFormat', () => {
    it('应该验证有效的日期格式', () => {
      expect(DateValidator.isValidDateFormat('2022-01-01')).toBe(true);
      expect(DateValidator.isValidDateFormat('2022-12-31')).toBe(true);
    });

    it('应该拒绝无效的日期格式', () => {
      expect(DateValidator.isValidDateFormat('2022-1-1')).toBe(false);
      expect(DateValidator.isValidDateFormat('01/01/2022')).toBe(false);
      expect(DateValidator.isValidDateFormat('2022-13-01')).toBe(false);
      expect(DateValidator.isValidDateFormat('invalid')).toBe(false);
    });
  });

  describe('validateTimeRange', () => {
    it('应该验证有效的时间范围', () => {
      const start = Date.now();
      const end = start + 3600000; // 1小时后
      const result = DateValidator.validateTimeRange(start, end);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该拒绝无效的时间范围', () => {
      const start = Date.now();
      const end = start - 3600000; // 1小时前
      const result = DateValidator.validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start time must be before end time');
    });

    it('应该拒绝超过24小时的时间范围', () => {
      const start = Date.now();
      const end = start + 25 * 60 * 60 * 1000; // 25小时后
      const result = DateValidator.validateTimeRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Time range cannot exceed 24 hours');
    });
  });
});

describe('DateCalculator', () => {
  const baseTimestamp = 1640995200000; // 2022-01-01 00:00:00 UTC

  describe('getDifference', () => {
    it('应该计算两个时间戳的差值', () => {
      const timestamp1 = baseTimestamp;
      const timestamp2 = baseTimestamp + 3661000; // 1小时1分1秒后
      const result = DateCalculator.getDifference(timestamp1, timestamp2);

      expect(result.milliseconds).toBe(3661000);
      expect(result.seconds).toBe(3661);
      expect(result.minutes).toBe(61);
      expect(result.hours).toBe(1);
      expect(result.days).toBe(0);
    });
  });

  describe('addDays和subtractDays', () => {
    it('应该正确添加和减去天数', () => {
      const added = DateCalculator.addDays(baseTimestamp, 5);
      const subtracted = DateCalculator.subtractDays(baseTimestamp, 3);

      expect(added).toBeGreaterThan(baseTimestamp);
      expect(subtracted).toBeLessThan(baseTimestamp);
    });
  });

  describe('getStartOfDay和getEndOfDay', () => {
    it('应该获取一天的开始和结束时间', () => {
      const start = DateCalculator.getStartOfDay(baseTimestamp);
      const end = DateCalculator.getEndOfDay(baseTimestamp);

      expect(start).toBeLessThanOrEqual(baseTimestamp);
      expect(end).toBeGreaterThanOrEqual(baseTimestamp);
      expect(end - start).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe('compare', () => {
    it('应该正确比较两个时间戳', () => {
      const earlier = baseTimestamp;
      const later = baseTimestamp + 1000;

      const result1 = DateCalculator.compare(later, earlier);
      expect(result1.isAfter).toBe(true);
      expect(result1.isBefore).toBe(false);
      expect(result1.isEqual).toBe(false);

      const result2 = DateCalculator.compare(earlier, later);
      expect(result2.isAfter).toBe(false);
      expect(result2.isBefore).toBe(true);
      expect(result2.isEqual).toBe(false);

      const result3 = DateCalculator.compare(earlier, earlier);
      expect(result3.isAfter).toBe(false);
      expect(result3.isBefore).toBe(false);
      expect(result3.isEqual).toBe(true);
    });
  });
});

describe('DurationFormatter', () => {
  describe('formatDuration', () => {
    it('应该格式化秒级持续时间', () => {
      expect(DurationFormatter.formatDuration(5000)).toBe('5秒');
      expect(DurationFormatter.formatDuration(0)).toBe('0秒');
    });

    it('应该格式化分钟级持续时间', () => {
      expect(DurationFormatter.formatDuration(65000)).toBe('1分钟5秒');
      expect(DurationFormatter.formatDuration(60000)).toBe('1分钟');
    });

    it('应该格式化小时级持续时间', () => {
      expect(DurationFormatter.formatDuration(3661000)).toBe('1小时1分钟1秒');
      expect(DurationFormatter.formatDuration(3600000)).toBe('1小时');
    });

    it('应该格式化天级持续时间', () => {
      expect(DurationFormatter.formatDuration(90061000)).toBe('1天1小时1分钟');
      expect(DurationFormatter.formatDuration(86400000)).toBe('1天');
    });

    it('应该处理负数', () => {
      expect(DurationFormatter.formatDuration(-1000)).toBe('0秒');
    });
  });

  describe('formatToTimeString', () => {
    it('应该格式化为HH:mm:ss格式', () => {
      expect(DurationFormatter.formatToTimeString(3661000)).toBe('01:01:01');
      expect(DurationFormatter.formatToTimeString(0)).toBe('00:00:00');
      expect(DurationFormatter.formatToTimeString(86400000)).toBe('24:00:00');
    });
  });

  describe('formatCompact', () => {
    it('应该格式化为紧凑格式', () => {
      expect(DurationFormatter.formatCompact(5000)).toBe('5s');
      expect(DurationFormatter.formatCompact(65000)).toBe('1m 5s');
      expect(DurationFormatter.formatCompact(3661000)).toBe('1h 1m');
      expect(DurationFormatter.formatCompact(90061000)).toBe('1d 1h');
    });
  });
});

describe('便捷函数', () => {
  it('now应该返回当前时间戳', () => {
    const mockNow = 1640995200000;
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);

    expect(now()).toBe(mockNow);

    vi.restoreAllMocks();
  });

  it('toISO和fromISO应该正确转换', () => {
    const timestamp = 1640995200000;
    const iso = toISO(timestamp);
    const backToTimestamp = fromISO(iso);

    expect(backToTimestamp).toBe(timestamp);
  });

  it('formatDate和formatDateTime应该正确格式化', () => {
    const timestamp = 1640995200000;

    expect(formatDate(timestamp)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDateTime(timestamp)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('formatDuration应该正确格式化持续时间', () => {
    expect(formatDuration(5000)).toBe('5秒');
  });

  it('isValidTimestamp应该正确验证时间戳', () => {
    expect(isValidTimestamp(Date.now())).toBe(true);
    expect(isValidTimestamp(-1)).toBe(false);
  });

  it('isValidDateFormat应该正确验证日期格式', () => {
    expect(isValidDateFormat('2022-01-01')).toBe(true);
    expect(isValidDateFormat('invalid')).toBe(false);
  });
});
