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
 * Available log levels in order of verbosity
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;

/**
 * Log levels supported by the system
 */
export type LogLevel = typeof LOG_LEVELS[number];

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
 * Initializes the logging system with the specified configuration.
 *
 * Applies a consistent prefix format to log messages, sets the default log level, and loads a persisted log level from storage if enabled.
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
 * Loads the saved log level from persistent storage and applies it as the default log level if valid.
 *
 * If no valid persisted log level is found or storage is unavailable, the default log level remains unchanged.
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
 * Persists the specified log level to localStorage if available.
 *
 * Silently does nothing if localStorage is unavailable or inaccessible.
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
 * Determines whether a given string is a recognized log level.
 *
 * @param level - The string to validate as a log level
 * @returns True if the string is a valid log level; otherwise, false
 */
function isValidLogLevel(level: string): level is LogLevel {
  return LOG_LEVELS.includes(level as LogLevel);
}

/**
 * Creates a logger instance with a module-specific prefix for structured logging.
 *
 * The returned logger prepends each message with a timestamp, the provided module name, and the log level.
 *
 * @param moduleName - The name to identify the logger's module context (e.g., 'TimeTracker', 'DatabaseService')
 * @returns A logger with standard logging methods that include the module prefix
 *
 * @example
 * const logger = createLogger('TimeTracker');
 * logger.info('Tracker started successfully');
 * // Output: [12:34:56] [TimeTracker] [INFO] Tracker started successfully
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
 * Sets the global log level for all loggers.
 *
 * @param level - The log level to apply globally
 * @param persist - If true, saves the log level to persistent storage
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

/**
 * Retrieves the current global log level as a string.
 *
 * If the log level is not recognized, returns the default log level from the configuration.
 *
 * @returns The current global log level.
 */
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
 * Sets the log level for a specific module logger.
 *
 * Adjusts the verbosity of log output for the given module, or disables logging for that module if set to 'silent'.
 *
 * @param moduleName - The name of the module whose logger will be updated
 * @param level - The log level to apply to this module
 */
export function setModuleLogLevel(moduleName: string, level: LogLevel): void {
  const moduleLogger = log.getLogger(moduleName);
  moduleLogger.setLevel(level);
}

/**
 * Returns the list of all supported log levels in order of increasing severity.
 *
 * @returns An array of valid log level strings.
 */
export function getAvailableLogLevels(): readonly LogLevel[] {
  return LOG_LEVELS;
}

// Initialize logging system on module load
initializeLogging();

// Export the root logger for backward compatibility
export const rootLogger = createLogger('ROOT');

// Export default logger instance
export default rootLogger;
