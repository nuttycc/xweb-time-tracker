/**
 * Unified Logging System for WebTime Tracker
 * 
 * Based on loglevel library with prefix plugin for consistent logging across
 * all WXT framework contexts (content/background/popup).
 * 
 * Features:
 * - Environment-based log level control (dev: debug+, prod: warn+)
 * - Module-based logger creation with prefixed output
 * - Persistent configuration support
 * - Cross-browser compatibility
 * - TypeScript support
 * 
 * @module utils/logger
 */

import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';

// Initialize the prefix plugin
prefix.reg(log);

/**
 * Logger interface compatible with existing console usage patterns
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  trace(message: string, data?: unknown): void;
}

/**
 * Log levels supported by the system
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Default log level for all loggers */
  defaultLevel: LogLevel;
  /** Enable persistent storage of log level settings */
  persistLevel: boolean;
  /** Custom format template for log messages */
  template?: string;
}

/**
 * Default configuration based on environment
 */
const DEFAULT_CONFIG: LoggerConfig = {
  defaultLevel: import.meta.env.MODE === 'production' ? 'warn' : 'debug',
  persistLevel: true,
  template: '[%t] [%n] [%l]',
};

/**
 * Storage key for persistent log level configuration
 */
const STORAGE_KEY = 'webtime-tracker-log-level';

/**
 * Initialize the logging system with configuration
 */
function initializeLogging(config: LoggerConfig = DEFAULT_CONFIG): void {
  // Apply prefix template
  prefix.apply(log, {
    template: config.template || DEFAULT_CONFIG.template,
    levelFormatter: (level) => level.toUpperCase(),
    nameFormatter: (name) => name || 'ROOT',
    timestampFormatter: (date) => date.toISOString(),
  });

  // Set default log level
  log.setDefaultLevel(config.defaultLevel);

  // Load persisted level if enabled
  if (config.persistLevel) {
    loadPersistedLogLevel();
  }
}

/**
 * Load log level from persistent storage
 */
function loadPersistedLogLevel(): void {
  try {
    // Try to load from localStorage (available in popup/options contexts)
    if (typeof localStorage !== 'undefined') {
      const savedLevel = localStorage.getItem(STORAGE_KEY);
      if (savedLevel && isValidLogLevel(savedLevel)) {
        log.setDefaultLevel(savedLevel as LogLevel);
      }
    }
  } catch {
    // Silently fail if localStorage is not available (e.g., in content scripts)
    // The default level will be used instead
  }
}

/**
 * Save log level to persistent storage
 */
function saveLogLevel(level: LogLevel): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, level);
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Validate if a string is a valid log level
 */
function isValidLogLevel(level: string): boolean {
  return ['trace', 'debug', 'info', 'warn', 'error', 'silent'].includes(level);
}

/**
 * Create a named logger instance for a specific module
 * 
 * @param moduleName - Name of the module (e.g., 'TimeTracker', 'DatabaseService')
 * @returns Logger instance with module-specific prefix
 * 
 * @example
 * ```typescript
 * const logger = createLogger('TimeTracker');
 * logger.info('Tracker started successfully');
 * // Output: [12:34:56] [TimeTracker] [INFO] Tracker started successfully
 * ```
 */
export function createLogger(moduleName: string): Logger {
  const moduleLogger = log.getLogger(moduleName);

  // Helper function to handle logging with optional data
  const logWithData = (
    level: keyof Logger,
    message: string,
    data?: unknown
  ) => {
    if (data !== undefined) {
      moduleLogger[level](message, data);
    } else {
      moduleLogger[level](message);
    }
  };

  return {
    debug: (message, data) => logWithData('debug', message, data),
    info: (message, data) => logWithData('info', message, data),
    warn: (message, data) => logWithData('warn', message, data),
    error: (message, data) => logWithData('error', message, data),
    trace: (message, data) => logWithData('trace', message, data),
  };
}

/**
 * Set global log level for all loggers
 * 
 * @param level - New log level to apply
 * @param persist - Whether to save the level to persistent storage
 */
export function setLogLevel(level: LogLevel, persist: boolean = true): void {
  log.setDefaultLevel(level);
  
  if (persist) {
    saveLogLevel(level);
  }
}

/**
 * Get current global log level
 */
const LEVEL_MAP: Record<number, LogLevel> = {
  [log.levels.TRACE]: 'trace',
  [log.levels.DEBUG]: 'debug',
  [log.levels.INFO]: 'info',
  [log.levels.WARN]: 'warn',
  [log.levels.ERROR]: 'error',
  [log.levels.SILENT]: 'silent',
};

export function getLogLevel(): LogLevel {
  const raw = log.getLevel();
  if (typeof raw === 'string' && isValidLogLevel(raw)) {
    return raw as LogLevel;
  }
  if (typeof raw === 'number' && raw in LEVEL_MAP) {
    return LEVEL_MAP[raw];
  }
  // fallback: return default level
  return DEFAULT_CONFIG.defaultLevel;
}

/**
 * Enable or disable logging for a specific module
 * 
 * @param moduleName - Name of the module
 * @param level - Log level to set for this module, or 'silent' to disable
 */
export function setModuleLogLevel(moduleName: string, level: LogLevel): void {
  const moduleLogger = log.getLogger(moduleName);
  moduleLogger.setLevel(level);
}

/**
 * Get available log levels
 */
export function getAvailableLogLevels(): LogLevel[] {
  return ['trace', 'debug', 'info', 'warn', 'error', 'silent'];
}

// Initialize logging system on module load
initializeLogging();

// Export the root logger for backward compatibility
export const rootLogger = createLogger('ROOT');

// Export default logger instance
export default rootLogger;
