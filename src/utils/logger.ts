/**
 * Unified Logging System for WebTime Tracker
 *
 * Features:
 * - Environment-based log level control (dev: debug+, prod: warn+)
 * - Hierarchical configuration: global default + per-module overrides
 * - Persistent configuration using WXT storage
 * - Live-reloading of log levels across all contexts
 * - TypeScript support
 *
 * @module utils/logger
 */

import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';
import {
  logConfigStorage,
  getLogConfig,
  watchLogConfig,
  setGlobalLogLevel,
  setModuleLogLevel as setModuleLogLevelInConfig,
  type LogLevel,
  type LogConfig,
  LOG_LEVELS,
} from '@/config/logging';

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

const DEFAULT_TEMPLATE = `[tracker] [%l] [%n]`;

/**
 * A Map of all module loggers that have been instantiated.
 * This allows us to update their levels individually when the config changes.
 */
const registeredLoggers = new Map<string, log.Logger>();

/**
 * A local, in-memory cache of the current logging configuration.
 * Avoids repeated async storage calls for synchronous operations.
 */
let currentLogConfig: LogConfig | null = null;

/**
 * Applies the given configuration to the root logger and all registered module loggers.
 * This is the core function for synchronizing state from config to the logging instances.
 */
function applyLogConfig(config: LogConfig): void {
  // 1. Update our in-memory cache
  currentLogConfig = config;

  // 2. Set the global (root) log level. This acts as the default.
  log.setLevel(config.global, false);

  // 3. Apply specific levels to all registered module loggers
  registeredLoggers.forEach((logger, name) => {
    const moduleLevel = config.modules[name];
    // Use the module-specific level, or fall back to the new global level
    logger.setLevel(moduleLevel || config.global, false);
  });
}

/**
 * Initializes the logging system.
 *
 * Applies a consistent prefix format, loads the persisted log configuration,
 * applies it, and sets up a watcher to automatically apply future changes.
 */
async function initializeLogging(): Promise<void> {
  // Apply the prefix plugin formatting
  prefix.reg(log);
  prefix.apply(log, {
    template: DEFAULT_TEMPLATE,
    levelFormatter: level => level.toUpperCase(),
    nameFormatter: name => name || 'ROOT',
    timestampFormatter: date => date.toISOString(),
  });

  // Load the initial config from storage and apply it
  const initialConfig = await getLogConfig();
  applyLogConfig(initialConfig);

  // Watch for any subsequent changes and re-apply them
  watchLogConfig(newConfig => {
    if (newConfig) {
      console.log('🔄 Log configuration changed, applying new levels...', newConfig);
      applyLogConfig(newConfig);
    }
  });
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
 * Creates a logger instance with a module-specific prefix.
 *
 * @param moduleName - The name to identify the logger's module context (e.g., 'TimeTracker')
 * @returns A logger with standard logging methods.
 */
export function createLogger(moduleName: string): Logger {
  const moduleLogger = log.getLogger(moduleName);

  // If a config has already been loaded, set the initial level for this new logger.
  // Otherwise, it will be configured once the async initialization completes.
  if (currentLogConfig) {
    const level = currentLogConfig.modules[moduleName] || currentLogConfig.global;
    moduleLogger.setLevel(level);
  }

  // Register the logger so it receives future configuration updates
  registeredLoggers.set(moduleName, moduleLogger);

  return {
    debug: (...args) => moduleLogger.debug(...args),
    info: (...args) => moduleLogger.info(...args),
    warn: (...args) => moduleLogger.warn(...args),
    error: (...args) => moduleLogger.error(...args),
    trace: (...args) => moduleLogger.trace(...args),
  };
}

/**
 * Sets the global log level for all loggers and persists the change.
 * Modules without a specific override will use this level.
 *
 * @param level - The log level to apply globally.
 */
export async function setLogLevel(level: LogLevel): Promise<void> {
  if (isValidLogLevel(level)) {
    await setGlobalLogLevel(level);
  }
}

/**
 * Retrieves the current global log level from the in-memory cache.
 *
 * @returns The current global log level.
 */
export function getLogLevel(): LogLevel {
  return currentLogConfig?.global || logConfigStorage.fallback.global;
}

/**
 * Retrieves the full, persisted log configuration object from storage.
 *
 * @returns A promise resolving to the LogConfig object.
 */
export async function getPersistedConfig(): Promise<LogConfig> {
  return await getLogConfig();
}

/**
 * Sets the log level for a specific module and persists the change.
 *
 * @param moduleName - The name of the module whose logger will be updated.
 * @param level - The log level to apply. If `undefined`, the override is removed.
 */
export async function setModuleLogLevel(
  moduleName: string,
  level: LogLevel | undefined,
): Promise<void> {
  if (level && !isValidLogLevel(level)) return;
  await setModuleLogLevelInConfig(moduleName, level);
}

/**
 * Returns the list of all supported log levels.
 *
 * @returns An array of valid log level strings.
 */
export function getAvailableLogLevels(): readonly LogLevel[] {
  return LOG_LEVELS;
}

// Kick off the async initialization of the logging system.
// This is non-blocking. Any loggers created before it completes will
// be updated once the configuration is loaded and the watcher is attached.
initializeLogging();

export const rootLogger = createLogger('ROOT');
export default rootLogger;
