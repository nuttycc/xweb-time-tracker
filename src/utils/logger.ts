/**
 * Unified Logging System for WebTime Tracker
 *
 * Based on loglevel library with prefix plugin for consistent logging across
 * all WXT framework contexts (content/background/popup).
 *
 * Features:
 * - Environment-based log level control (dev: debug+, prod: warn+)
 * - Module-based logger creation with prefixed output
 * - Persistent configuration using WXT storage
 * - Cross-browser compatibility
 * - TypeScript support
 *
 * @module utils/logger
 */

import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import { storage } from '#imports';

/**
 * Logger interface compatible with existing console usage patterns
 * Supports variable arguments like native console methods
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  trace(...args: unknown[]): void;
}

/**
 * Available log levels in order of verbosity
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;

/**
 * Log levels supported by the system
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Default log level for all loggers */
  defaultLevel: LogLevel;
  /** Custom format template for log messages */
  template?: string;
}

/**
 * Default configuration based on environment
 */
const DEFAULT_CONFIG: LoggerConfig = {
  defaultLevel: import.meta.env.MODE === 'production' ? 'warn' : 'debug',
  // template: `[${__APP_NAME__}] [%n] [%l]`,
  template: `[tracker] [%n]`,
};

/**
 * WXT storage item for persisting log level configuration
 */
const logLevelStorage = storage.defineItem<LogLevel>(`local:log-level`, {
  fallback: DEFAULT_CONFIG.defaultLevel,
});

// Initialize the prefix plugin
prefix.reg(log);

/**
 * Initializes the logging system with the specified configuration.
 *
 * Applies a consistent prefix format to log messages, sets the default log level,
 * and loads the persisted log level from WXT storage.
 */
async function initializeLogging(config: LoggerConfig = DEFAULT_CONFIG): Promise<void> {
  // Apply prefix template
  prefix.apply(log, {
    template: config.template || DEFAULT_CONFIG.template,
    levelFormatter: level => level.toUpperCase(),
    nameFormatter: name => name || 'ROOT',
    timestampFormatter: date => date.toISOString(),
  });

  // Set default log level
  log.setLevel(config.defaultLevel, false);

  // Load persisted level from WXT storage
  await loadPersistedLogLevel();
}

/**
 * Loads the saved log level from WXT storage and applies it as the default log level.
 */
async function loadPersistedLogLevel(): Promise<void> {
  const savedLevel = await logLevelStorage.getValue();
  if (savedLevel && isValidLogLevel(savedLevel)) {
    log.setLevel(savedLevel, false);
  }
}

/**
 * Persists the specified log level to WXT storage.
 */
async function saveLogLevel(level: LogLevel): Promise<void> {
  await logLevelStorage.setValue(level);
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
 * Supports variable arguments like native console methods.
 *
 * @param moduleName - The name to identify the logger's module context (e.g., 'TimeTracker', 'DatabaseService')
 * @returns A logger with standard logging methods that include the module prefix
 *
 * @example
 * const logger = createLogger('TimeTracker');
 * logger.info('Tracker started successfully');
 * logger.debug('User data:', userData, 'Session:', sessionId);
 * // Output: [🕒] [TimeTracker] Tracker started successfully
 * // Output: [🕒] [TimeTracker] User data: {...} Session: abc123
 */
export function createLogger(moduleName: string): Logger {
  const moduleLogger = log.getLogger(moduleName);

  return {
    debug: (...args) => moduleLogger.debug(...args),
    info: (...args) => moduleLogger.info(...args),
    warn: (...args) => moduleLogger.warn(...args),
    error: (...args) => moduleLogger.error(...args),
    trace: (...args) => moduleLogger.trace(...args),
  };
}

/**
 * Sets the global log level for all loggers.
 *
 * @param level - The log level to apply globally
 * @param persist - If true, saves the log level to WXT storage
 */
export async function setLogLevel(level: LogLevel, persist: boolean = true): Promise<void> {
  log.setLevel(level, false);

  if (persist) {
    await saveLogLevel(level);
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
 * Retrieves the persisted log level from WXT storage.
 *
 * @returns Promise that resolves to the stored log level or null if not set
 */
export async function getPersistedLogLevel(): Promise<LogLevel | null> {
  const value = await logLevelStorage.getValue();
  return value || null;
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
  moduleLogger.setLevel(level, false);
}

/**
 * Returns the list of all supported log levels in order of increasing severity.
 *
 * @returns An array of valid log level strings.
 */
export function getAvailableLogLevels(): readonly LogLevel[] {
  return LOG_LEVELS;
}

/**
 * Watches for changes to the log level in storage and applies them automatically.
 *
 * @returns Function to stop watching for changes
 */
export function watchLogLevel(): () => void {
  return logLevelStorage.watch(newLevel => {
    if (newLevel && isValidLogLevel(newLevel)) {
      log.setLevel(newLevel, false);
    }
  });
}

initializeLogging();

export const rootLogger = createLogger('ROOT');
export default rootLogger;
