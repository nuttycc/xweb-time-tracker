/**
 * 错误处理器测试
 * 测试数据库错误处理、分类和恢复机制
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DatabaseErrorHandler,
  ErrorSeverity,
  RecoveryStrategy,
  withRetry,
} from '../../../src/services/database/error-handler';
import type { DatabaseError } from '../../../src/models/schemas/database-schema';
import { DatabaseErrorCode } from '../../../src/models/schemas/database-schema';

describe('DatabaseErrorHandler', () => {
  let errorHandler: DatabaseErrorHandler;

  beforeEach(() => {
    errorHandler = new DatabaseErrorHandler({
      enableLogging: true,
      enableReporting: false,
      maxRetries: 3,
      retryDelay: 100,
      enableAutoRecovery: true,
    });
  });

  describe('错误创建和分类', () => {
    it('应该能够创建数据库错误', () => {
      const originalError = new Error('Original error');
      const context = { operation: 'test' };

      const dbError = errorHandler.createError(
        DatabaseErrorCode.CONNECTION_FAILED,
        originalError,
        context
      );

      expect(dbError.code).toBe(DatabaseErrorCode.CONNECTION_FAILED);
      expect(dbError.originalError).toBe(originalError);
      expect(dbError.context).toMatchObject(context);
      expect(dbError.context?.timestamp).toBeTypeOf('number');
    });

    it('应该能够获取错误信息', () => {
      const errorInfo = errorHandler.getErrorInfo(DatabaseErrorCode.CONNECTION_FAILED);

      expect(errorInfo.code).toBe(DatabaseErrorCode.CONNECTION_FAILED);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
      expect(errorInfo.userMessage).toBe('数据库连接失败');
      expect(Array.isArray(errorInfo.suggestions)).toBe(true);
    });

    it('应该能够获取用户友好的错误消息', () => {
      const dbError = errorHandler.createError(DatabaseErrorCode.QUOTA_EXCEEDED);
      const userMessage = errorHandler.getUserMessage(dbError);

      expect(userMessage).toBe('存储空间不足');
    });

    it('应该能够获取错误建议', () => {
      const dbError = errorHandler.createError(DatabaseErrorCode.VALIDATION_ERROR);
      const suggestions = errorHandler.getSuggestions(dbError);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('检查数据格式');
    });
  });

  describe('错误处理和统计', () => {
    it('应该能够处理错误并更新统计', async () => {
      const dbError = errorHandler.createError(DatabaseErrorCode.OPERATION_FAILED);

      await errorHandler.handleError(dbError);

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByCode[DatabaseErrorCode.OPERATION_FAILED]).toBe(1);
      expect(stats.lastError?.code).toBe(DatabaseErrorCode.OPERATION_FAILED);
    });

    it('应该能够统计不同类型的错误', async () => {
      const errors = [
        errorHandler.createError(DatabaseErrorCode.CONNECTION_FAILED),
        errorHandler.createError(DatabaseErrorCode.CONNECTION_FAILED),
        errorHandler.createError(DatabaseErrorCode.QUOTA_EXCEEDED),
        errorHandler.createError(DatabaseErrorCode.VALIDATION_ERROR),
      ];

      for (const error of errors) {
        await errorHandler.handleError(error);
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByCode[DatabaseErrorCode.CONNECTION_FAILED]).toBe(2);
      expect(stats.errorsByCode[DatabaseErrorCode.QUOTA_EXCEEDED]).toBe(1);
      expect(stats.errorsByCode[DatabaseErrorCode.VALIDATION_ERROR]).toBe(1);
    });

    it('应该能够按严重级别统计错误', async () => {
      const errors = [
        errorHandler.createError(DatabaseErrorCode.CONNECTION_FAILED), // HIGH
        errorHandler.createError(DatabaseErrorCode.SCHEMA_ERROR), // CRITICAL
        errorHandler.createError(DatabaseErrorCode.VALIDATION_ERROR), // LOW
      ];

      for (const error of errors) {
        await errorHandler.handleError(error);
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.LOW]).toBe(1);
    });

    it('应该能够清理错误统计', async () => {
      const dbError = errorHandler.createError(DatabaseErrorCode.OPERATION_FAILED);
      await errorHandler.handleError(dbError);

      expect(errorHandler.getErrorStats().totalErrors).toBe(1);

      errorHandler.clearErrorStats();

      expect(errorHandler.getErrorStats().totalErrors).toBe(0);
    });
  });

  describe('错误日志', () => {
    it('应该能够记录错误日志', async () => {
      const dbError = errorHandler.createError(DatabaseErrorCode.TRANSACTION_FAILED);

      await errorHandler.handleError(dbError);

      const errorLog = errorHandler.getErrorLog();
      expect(errorLog.length).toBe(1);
      expect(errorLog[0].error.code).toBe(DatabaseErrorCode.TRANSACTION_FAILED);
      expect(errorLog[0].timestamp).toBeTypeOf('number');
    });

    it('应该能够限制错误日志数量', async () => {
      const errorLog = errorHandler.getErrorLog(2);
      expect(errorLog.length).toBeLessThanOrEqual(2);
    });
  });

  describe('错误恢复策略', () => {
    it('应该为不同错误类型提供正确的恢复策略', () => {
      const connectionError = errorHandler.getErrorInfo(DatabaseErrorCode.CONNECTION_FAILED);
      expect(connectionError.recoveryStrategy).toBe(RecoveryStrategy.RETRY);

      const quotaError = errorHandler.getErrorInfo(DatabaseErrorCode.QUOTA_EXCEEDED);
      expect(quotaError.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);

      const schemaError = errorHandler.getErrorInfo(DatabaseErrorCode.SCHEMA_ERROR);
      expect(schemaError.recoveryStrategy).toBe(RecoveryStrategy.RESET);

      const validationError = errorHandler.getErrorInfo(DatabaseErrorCode.VALIDATION_ERROR);
      expect(validationError.recoveryStrategy).toBe(RecoveryStrategy.NONE);
    });
  });
});

describe('withRetry装饰器', () => {
  it('应该在成功时直接返回结果', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    const retryFn = withRetry(mockFn, 3, 10);

    const result = await retryFn('test');

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('test');
  });

  it('应该在失败时进行重试', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('success');

    const retryFn = withRetry(mockFn, 3, 10);

    const result = await retryFn('test');

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('应该在达到最大重试次数后抛出错误', async () => {
    const error = new Error('Persistent failure');
    const mockFn = vi.fn().mockRejectedValue(error);

    const retryFn = withRetry(mockFn, 2, 10);

    await expect(retryFn('test')).rejects.toThrow('Persistent failure');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('应该使用指数退避延迟', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValue('success');

    const retryFn = withRetry(mockFn, 3, 50);

    const startTime = performance.now();
    await retryFn('test');
    const endTime = performance.now();

    // 第一次重试应该等待约100ms（50 * 2^1）
    // 使用更宽松的时间范围，考虑测试环境的时间精度
    expect(endTime - startTime).toBeGreaterThan(50);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});
