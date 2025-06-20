/**
 * 性能监控器测试
 * 测试数据库性能监控、存储配额监控和系统健康检查
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DatabasePerformanceMonitor,
  OperationType,
  withPerformanceMonitoring,
} from '../../../src/services/database/performance-monitor';

describe('DatabasePerformanceMonitor', () => {
  let monitor: DatabasePerformanceMonitor;

  beforeEach(() => {
    monitor = new DatabasePerformanceMonitor({
      enablePerformanceMonitoring: true,
      enableStorageMonitoring: true,
      maxMetricsCount: 100,
      storageWarningThreshold: 80,
      storageCriticalThreshold: 95,
      healthCheckInterval: 1000,
    });
  });

  describe('性能监控', () => {
    it('应该能够监控操作性能', () => {
      const endOperation = monitor.startOperation(OperationType.CREATE);

      // 模拟一些处理时间
      setTimeout(() => {
        endOperation(1);
      }, 10);

      expect(endOperation).toBeTypeOf('function');
    });

    it('应该能够记录性能指标', () => {
      monitor.recordMetric({
        operation: OperationType.CREATE,
        duration: 50,
        timestamp: Date.now(),
        recordCount: 1,
        success: true,
      });

      const stats = monitor.getPerformanceStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.averageDuration).toBe(50);
      expect(stats.successRate).toBe(100);
    });

    it('应该能够计算性能统计', () => {
      const metrics = [
        { operation: OperationType.CREATE, duration: 10, timestamp: Date.now(), success: true },
        { operation: OperationType.CREATE, duration: 20, timestamp: Date.now(), success: true },
        { operation: OperationType.CREATE, duration: 30, timestamp: Date.now(), success: false },
        { operation: OperationType.READ, duration: 5, timestamp: Date.now(), success: true },
        { operation: OperationType.READ, duration: 15, timestamp: Date.now(), success: true },
      ];

      for (const metric of metrics) {
        monitor.recordMetric(metric);
      }

      const stats = monitor.getPerformanceStats();

      expect(stats.totalOperations).toBe(5);
      expect(stats.averageDuration).toBe(16); // (10+20+30+5+15)/5
      expect(stats.successRate).toBe(80); // 4/5 * 100
      expect(stats.operationsByType[OperationType.CREATE].count).toBe(3);
      expect(stats.operationsByType[OperationType.READ].count).toBe(2);
    });

    it('应该能够按时间范围过滤统计', () => {
      const now = Date.now();
      const metrics = [
        { operation: OperationType.CREATE, duration: 10, timestamp: now - 2000, success: true },
        { operation: OperationType.CREATE, duration: 20, timestamp: now - 1000, success: true },
        { operation: OperationType.CREATE, duration: 30, timestamp: now, success: true },
      ];

      for (const metric of metrics) {
        monitor.recordMetric(metric);
      }

      const stats = monitor.getPerformanceStats({
        start: now - 1500,
        end: now + 1000,
      });

      expect(stats.totalOperations).toBe(2); // 只包含后两个指标
    });

    it('应该能够计算百分位数', () => {
      const durations = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

      for (const duration of durations) {
        monitor.recordMetric({
          operation: OperationType.READ,
          duration,
          timestamp: Date.now(),
          success: true,
        });
      }

      const stats = monitor.getPerformanceStats();

      expect(stats.p50Duration).toBe(25); // 中位数
      expect(stats.p95Duration).toBeGreaterThan(40); // 95百分位
      expect(stats.p99Duration).toBeGreaterThan(45); // 99百分位
    });

    it('应该限制指标数量', () => {
      const smallMonitor = new DatabasePerformanceMonitor({
        maxMetricsCount: 5,
      });

      // 添加超过限制的指标
      for (let i = 0; i < 10; i++) {
        smallMonitor.recordMetric({
          operation: OperationType.CREATE,
          duration: i,
          timestamp: Date.now(),
          success: true,
        });
      }

      const stats = smallMonitor.getPerformanceStats();
      expect(stats.totalOperations).toBeLessThanOrEqual(5);
    });
  });

  describe('存储配额监控', () => {
    it('应该能够获取存储配额信息', async () => {
      // 模拟navigator.storage.estimate
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 1024 * 1024 * 1024, // 1GB
        usage: 512 * 1024 * 1024, // 512MB
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
      });

      const quotaInfo = await monitor.getStorageQuotaInfo();

      expect(quotaInfo.quota).toBe(1024 * 1024 * 1024);
      expect(quotaInfo.usage).toBe(512 * 1024 * 1024);
      expect(quotaInfo.usagePercentage).toBe(50);
      expect(quotaInfo.isNearLimit).toBe(false);
      expect(quotaInfo.isExceeded).toBe(false);
    });

    it('应该能够检测存储配额警告', async () => {
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 1000,
        usage: 850, // 85%
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
      });

      const quotaInfo = await monitor.getStorageQuotaInfo();

      expect(quotaInfo.usagePercentage).toBe(85);
      expect(quotaInfo.isNearLimit).toBe(true);
      expect(quotaInfo.isExceeded).toBe(false);
    });

    it('应该能够检测存储配额超限', async () => {
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 1000,
        usage: 970, // 97%
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
      });

      const quotaInfo = await monitor.getStorageQuotaInfo();

      expect(quotaInfo.usagePercentage).toBe(97);
      expect(quotaInfo.isNearLimit).toBe(true);
      expect(quotaInfo.isExceeded).toBe(true);
    });
  });

  describe('系统健康检查', () => {
    it('应该能够检查系统健康状态', async () => {
      // 添加一些正常的性能指标
      for (let i = 0; i < 10; i++) {
        monitor.recordMetric({
          operation: OperationType.READ,
          duration: 10 + i,
          timestamp: Date.now(),
          success: true,
        });
      }

      // 模拟正常的存储使用
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 1000,
        usage: 500, // 50%
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
      });

      const health = await monitor.checkSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(80);
      expect(health.issues).toHaveLength(0);
      expect(health.lastCheck).toBeTypeOf('number');
    });

    it('应该能够检测性能问题', async () => {
      // 创建一个自定义监控器
      const testMonitor = new DatabasePerformanceMonitor({
        enablePerformanceMonitoring: true,
        enableStorageMonitoring: false,
      });

      // 添加足够多的慢操作，确保P95超过阈值
      // 添加100个记录，其中前90个是50ms，后10个是150ms
      // 这样P95（第95个）应该是150ms
      for (let i = 0; i < 100; i++) {
        testMonitor.recordMetric({
          operation: OperationType.READ,
          duration: i < 90 ? 50 : 150,
          timestamp: Date.now(),
          success: true,
        });
      }

      // 验证P95确实超过了100ms
      const stats = testMonitor.getPerformanceStats();
      console.log('P95 Duration:', stats.p95Duration); // 调试输出

      // 验证P95确实超过了100ms，并且健康检查能检测到问题
      expect(stats.p95Duration).toBeGreaterThan(100);

      const health = await testMonitor.checkSystemHealth();

      // 虽然P95超过阈值，但分数只减少15分（100-15=85），仍然>=80，所以是healthy
      // 我们验证问题被正确检测到
      expect(health.score).toBe(85); // 100 - 15 = 85
      expect(health.status).toBe('healthy'); // 85 >= 80，所以还是healthy
      expect(health.issues.some(issue => issue.includes('P95响应时间过长'))).toBe(true);
    });

    it('应该能够检测错误率问题', async () => {
      // 添加一些失败的操作
      for (let i = 0; i < 10; i++) {
        monitor.recordMetric({
          operation: OperationType.CREATE,
          duration: 50,
          timestamp: Date.now(),
          success: i < 8, // 80%成功率
        });
      }

      const health = await monitor.checkSystemHealth();

      expect(health.status).not.toBe('healthy');
      expect(health.score).toBeLessThan(100);
      expect(health.issues.some(issue => issue.includes('操作成功率较低'))).toBe(true);
    });

    it('应该能够启动和停止健康检查', () => {
      monitor.startHealthCheck();
      expect(monitor.getLastHealthCheck()).toBeNull(); // 还没有执行过检查

      monitor.stopHealthCheck();
      // 验证定时器已停止（通过没有抛出错误来验证）
    });
  });

  describe('指标清理', () => {
    it('应该能够清理性能指标', () => {
      monitor.recordMetric({
        operation: OperationType.CREATE,
        duration: 50,
        timestamp: Date.now(),
        success: true,
      });

      expect(monitor.getPerformanceStats().totalOperations).toBe(1);

      monitor.clearMetrics();

      expect(monitor.getPerformanceStats().totalOperations).toBe(0);
    });
  });
});

describe('withPerformanceMonitoring装饰器', () => {
  it('应该能够监控函数性能', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    const monitoredFn = withPerformanceMonitoring(mockFn, OperationType.CREATE);

    const result = await monitoredFn('test');

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledWith('test');
  });

  it('应该能够监控失败的函数', async () => {
    const error = new Error('Test error');
    const mockFn = vi.fn().mockRejectedValue(error);
    const monitoredFn = withPerformanceMonitoring(mockFn, OperationType.CREATE);

    await expect(monitoredFn('test')).rejects.toThrow('Test error');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});
