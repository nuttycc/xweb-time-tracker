/**
 * Error Handler Service
 *
 * This file implements centralized error handling for database operations,
 * providing error classification, logging, and recovery strategies.
 */

import { z } from 'zod/v4';
import { RepositoryError, ValidationError, NotFoundError } from '../repositories';
import { createLogger } from '@/utils/logger';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  DATABASE = 'database',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  NETWORK = 'network',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  name: string;
  message: string;
  operation?: string;
  context?: Record<string, unknown>;
  stack?: string;
  recoverable: boolean;
  userMessage: string;
}

/**
 * Error handling options
 */
export interface ErrorHandlingOptions {
  logError?: boolean;
  includeStack?: boolean;
  notifyUser?: boolean;
  attemptRecovery?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Recovery strategy result
 */
export interface RecoveryResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Custom business logic error
 */
export class BusinessLogicError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

/**
 * Custom database connection error
 */
export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Custom quota exceeded error
 */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly quotaType?: string,
    public readonly currentUsage?: number,
    public readonly limit?: number
  ) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Error Handler Service Class
 *
 * Provides centralized error handling, classification, logging, and recovery
 * for all database and business logic operations.
 */
export class ErrorHandlerService {
  private static readonly logger = createLogger('ErrorHandlerService');
  private errorCount = 0;

  /**
   * Handle an error with classification, logging, and recovery
   *
   * @param error - The error to handle
   * @param options - Error handling options
   * @returns Promise resolving to error information
   */
  async handleError(error: unknown, options: ErrorHandlingOptions = {}): Promise<ErrorInfo> {
    const errorInfo = this.classifyError(error, options);

    if (options.logError !== false) {
      this.logError(errorInfo, options);
    }

    if (options.attemptRecovery && errorInfo.recoverable) {
      const recovery = await this.attemptRecovery(error, errorInfo);
      if (recovery.success) {
        errorInfo.userMessage = recovery.message;
      }
    }

    return errorInfo;
  }

  /**
   * Classify an error into category, severity, and recovery information
   *
   * @param error - The error to classify
   * @param options - Error handling options
   * @returns Classified error information
   */
  private classifyError(error: unknown, options: ErrorHandlingOptions): ErrorInfo {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let recoverable = false;
    let userMessage = 'An unexpected error occurred. Please try again.';
    let name = 'UnknownError';
    let message = 'Unknown error';
    let operation: string | undefined;
    let stack: string | undefined;

    if (error instanceof Error) {
      name = error.name;
      message = error.message;
      stack = error.stack;
    }

    // Classify specific error types
    if (error instanceof z.ZodError) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.LOW;
      recoverable = true;
      name = 'ZodError';
      message = error.message;
      userMessage = this.formatZodError(error);
      operation = 'validation';
    } else if (error instanceof ValidationError) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.LOW;
      recoverable = true;
      userMessage = `Validation failed: ${message}`;
      operation = 'validation';
    } else if (error instanceof NotFoundError) {
      category = ErrorCategory.DATABASE;
      severity = ErrorSeverity.LOW;
      recoverable = true;
      userMessage = 'The requested item was not found.';
      operation = 'database_query';
    } else if (error instanceof RepositoryError) {
      category = ErrorCategory.DATABASE;
      severity = ErrorSeverity.MEDIUM;
      recoverable = true;
      userMessage = 'A database error occurred. Please try again.';
      operation = (error as RepositoryError).operation;
    } else if (error instanceof BusinessLogicError) {
      category = ErrorCategory.BUSINESS_LOGIC;
      severity = ErrorSeverity.MEDIUM;
      recoverable = false;
      userMessage = message;
      operation = 'business_logic';
    } else if (error instanceof DatabaseConnectionError) {
      category = ErrorCategory.DATABASE;
      severity = ErrorSeverity.HIGH;
      recoverable = true;
      userMessage = 'Database connection failed. Please try again later.';
      operation = (error as DatabaseConnectionError).operation;
    } else if (error instanceof QuotaExceededError) {
      category = ErrorCategory.SYSTEM;
      severity = ErrorSeverity.HIGH;
      recoverable = false;
      userMessage = 'Storage quota exceeded. Please free up space and try again.';
      operation = 'storage';
    } else if (error instanceof Error) {
      // Check for specific browser/Dexie errors
      if (error.name === 'QuotaExceededError' || message.includes('quota')) {
        category = ErrorCategory.SYSTEM;
        severity = ErrorSeverity.HIGH;
        recoverable = false;
        userMessage = 'Storage quota exceeded. Please free up space and try again.';
      } else if (error.name === 'DatabaseClosedError') {
        category = ErrorCategory.DATABASE;
        severity = ErrorSeverity.HIGH;
        recoverable = true;
        userMessage = 'Database connection lost. Attempting to reconnect...';
      } else if (error.name === 'NetworkError' || message.includes('network')) {
        category = ErrorCategory.NETWORK;
        severity = ErrorSeverity.MEDIUM;
        recoverable = true;
        userMessage = 'Network error. Please check your connection and try again.';
      }
    }

    return {
      id: errorId,
      timestamp,
      category,
      severity,
      name,
      message,
      operation,
      context: options.context,
      stack: options.includeStack !== false ? stack : undefined,
      recoverable,
      userMessage,
    };
  }

  /**
   * Log error information
   *
   * @param errorInfo - The error information to log
   * @param options - Error handling options
   */
  private logError(errorInfo: ErrorInfo, options: ErrorHandlingOptions): void {
    const logData = {
      errorId: errorInfo.id,
      timestamp: errorInfo.timestamp,
      category: errorInfo.category,
      severity: errorInfo.severity,
      name: errorInfo.name,
      message: errorInfo.message,
      operation: errorInfo.operation,
      context: errorInfo.context,
      recoverable: errorInfo.recoverable,
      ...(options.includeStack !== false && errorInfo.stack && { stack: errorInfo.stack }),
    };

    // Use log level mapping instead of switch statement
    const levelMap = {
      [ErrorSeverity.LOW]: 'info',
      [ErrorSeverity.MEDIUM]: 'warn',
      [ErrorSeverity.HIGH]: 'error',
      [ErrorSeverity.CRITICAL]: 'error',
    } as const;

    const logLevel = levelMap[errorInfo.severity];
    const logMessage = `Error occurred: ${errorInfo.name} (${errorInfo.category})`;
    
    // Pass string message and structured data separately for better console inspection
    ErrorHandlerService.logger[logLevel](logMessage, logData);

    // Handle critical errors with additional processing
    if (errorInfo.severity === ErrorSeverity.CRITICAL) {
      // In a real application, you might send alerts here
    }
  }

  /**
   * Attempt to recover from an error
   *
   * @param error - The original error
   * @param errorInfo - Classified error information
   * @returns Promise resolving to recovery result
   */
  private async attemptRecovery(error: unknown, errorInfo: ErrorInfo): Promise<RecoveryResult> {
    try {
      switch (errorInfo.category) {
        case ErrorCategory.DATABASE:
          return this.attemptDatabaseRecovery(error, errorInfo);

        case ErrorCategory.VALIDATION:
          return this.attemptValidationRecovery(error, errorInfo);

        case ErrorCategory.NETWORK:
          return this.attemptNetworkRecovery(error, errorInfo);

        default:
          return {
            success: false,
            message: 'No recovery strategy available for this error type.',
          };
      }
    } catch (recoveryError) {
      return {
        success: false,
        message: `Recovery attempt failed: ${(recoveryError as Error).message}`,
      };
    }
  }

  /**
   * Attempt database error recovery
   */
  private async attemptDatabaseRecovery(
    _error: unknown,
    errorInfo: ErrorInfo
  ): Promise<RecoveryResult> {
    // Simplified recovery logic - in a real implementation,
    // you might attempt to reconnect, retry operations, etc.

    if (errorInfo.name === 'DatabaseClosedError') {
      // Attempt to reconnect
      return {
        success: true,
        message: 'Database connection will be re-established automatically.',
      };
    }

    return {
      success: false,
      message: 'Database recovery not possible at this time.',
    };
  }

  /**
   * Attempt validation error recovery
   */
  private async attemptValidationRecovery(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _error: unknown, // Reserved for future error-specific recovery logic
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _errorInfo: ErrorInfo // Reserved for future context-aware recovery strategies
  ): Promise<RecoveryResult> {
    return {
      success: true,
      message: 'Please correct the validation errors and try again.',
    };
  }

  /**
   * Attempt network error recovery
   */
  private async attemptNetworkRecovery(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _error: unknown, // Reserved for future network-specific recovery logic
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _errorInfo: ErrorInfo // Reserved for future retry strategies based on error context
  ): Promise<RecoveryResult> {
    return {
      success: true,
      message: 'Please check your network connection and try again.',
    };
  }

  /**
   * Format Zod validation errors into user-friendly messages
   */
  private formatZodError(error: z.ZodError): string {
    const issues = error.issues.map(issue => {
      const path = issue.path.join('.');
      return `${path}: ${issue.message}`;
    });

    return `Validation failed: ${issues.join(', ')}`;
  }

  /**
   * Generate a unique error ID
   */
  private generateErrorId(): string {
    this.errorCount++;
    const timestamp = Date.now();
    return `ERR-${timestamp}-${this.errorCount.toString().padStart(4, '0')}`;
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): { totalErrors: number } {
    return {
      totalErrors: this.errorCount,
    };
  }

  /**
   * Reset error statistics
   */
  resetStatistics(): void {
    this.errorCount = 0;
  }
}

/**
 * Singleton instance of the error handler service
 */
export const errorHandlerService = new ErrorHandlerService();
