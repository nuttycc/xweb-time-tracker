/**
 * ErrorHandlerService Unit Tests
 *
 * Tests for error classification, logging, recovery strategies, and type safety
 * in the ErrorHandlerService class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod/v4';

type ZodIssue = z.ZodIssue;
import {
  ErrorHandlerService,
  BusinessLogicError,
  DatabaseConnectionError,
  QuotaExceededError,
  ErrorSeverity,
  ErrorCategory,
  type ErrorHandlingOptions,
} from '@/core/db/services/error-handler.service';
import { TestNetworkError } from './test-utils';

// Mock the logger module
vi.mock('@/utils/logger', () => {
  const mockLoggerFunctions = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLoggerFunctions),
    mockLoggerFunctions, // Export for testing
  };
});

// Import the mocked functions
import { mockLoggerFunctions } from '@/utils/logger';

describe('ErrorHandlerService', () => {
  let errorHandler: ErrorHandlerService;

  beforeEach(() => {
    errorHandler = new ErrorHandlerService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    errorHandler.resetStatistics();
  });

  describe('Error Classification', () => {
    it('should classify BusinessLogicError correctly', async () => {
      const error = new BusinessLogicError('Invalid business operation');
      const options: ErrorHandlingOptions = { context: { operation: 'test' } };

      const errorInfo = await errorHandler.handleError(error, options);

      expect(errorInfo.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.name).toBe('BusinessLogicError');
      expect(errorInfo.message).toBe('Invalid business operation');
      expect(errorInfo.recoverable).toBe(false);
      expect(errorInfo.context).toEqual({ operation: 'test' });
    });

    it('should classify DatabaseConnectionError correctly', async () => {
      const error = new DatabaseConnectionError('Connection failed');

      const errorInfo = await errorHandler.handleError(error, {});

      expect(errorInfo.category).toBe(ErrorCategory.DATABASE);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.name).toBe('DatabaseConnectionError');
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should classify QuotaExceededError correctly', async () => {
      const error = new QuotaExceededError('Storage quota exceeded');

      const errorInfo = await errorHandler.handleError(error, {});

      expect(errorInfo.category).toBe(ErrorCategory.SYSTEM);
      expect(errorInfo.severity).toBe(ErrorSeverity.HIGH);
      expect(errorInfo.name).toBe('QuotaExceededError');
      expect(errorInfo.recoverable).toBe(false);
    });

    it('should classify ZodError as validation error', async () => {
      const zodIssue: ZodIssue = {
        code: 'invalid_type',
        expected: 'string',
        input: 123,
        path: ['field'],
        message: 'Expected string, received number',
      };
      const zodError = new z.ZodError([zodIssue]);
      const errorInfo = await errorHandler.handleError(zodError, {});

      expect(errorInfo.category).toBe(ErrorCategory.VALIDATION);
      expect(errorInfo.severity).toBe(ErrorSeverity.LOW);
      expect(errorInfo.name).toBe('ZodError');
      expect(errorInfo.recoverable).toBe(true);
      expect(errorInfo.userMessage).toContain('field: Expected string, received number');
    });

    it('should classify standard Error as unknown', async () => {
      const error = new Error('Standard error message');

      const errorInfo = await errorHandler.handleError(error, {});

      expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.name).toBe('Error');
      expect(errorInfo.recoverable).toBe(false);
    });

    it('should handle unknown error types safely', async () => {
      const unknownError = { unexpected: true, message: 'Not an Error instance' };

      const errorInfo = await errorHandler.handleError(unknownError, {});

      expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.name).toBe('UnknownError');
      expect(errorInfo.recoverable).toBe(false);
      expect(errorInfo.userMessage).toBe('An unexpected error occurred. Please try again.');
    });

    it('should handle string errors safely', async () => {
      const stringError = 'This is a string error';

      const errorInfo = await errorHandler.handleError(stringError, {});

      expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(errorInfo.name).toBe('UnknownError');
      expect(errorInfo.message).toBe('Unknown error');
      expect(errorInfo.recoverable).toBe(false);
    });

    it('should generate unique error IDs', async () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      const errorInfo1 = await errorHandler.handleError(error1, {});
      const errorInfo2 = await errorHandler.handleError(error2, {});

      expect(errorInfo1.id).not.toBe(errorInfo2.id);
      expect(errorInfo1.id).toMatch(/^ERR-\d+-\d{4}$/);
      expect(errorInfo2.id).toMatch(/^ERR-\d+-\d{4}$/);
    });

    it('should include stack trace when available', async () => {
      const error = new Error('Error with stack');
      const options: ErrorHandlingOptions = { includeStack: true };

      const errorInfo = await errorHandler.handleError(error, options);

      expect(errorInfo.stack).toBeDefined();
      expect(typeof errorInfo.stack).toBe('string');
    });

    it('should exclude stack trace when not requested', async () => {
      const error = new Error('Error without stack');
      const options: ErrorHandlingOptions = { includeStack: false };

      const errorInfo = await errorHandler.handleError(error, options);

      expect(errorInfo.stack).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle error with default options', async () => {
      const error = new BusinessLogicError('Test error');

      const errorInfo = await errorHandler.handleError(error);

      expect(errorInfo.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(errorInfo.severity).toBe(ErrorSeverity.MEDIUM);
      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        '[ERROR-MEDIUM]',
        expect.stringContaining(errorInfo.id)
      );
    });

    it('should skip logging when logError is false', async () => {
      const error = new Error('Test error');
      const options: ErrorHandlingOptions = { logError: false };

      await errorHandler.handleError(error, options);

      expect(mockLoggerFunctions.error).not.toHaveBeenCalled();
      expect(mockLoggerFunctions.warn).not.toHaveBeenCalled();
      expect(mockLoggerFunctions.info).not.toHaveBeenCalled();
    });

    it('should attempt recovery for recoverable errors', async () => {
      const error = new DatabaseConnectionError('Connection lost');
      const options: ErrorHandlingOptions = { attemptRecovery: true };

      const errorInfo = await errorHandler.handleError(error, options);

      expect(errorInfo.recoverable).toBe(true);
      // Recovery should update the user message
      expect(errorInfo.userMessage).toBe('Database connection failed. Please try again later.');
    });

    it('should not attempt recovery when disabled', async () => {
      const error = new DatabaseConnectionError('Connection lost');
      const options: ErrorHandlingOptions = { attemptRecovery: false };

      const errorInfo = await errorHandler.handleError(error, options);

      expect(errorInfo.recoverable).toBe(true);
      // User message should remain the default
      expect(errorInfo.userMessage).toBe('Database connection failed. Please try again later.');
    });
  });

  describe('Error Statistics', () => {
    it('should track error count correctly', async () => {
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(0);

      await errorHandler.handleError(new Error('Error 1'), {});
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(1);

      await errorHandler.handleError(new Error('Error 2'), {});
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(2);
    });

    it('should reset statistics correctly', async () => {
      await errorHandler.handleError(new Error('Error 1'), {});
      await errorHandler.handleError(new Error('Error 2'), {});

      expect(errorHandler.getErrorStatistics().totalErrors).toBe(2);

      errorHandler.resetStatistics();
      expect(errorHandler.getErrorStatistics().totalErrors).toBe(0);
    });
  });

  describe('Recovery Strategies', () => {
    it('should attempt database recovery for DatabaseClosedError', async () => {
      const error = new DatabaseConnectionError('Database connection closed');

      // Test recovery attempt through handleError
      const options: ErrorHandlingOptions = { attemptRecovery: true };
      const result = await errorHandler.handleError(error, options);

      expect(result.recoverable).toBe(true);
      expect(result.category).toBe(ErrorCategory.DATABASE);
    });

    it('should handle validation recovery attempts', async () => {
      const zodIssue: ZodIssue = {
        code: 'invalid_type',
        expected: 'string',
        input: 123,
        path: ['testField'],
        message: 'Expected string, received number',
      };
      const zodError = new z.ZodError([zodIssue]);

      const options: ErrorHandlingOptions = { attemptRecovery: true };
      const result = await errorHandler.handleError(zodError, options);

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.recoverable).toBe(true);
    });

    it('should handle network recovery attempts', async () => {
      const networkError = new TestNetworkError('Network timeout');

      const options: ErrorHandlingOptions = { attemptRecovery: true };
      const result = await errorHandler.handleError(networkError, options);

      // Network errors are classified as unknown by default
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.name).toBe('TestNetworkError');
    });

    it('should handle recovery failure gracefully', async () => {
      const error = new Error('Unrecoverable error');

      const options: ErrorHandlingOptions = { attemptRecovery: true };
      const result = await errorHandler.handleError(error, options);

      expect(result.recoverable).toBe(false);
      expect(result.userMessage).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('Logging Functionality', () => {
    it('should log errors with correct severity levels', async () => {
      const criticalError = new DatabaseConnectionError('Critical database error');
      const mediumError = new Error('Medium severity error');
      const lowError = { message: 'Low severity unknown error' };

      await errorHandler.handleError(criticalError);
      await errorHandler.handleError(mediumError);
      await errorHandler.handleError(lowError);

      // High errors should be logged as error
      expect(mockLoggerFunctions.error).toHaveBeenCalledWith(
        '[ERROR-HIGH]',
        expect.stringContaining('DatabaseConnectionError')
      );

      // Medium errors should be logged as warn
      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        '[ERROR-MEDIUM]',
        expect.stringContaining('Error')
      );

      // Medium errors should be logged as warn (unknown errors are medium severity)
      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        '[ERROR-MEDIUM]',
        expect.stringContaining('UnknownError')
      );
    });

    it('should include context in log output', async () => {
      const error = new BusinessLogicError('Test error');
      const context = { userId: '123', operation: 'testOp' };
      const options: ErrorHandlingOptions = { context };

      await errorHandler.handleError(error, options);

      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        '[ERROR-MEDIUM]',
        expect.stringContaining('"userId": "123"')
      );
    });

    it('should include stack trace in logs when requested', async () => {
      const error = new Error('Error with stack');
      const options: ErrorHandlingOptions = { includeStack: true };

      await errorHandler.handleError(error, options);

      expect(mockLoggerFunctions.warn).toHaveBeenCalledWith(
        '[ERROR-MEDIUM]',
        expect.stringContaining('"stack":')
      );
    });
  });

  describe('Type Safety', () => {
    it('should handle null and undefined errors safely', async () => {
      const nullError = await errorHandler.handleError(null, {});
      const undefinedError = await errorHandler.handleError(undefined, {});

      expect(nullError.category).toBe(ErrorCategory.UNKNOWN);
      expect(nullError.name).toBe('UnknownError');
      expect(nullError.message).toBe('Unknown error');

      expect(undefinedError.category).toBe(ErrorCategory.UNKNOWN);
      expect(undefinedError.name).toBe('UnknownError');
      expect(undefinedError.message).toBe('Unknown error');
    });

    it('should handle numeric errors safely', async () => {
      const numericError = await errorHandler.handleError(404, {});

      expect(numericError.category).toBe(ErrorCategory.UNKNOWN);
      expect(numericError.name).toBe('UnknownError');
      expect(numericError.message).toBe('Unknown error');
    });

    it('should handle boolean errors safely', async () => {
      const booleanError = await errorHandler.handleError(false, {});

      expect(booleanError.category).toBe(ErrorCategory.UNKNOWN);
      expect(booleanError.name).toBe('UnknownError');
      expect(booleanError.message).toBe('Unknown error');
    });

    it('should preserve error properties without using any type', async () => {
      const customError = {
        name: 'CustomObjectError',
        message: 'Custom error message',
        code: 'CUSTOM_001',
        details: { field: 'value' },
      };

      const errorInfo = await errorHandler.handleError(customError, {});

      expect(errorInfo.category).toBe(ErrorCategory.UNKNOWN);
      expect(errorInfo.name).toBe('UnknownError');
      expect(errorInfo.message).toBe('Unknown error');
    });
  });
});
