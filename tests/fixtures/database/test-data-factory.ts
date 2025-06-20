/**
 * 测试数据工厂
 * 提供标准化的测试数据生成和管理功能
 */

import type {
  EventsLogSchema,
  AggregatedStatsSchema,
  EventType,
} from '../../src/models/schemas/database-schema';

/**
 * 测试数据生成器配置
 */
export interface TestDataConfig {
  /** 基础时间戳 */
  baseTimestamp?: number;
  /** URL前缀 */
  urlPrefix?: string;
  /** 访问ID前缀 */
  visitIdPrefix?: string;
  /** 活动ID前缀 */
  activityIdPrefix?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<TestDataConfig> = {
  baseTimestamp: Date.now(),
  urlPrefix: 'https://test',
  visitIdPrefix: 'visit',
  activityIdPrefix: 'activity',
};

/**
 * 测试数据工厂类
 */
export class TestDataFactory {
  private config: Required<TestDataConfig>;
  private counter = 0;

  constructor(config: TestDataConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 生成单个事件记录
   */
  createEvent(overrides: Partial<Omit<EventsLogSchema, 'id'>> = {}): Omit<EventsLogSchema, 'id'> {
    this.counter++;

    return {
      timestamp: this.config.baseTimestamp + this.counter * 1000,
      eventType: 'open_time_start',
      tabId: this.counter,
      url: `${this.config.urlPrefix}${this.counter}.com`,
      visitId: `${this.config.visitIdPrefix}-${this.counter}`,
      activityId: `${this.config.activityIdPrefix}-${this.counter}`,
      isProcessed: 0,
      ...overrides,
    };
  }

  /**
   * 生成多个事件记录
   */
  createEvents(
    count: number,
    overrides: Partial<Omit<EventsLogSchema, 'id'>> = {}
  ): Array<Omit<EventsLogSchema, 'id'>> {
    return Array.from({ length: count }, () => this.createEvent(overrides));
  }

  /**
   * 生成事件序列（开始-结束对）
   */
  createEventSequence(
    visitId: string,
    activityId: string | null = null,
    url = 'https://example.com',
    tabId = 123
  ): Array<Omit<EventsLogSchema, 'id'>> {
    const baseTimestamp = this.config.baseTimestamp + this.counter * 10000;
    this.counter++;

    return [
      {
        timestamp: baseTimestamp,
        eventType: 'open_time_start',
        tabId,
        url,
        visitId,
        activityId,
        isProcessed: 0,
      },
      {
        timestamp: baseTimestamp + 5000,
        eventType: 'active_time_start',
        tabId,
        url,
        visitId,
        activityId,
        isProcessed: 0,
      },
      {
        timestamp: baseTimestamp + 8000,
        eventType: 'active_time_end',
        tabId,
        url,
        visitId,
        activityId,
        isProcessed: 0,
      },
      {
        timestamp: baseTimestamp + 10000,
        eventType: 'open_time_end',
        tabId,
        url,
        visitId,
        activityId,
        isProcessed: 0,
      },
    ];
  }

  /**
   * 生成单个聚合统计记录
   */
  createStats(overrides: Partial<AggregatedStatsSchema> = {}): AggregatedStatsSchema {
    this.counter++;

    const date = new Date(this.config.baseTimestamp + this.counter * 86400000)
      .toISOString()
      .split('T')[0];
    const url = `${this.config.urlPrefix}${this.counter}.com`;
    const hostname = `test${this.counter}.com`;

    return {
      key: `${date}:${url}`,
      date,
      url,
      hostname,
      parentDomain: hostname,
      total_open_time: this.counter * 1000,
      total_active_time: this.counter * 600,
      last_updated: this.config.baseTimestamp + this.counter * 1000,
      ...overrides,
    };
  }

  /**
   * 生成多个聚合统计记录
   */
  createStatsArray(
    count: number,
    overrides: Partial<AggregatedStatsSchema> = {}
  ): AggregatedStatsSchema[] {
    return Array.from({ length: count }, () => this.createStats(overrides));
  }

  /**
   * 生成特定日期范围的统计数据
   */
  createStatsForDateRange(
    startDate: string,
    endDate: string,
    url = 'https://example.com',
    hostname = 'example.com'
  ): AggregatedStatsSchema[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const stats: AggregatedStatsSchema[] = [];

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      this.counter++;

      stats.push({
        key: `${dateStr}:${url}`,
        date: dateStr,
        url,
        hostname,
        parentDomain: hostname,
        total_open_time: Math.random() * 10000 + 1000,
        total_active_time: Math.random() * 5000 + 500,
        last_updated: date.getTime(),
      });
    }

    return stats;
  }

  /**
   * 生成多域名的统计数据
   */
  createStatsForMultipleDomains(date: string, domains: string[]): AggregatedStatsSchema[] {
    return domains.map(domain => {
      this.counter++;
      const url = `https://${domain}`;

      return {
        key: `${date}:${url}`,
        date,
        url,
        hostname: domain,
        parentDomain: this.extractParentDomain(domain),
        total_open_time: Math.random() * 10000 + 1000,
        total_active_time: Math.random() * 5000 + 500,
        last_updated: this.config.baseTimestamp + this.counter * 1000,
      };
    });
  }

  /**
   * 生成性能测试数据
   */
  createPerformanceTestEvents(count: number): Array<Omit<EventsLogSchema, 'id'>> {
    const events: Array<Omit<EventsLogSchema, 'id'>> = [];
    const eventTypes: EventType[] = [
      'open_time_start',
      'open_time_end',
      'active_time_start',
      'active_time_end',
      'checkpoint',
    ];

    for (let i = 0; i < count; i++) {
      this.counter++;
      events.push({
        timestamp: this.config.baseTimestamp + i * 100,
        eventType: eventTypes[i % eventTypes.length],
        tabId: Math.floor(i / 10) + 1,
        url: `${this.config.urlPrefix}${(i % 50) + 1}.com`,
        visitId: `${this.config.visitIdPrefix}-${Math.floor(i / 5) + 1}`,
        activityId: i % 3 === 0 ? null : `${this.config.activityIdPrefix}-${Math.floor(i / 3) + 1}`,
        isProcessed: i % 4 === 0 ? 1 : 0,
      });
    }

    return events;
  }

  /**
   * 生成边界测试数据
   */
  createBoundaryTestData(): {
    validEvents: Array<Omit<EventsLogSchema, 'id'>>;
    invalidEvents: Array<Partial<Omit<EventsLogSchema, 'id'>>>;
    validStats: AggregatedStatsSchema[];
    invalidStats: Array<Partial<AggregatedStatsSchema>>;
  } {
    return {
      validEvents: [
        // 最小有效事件
        {
          timestamp: 1,
          eventType: 'checkpoint',
          tabId: 1,
          url: 'https://a.com',
          visitId: 'v',
          activityId: null,
          isProcessed: 0,
        },
        // 最大有效事件
        {
          timestamp: 4102444800000, // 2099-12-31 23:59:59 UTC
          eventType: 'open_time_start',
          tabId: 2147483647, // Chrome实际支持的最大tabId
          url: 'https://' + 'a'.repeat(100) + '.com',
          visitId: 'v'.repeat(50),
          activityId: 'a'.repeat(50),
          isProcessed: 1,
        },
      ],
      invalidEvents: [
        // 缺少必需字段
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          // 缺少其他必需字段
        },
        // 无效的URL
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: 123,
          url: 'invalid-url',
          visitId: 'visit-1',
          activityId: null,
          isProcessed: 0,
        },
        // 无效的tabId
        {
          timestamp: Date.now(),
          eventType: 'open_time_start',
          tabId: -2, // 使用-2，因为-1是Chrome允许的特殊值
          url: 'https://example.com',
          visitId: 'visit-1',
          activityId: null,
          isProcessed: 0,
        },
      ],
      validStats: [
        // 最小有效统计
        {
          key: '2024-01-01:https://a.com',
          date: '2024-01-01',
          url: 'https://a.com',
          hostname: 'a.com',
          parentDomain: 'a.com',
          total_open_time: 0,
          total_active_time: 0,
          last_updated: 1,
        },
      ],
      invalidStats: [
        // 无效的日期格式
        {
          key: '2024-01-01:https://example.com',
          date: '01/01/2024', // 错误格式
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: 1000,
          total_active_time: 500,
          last_updated: Date.now(),
        },
        // 负数时间
        {
          key: '2024-01-01:https://example.com',
          date: '2024-01-01',
          url: 'https://example.com',
          hostname: 'example.com',
          parentDomain: 'example.com',
          total_open_time: -1000,
          total_active_time: 500,
          last_updated: Date.now(),
        },
      ],
    };
  }

  /**
   * 重置计数器
   */
  reset(): void {
    this.counter = 0;
  }

  /**
   * 提取父域名
   */
  private extractParentDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length <= 2) {
      return hostname;
    }
    return parts.slice(-2).join('.');
  }
}

/**
 * 默认测试数据工厂实例
 */
export const testDataFactory = new TestDataFactory();
