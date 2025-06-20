/**
 * 数据库错误处理器
 * 提供统一的错误处理、分类和恢复机制
 *
 * 功能特性：
 * - 统一的错误类型定义和分类
 * - 错误恢复和重试策略
 * - 错误日志记录和上报
 * - 用户友好的错误消息
 */

import type { DatabaseError } from '../../models/schemas/database-schema';
import { DatabaseErrorCode } from '../../models/schemas/database-schema';

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 错误恢复策略
 */
export enum RecoveryStrategy {
  NONE = 'none',
  RETRY = 'retry',
  FALLBACK = 'fallback',
  RESET = 'reset',
}

/**
 * 错误处理配置
 */
export interface ErrorHandlerConfig {
  /** 是否启用错误日志 */
  enableLogging: boolean;
  /** 是否启用错误上报 */
  enableReporting: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 是否启用自动恢复 */
  enableAutoRecovery: boolean;
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  code: DatabaseErrorCode;
  message: string;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  userMessage: string;
  suggestions: string[];
}

/**
 * 错误统计接口
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByCode: Record<DatabaseErrorCode, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  lastError?: {
    code: DatabaseErrorCode;
    timestamp: number;
    message: string;
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  enableLogging: true,
  enableReporting: false,
  maxRetries: 3,
  retryDelay: 1000,
  enableAutoRecovery: true,
};

/**
 * 错误信息映射
 */
const ERROR_INFO_MAP: Record<DatabaseErrorCode, ErrorInfo> = {
  [DatabaseErrorCode.CONNECTION_FAILED]: {
    code: DatabaseErrorCode.CONNECTION_FAILED,
    message: 'Failed to connect to database',
    severity: ErrorSeverity.HIGH,
    recoveryStrategy: RecoveryStrategy.RETRY,
    userMessage: '数据库连接失败',
    suggestions: ['检查浏览器存储权限', '尝试刷新页面', '清理浏览器缓存'],
  },
  [DatabaseErrorCode.TRANSACTION_FAILED]: {
    code: DatabaseErrorCode.TRANSACTION_FAILED,
    message: 'Database transaction failed',
    severity: ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy.RETRY,
    userMessage: '数据操作失败',
    suggestions: ['重试操作', '检查数据格式', '确保数据库连接正常'],
  },
  [DatabaseErrorCode.QUOTA_EXCEEDED]: {
    code: DatabaseErrorCode.QUOTA_EXCEEDED,
    message: 'Storage quota exceeded',
    severity: ErrorSeverity.HIGH,
    recoveryStrategy: RecoveryStrategy.FALLBACK,
    userMessage: '存储空间不足',
    suggestions: ['清理旧数据', '增加存储配额', '启用自动清理'],
  },
  [DatabaseErrorCode.SCHEMA_ERROR]: {
    code: DatabaseErrorCode.SCHEMA_ERROR,
    message: 'Database schema error',
    severity: ErrorSeverity.CRITICAL,
    recoveryStrategy: RecoveryStrategy.RESET,
    userMessage: '数据库结构错误',
    suggestions: ['重置数据库', '更新应用版本', '联系技术支持'],
  },
  [DatabaseErrorCode.MIGRATION_FAILED]: {
    code: DatabaseErrorCode.MIGRATION_FAILED,
    message: 'Database migration failed',
    severity: ErrorSeverity.CRITICAL,
    recoveryStrategy: RecoveryStrategy.RESET,
    userMessage: '数据库升级失败',
    suggestions: ['备份数据后重置', '回滚到之前版本', '联系技术支持'],
  },
  [DatabaseErrorCode.OPERATION_FAILED]: {
    code: DatabaseErrorCode.OPERATION_FAILED,
    message: 'Database operation failed',
    severity: ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy.RETRY,
    userMessage: '操作执行失败',
    suggestions: ['重试操作', '检查输入数据', '确保数据库连接正常'],
  },
  [DatabaseErrorCode.VALIDATION_ERROR]: {
    code: DatabaseErrorCode.VALIDATION_ERROR,
    message: 'Data validation failed',
    severity: ErrorSeverity.LOW,
    recoveryStrategy: RecoveryStrategy.NONE,
    userMessage: '数据格式错误',
    suggestions: ['检查数据格式', '确保必填字段完整', '验证数据类型'],
  },
};

/**
 * 数据库错误处理器类
 */
export class DatabaseErrorHandler {
  private config: ErrorHandlerConfig;
  private errorStats: ErrorStats;
  private errorLog: Array<{ timestamp: number; error: DatabaseError }> = [];

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.errorStats = {
      totalErrors: 0,
      errorsByCode: {} as Record<DatabaseErrorCode, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
    };
  }

  /**
   * 处理数据库错误
   */
  async handleError(error: DatabaseError): Promise<void> {
    // 更新错误统计
    this.updateErrorStats(error);

    // 记录错误日志
    if (this.config.enableLogging) {
      this.logError(error);
    }

    // 上报错误（如果启用）
    if (this.config.enableReporting) {
      await this.reportError(error);
    }

    // 尝试自动恢复
    if (this.config.enableAutoRecovery) {
      await this.attemptRecovery(error);
    }
  }

  /**
   * 创建数据库错误
   */
  createError(
    code: DatabaseErrorCode,
    originalError?: Error,
    context?: Record<string, unknown>
  ): DatabaseError {
    const errorInfo = ERROR_INFO_MAP[code];

    if (!errorInfo) {
      // 如果找不到错误信息，创建一个默认错误
      const error = new Error(`Unknown database error: ${code}`) as DatabaseError;
      error.code = code;
      error.originalError = originalError;
      error.context = {
        ...context,
        timestamp: Date.now(),
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.NONE,
      };
      return error;
    }

    const error = new Error(errorInfo.message) as DatabaseError;

    error.code = code;
    error.originalError = originalError;
    error.context = {
      ...context,
      timestamp: Date.now(),
      severity: errorInfo.severity,
      recoveryStrategy: errorInfo.recoveryStrategy,
    };

    return error;
  }

  /**
   * 获取错误信息
   */
  getErrorInfo(code: DatabaseErrorCode): ErrorInfo {
    return ERROR_INFO_MAP[code];
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(error: DatabaseError): string {
    const errorInfo = ERROR_INFO_MAP[error.code];
    return errorInfo?.userMessage || '发生未知错误';
  }

  /**
   * 获取错误建议
   */
  getSuggestions(error: DatabaseError): string[] {
    const errorInfo = ERROR_INFO_MAP[error.code];
    return errorInfo?.suggestions || [];
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): ErrorStats {
    return { ...this.errorStats };
  }

  /**
   * 清理错误统计
   */
  clearErrorStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByCode: {} as Record<DatabaseErrorCode, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
    };
    this.errorLog = [];
  }

  /**
   * 获取错误日志
   */
  getErrorLog(limit?: number): Array<{ timestamp: number; error: DatabaseError }> {
    if (limit) {
      return this.errorLog.slice(-limit);
    }
    return [...this.errorLog];
  }

  /**
   * 更新错误统计
   */
  private updateErrorStats(error: DatabaseError): void {
    this.errorStats.totalErrors++;

    // 按错误代码统计
    if (!this.errorStats.errorsByCode[error.code]) {
      this.errorStats.errorsByCode[error.code] = 0;
    }
    this.errorStats.errorsByCode[error.code]++;

    // 按严重级别统计
    const errorInfo = ERROR_INFO_MAP[error.code];
    if (errorInfo) {
      if (!this.errorStats.errorsBySeverity[errorInfo.severity]) {
        this.errorStats.errorsBySeverity[errorInfo.severity] = 0;
      }
      this.errorStats.errorsBySeverity[errorInfo.severity]++;
    }

    // 记录最后一个错误
    this.errorStats.lastError = {
      code: error.code,
      timestamp: Date.now(),
      message: error.message,
    };
  }

  /**
   * 记录错误日志
   */
  private logError(error: DatabaseError): void {
    const logEntry = {
      timestamp: Date.now(),
      error: { ...error },
    };

    this.errorLog.push(logEntry);

    // 限制日志大小
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-500);
    }

    // 输出到控制台
    const errorInfo = ERROR_INFO_MAP[error.code];
    const severity = errorInfo?.severity || ErrorSeverity.MEDIUM;

    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error('Database Error:', error);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('Database Warning:', error);
        break;
      case ErrorSeverity.LOW:
        console.info('Database Info:', error);
        break;
    }
  }

  /**
   * 上报错误
   */
  private async reportError(error: DatabaseError): Promise<void> {
    try {
      // 这里可以实现错误上报逻辑
      // 例如发送到错误监控服务
      console.log('Reporting error:', error.code);
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  /**
   * 尝试自动恢复
   */
  private async attemptRecovery(error: DatabaseError): Promise<void> {
    const errorInfo = ERROR_INFO_MAP[error.code];
    if (!errorInfo) return;

    switch (errorInfo.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        // 重试逻辑将由调用方实现
        console.log(`Error ${error.code} suggests retry recovery`);
        break;

      case RecoveryStrategy.FALLBACK:
        // 降级处理
        console.log(`Error ${error.code} suggests fallback recovery`);
        break;

      case RecoveryStrategy.RESET:
        // 重置处理
        console.log(`Error ${error.code} suggests reset recovery`);
        break;

      case RecoveryStrategy.NONE:
      default:
        // 无需恢复
        break;
    }
  }
}

/**
 * 默认错误处理器实例
 */
export const dbErrorHandler = new DatabaseErrorHandler();

/**
 * 重试装饰器
 * 为函数添加自动重试功能
 */
export function withRetry<TArgs extends readonly unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  maxRetries: number = 3,
  delay: number = 1000
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        // 指数退避延迟
        const retryDelay = delay * 2 ** (attempt - 1);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    throw lastError!;
  };
}
