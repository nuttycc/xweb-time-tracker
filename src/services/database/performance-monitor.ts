/**
 * 数据库性能监控器
 * 监控数据库操作性能、存储使用情况和系统健康状态
 *
 * 功能特性：
 * - 操作性能监控和统计
 * - 存储配额监控和警告
 * - 系统健康状态检查
 * - 性能指标收集和分析
 */

/**
 * 操作类型枚举
 */
export enum OperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  QUERY = 'query',
  BATCH = 'batch',
  TRANSACTION = 'transaction',
}

/**
 * 性能指标接口
 */
export interface PerformanceMetric {
  operation: OperationType;
  duration: number;
  timestamp: number;
  recordCount?: number;
  success: boolean;
  error?: string;
}

/**
 * 操作类型统计接口
 */
export interface OperationTypeStats {
  count: number;
  averageDuration: number;
  successRate: number;
}

/**
 * 性能统计接口
 */
export interface PerformanceStats {
  totalOperations: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  successRate: number;
  operationsByType: Record<OperationType, OperationTypeStats>;
}

/**
 * 存储配额信息接口
 */
export interface StorageQuotaInfo {
  quota: number;
  usage: number;
  usagePercentage: number;
  available: number;
  isNearLimit: boolean;
  isExceeded: boolean;
}

/**
 * 系统健康状态接口
 */
export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
  lastCheck: number;
}

/**
 * 监控配置接口
 */
export interface MonitorConfig {
  /** 是否启用性能监控 */
  enablePerformanceMonitoring: boolean;
  /** 是否启用存储监控 */
  enableStorageMonitoring: boolean;
  /** 性能指标保留数量 */
  maxMetricsCount: number;
  /** 存储警告阈值（百分比） */
  storageWarningThreshold: number;
  /** 存储危险阈值（百分比） */
  storageCriticalThreshold: number;
  /** 健康检查间隔（毫秒） */
  healthCheckInterval: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MonitorConfig = {
  enablePerformanceMonitoring: true,
  enableStorageMonitoring: true,
  maxMetricsCount: 1000,
  storageWarningThreshold: 80,
  storageCriticalThreshold: 95,
  healthCheckInterval: 60000, // 1分钟
};

/**
 * 数据库性能监控器类
 */
export class DatabasePerformanceMonitor {
  private config: MonitorConfig;
  private metrics: PerformanceMetric[] = [];
  private healthCheckTimer: number | null = null;
  private lastHealthCheck: SystemHealth | null = null;

  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 开始监控操作
   */
  startOperation(operation: OperationType): (recordCount?: number, error?: Error) => void {
    if (!this.config.enablePerformanceMonitoring) {
      return () => {}; // 返回空函数
    }

    const startTime = performance.now();
    const timestamp = Date.now();

    return (recordCount?: number, error?: Error) => {
      const duration = performance.now() - startTime;

      const metric: PerformanceMetric = {
        operation,
        duration,
        timestamp,
        recordCount,
        success: !error,
        error: error?.message,
      };

      this.recordMetric(metric);
    };
  }

  /**
   * 记录性能指标
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // 限制指标数量
    if (this.metrics.length > this.config.maxMetricsCount) {
      this.metrics = this.metrics.slice(-Math.floor(this.config.maxMetricsCount * 0.8));
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(timeRange?: { start: number; end: number }): PerformanceStats {
    let filteredMetrics = this.metrics;

    if (timeRange) {
      filteredMetrics = this.metrics.filter(
        m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    if (filteredMetrics.length === 0) {
      return this.getEmptyStats();
    }

    const durations = filteredMetrics.map(m => m.duration).sort((a, b) => a - b);
    const successCount = filteredMetrics.filter(m => m.success).length;

    const stats: PerformanceStats = {
      totalOperations: filteredMetrics.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p50Duration: this.getPercentile(durations, 50),
      p95Duration: this.getPercentile(durations, 95),
      p99Duration: this.getPercentile(durations, 99),
      successRate: (successCount / filteredMetrics.length) * 100,
      operationsByType: {} as Record<OperationType, OperationTypeStats>,
    };

    // 按操作类型统计
    for (const operationType of Object.values(OperationType)) {
      const typeMetrics = filteredMetrics.filter(m => m.operation === operationType);

      if (typeMetrics.length > 0) {
        const typeDurations = typeMetrics.map(m => m.duration);
        const typeSuccessCount = typeMetrics.filter(m => m.success).length;

        stats.operationsByType[operationType] = {
          count: typeMetrics.length,
          averageDuration: typeDurations.reduce((sum, d) => sum + d, 0) / typeDurations.length,
          successRate: (typeSuccessCount / typeMetrics.length) * 100,
        };
      }
    }

    return stats;
  }

  /**
   * 获取存储配额信息
   */
  async getStorageQuotaInfo(): Promise<StorageQuotaInfo> {
    if (!this.config.enableStorageMonitoring) {
      return {
        quota: 0,
        usage: 0,
        usagePercentage: 0,
        available: 0,
        isNearLimit: false,
        isExceeded: false,
      };
    }

    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 0;
        const usage = estimate.usage || 0;
        const usagePercentage = quota > 0 ? (usage / quota) * 100 : 0;

        return {
          quota,
          usage,
          usagePercentage,
          available: quota - usage,
          isNearLimit: usagePercentage >= this.config.storageWarningThreshold,
          isExceeded: usagePercentage >= this.config.storageCriticalThreshold,
        };
      }
    } catch (error) {
      console.warn('Failed to get storage quota info:', error);
    }

    return {
      quota: 0,
      usage: 0,
      usagePercentage: 0,
      available: 0,
      isNearLimit: false,
      isExceeded: false,
    };
  }

  /**
   * 检查系统健康状态
   */
  async checkSystemHealth(): Promise<SystemHealth> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // 检查性能指标
    const perfStats = this.getPerformanceStats();
    if (perfStats.totalOperations > 0) {
      if (perfStats.successRate < 95) {
        issues.push(`操作成功率较低: ${perfStats.successRate.toFixed(1)}%`);
        recommendations.push('检查数据库连接和操作逻辑');
        score -= 20;
      }

      if (perfStats.p95Duration > 100) {
        issues.push(`P95响应时间过长: ${perfStats.p95Duration.toFixed(1)}ms`);
        recommendations.push('优化数据库查询和索引');
        score -= 15;
      }
    }

    // 检查存储配额
    const storageInfo = await this.getStorageQuotaInfo();
    if (storageInfo.isExceeded) {
      issues.push('存储配额已超限');
      recommendations.push('立即清理数据或增加存储配额');
      score -= 30;
    } else if (storageInfo.isNearLimit) {
      issues.push(`存储使用率过高: ${storageInfo.usagePercentage.toFixed(1)}%`);
      recommendations.push('清理旧数据或启用自动清理');
      score -= 10;
    }

    // 检查错误率
    const recentMetrics = this.metrics.slice(-100); // 最近100个操作
    if (recentMetrics.length > 0) {
      const recentErrorRate =
        (recentMetrics.filter(m => !m.success).length / recentMetrics.length) * 100;
      if (recentErrorRate > 10) {
        issues.push(`近期错误率过高: ${recentErrorRate.toFixed(1)}%`);
        recommendations.push('检查数据库状态和网络连接');
        score -= 25;
      }
    }

    const status = score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical';

    const health: SystemHealth = {
      status,
      score: Math.max(0, score),
      issues,
      recommendations,
      lastCheck: Date.now(),
    };

    this.lastHealthCheck = health;
    return health;
  }

  /**
   * 启动定期健康检查
   */
  startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, this.config.healthCheckInterval) as unknown as number;
  }

  /**
   * 停止定期健康检查
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 获取最后一次健康检查结果
   */
  getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * 清理性能指标
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * 获取百分位数
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * 获取空统计对象
   */
  private getEmptyStats(): PerformanceStats {
    return {
      totalOperations: 0,
      averageDuration: 0,
      p50Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
      successRate: 0,
      operationsByType: {} as Record<OperationType, OperationTypeStats>,
    };
  }
}

/**
 * 默认性能监控器实例
 */
export const dbPerformanceMonitor = new DatabasePerformanceMonitor();

/**
 * 性能监控装饰器
 * 为函数添加性能监控功能
 */
export function withPerformanceMonitoring<TArgs extends readonly unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  operation: OperationType
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const endOperation = dbPerformanceMonitor.startOperation(operation);

    try {
      const result = await fn(...args);
      endOperation();
      return result;
    } catch (error) {
      endOperation(undefined, error as Error);
      throw error;
    }
  };
}
