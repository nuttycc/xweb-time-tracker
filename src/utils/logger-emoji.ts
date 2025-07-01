/**
 * Emoji-Enhanced Logging Utilities
 * 
 * Provides consistent visual logging with emoji categorization for better
 * readability and quick log filtering. Based on the unified logger system.
 * 
 * @module utils/logger-emoji
 */

import { createLogger, type Logger } from './logger';

/**
 * Emoji categories for different log types based on business operations
 */
export enum LogCategory {
  /** ▶️ Start/Begin operations */
  START = '▶️',
  /** ⏹️ End/Complete operations */
  END = '⏹️',
  /** 📥 Enqueue operations */
  ENQUEUE = '📥',
  /** 📤 Flush/Dequeue operations */
  FLUSH = '📤',
  /** 💾 Database operations */
  DB = '💾',
  /** ♻️ Recovery operations */
  RECOVERY = '♻️',
  /** 🛠️ Handle/Process operations */
  HANDLE = '🛠️',
  /** ⏰ Schedule/Timer operations */
  SCHEDULE = '⏰',
  /** 🚫 Skip/Filter operations */
  SKIP = '🚫',
  /** ✅ Success operations */
  SUCCESS = '✅',
  /** ❌ Error/Failure operations */
  ERROR = '❌',
  /** ⚠️ Warning operations */
  WARN = '⚠️',
  /** ℹ️ General information */
  INFO = 'ℹ️',
}

/**
 * Log levels supported by the emoji logger
 */
export type EmojiLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

/**
 * Enhanced logger interface with emoji support
 */
export interface EmojiLogger extends Logger {
  logWithEmoji(
    category: LogCategory,
    level: EmojiLogLevel,
    phrase: string,
    data?: unknown
  ): void;
}

/**
 * Creates an emoji-enhanced logger for a specific module
 * 
 * @param moduleName - The name of the module for prefixed logging
 * @returns Enhanced logger with emoji support
 * 
 * @example
 * ```typescript
 * const logger = createEmojiLogger('AggregationEngine');
 * logger.logWithEmoji(LogCategory.START, 'info', 'Processing events', { count: 10 });
 * // Output: ▶️ [AggregationEngine] [INFO] Processing events — { count: 10 }
 * ```
 */
export function createEmojiLogger(moduleName: string): EmojiLogger {
  const baseLogger = createLogger(moduleName);

  const logWithEmoji = (
    category: LogCategory,
    level: EmojiLogLevel,
    phrase: string,
    data?: unknown
  ): void => {
    const message = `${category} ${phrase}`;
    baseLogger[level](message, data);
  };

  return {
    ...baseLogger,
    logWithEmoji,
  };
}

/**
 * Standalone function for emoji logging without creating a logger instance
 * 
 * @param moduleName - The module name for the logger
 * @param category - The emoji category
 * @param level - The log level
 * @param phrase - The log message phrase
 * @param data - Optional data object to include
 */
export function logWithEmoji(
  moduleName: string,
  category: LogCategory,
  level: EmojiLogLevel,
  phrase: string,
  data?: unknown
): void {
  const logger = createLogger(moduleName);
  const message = `${category} ${phrase}`;
  logger[level](message, data);
}

/**
 * Convenience functions for common logging patterns
 */
export const EmojiLogHelpers = {
  /**
   * Log start of an operation
   */
  start: (moduleName: string, operation: string, data?: unknown) =>
    logWithEmoji(moduleName, LogCategory.START, 'info', operation, data),

  /**
   * Log end of an operation
   */
  end: (moduleName: string, operation: string, data?: unknown) =>
    logWithEmoji(moduleName, LogCategory.END, 'info', operation, data),

  /**
   * Log successful completion
   */
  success: (moduleName: string, operation: string, data?: unknown) =>
    logWithEmoji(moduleName, LogCategory.SUCCESS, 'info', operation, data),

  /**
   * Log error occurrence
   */
  error: (moduleName: string, operation: string, error: unknown) =>
    logWithEmoji(moduleName, LogCategory.ERROR, 'error', operation, error),

  /**
   * Log database operation
   */
  db: (moduleName: string, operation: string, data?: unknown) =>
    logWithEmoji(moduleName, LogCategory.DB, 'debug', operation, data),

  /**
   * Log processing operation
   */
  handle: (moduleName: string, operation: string, data?: unknown) =>
    logWithEmoji(moduleName, LogCategory.HANDLE, 'info', operation, data),
}; 