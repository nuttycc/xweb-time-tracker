import { storage } from '#imports';
import { z } from 'zod';

// Re-export these types as they are part of the config schema
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// Zod schema for a single log level
const LogLevelSchema = z.enum(LOG_LEVELS);

// Zod schema for the hierarchical log configuration
const LogConfigSchema = z.object({
  global: LogLevelSchema,
  modules: z.record(z.string(), LogLevelSchema.optional()),
});

// Infer the TypeScript type from the schema
export type LogConfig = z.infer<typeof LogConfigSchema>;

/**
 * Default configuration based on environment.
 * Production defaults to 'warn', development defaults to 'info'.
 */
const DEFAULT_LOG_CONFIG: LogConfig = {
  global: import.meta.env.MODE === 'production' ? 'warn' : 'info',
  modules: {},
};

/**
 * WXT storage item for persisting the entire log configuration object.
 * Runtime validation is performed manually when retrieving the value.
 */
export const logConfigStorage = storage.defineItem<LogConfig>(`local:log-config`, {
  fallback: DEFAULT_LOG_CONFIG,
});

/**
 * Retrieves the complete, persisted log configuration, with runtime validation.
 * If stored data is invalid, it logs a warning and returns the default config.
 *
 * @returns A promise that resolves to the LogConfig object.
 */
export async function getLogConfig(): Promise<LogConfig> {
  const rawConfig = await logConfigStorage.getValue();
  const result = LogConfigSchema.safeParse(rawConfig);

  if (result.success) {
    return result.data;
  }

  console.warn(
    'Invalid log configuration in storage; falling back to default.',
    result.error.issues,
  );
  return DEFAULT_LOG_CONFIG;
}

/**
 * Sets the global log level for all loggers.
 * This level is used for any module that does not have a specific override.
 *
 * @param level - The log level to apply globally.
 */
export async function setGlobalLogLevel(level: LogLevel): Promise<void> {
  const currentConfig = await getLogConfig();
  await logConfigStorage.setValue({
    ...currentConfig,
    global: level,
  });
}

/**
 * Sets or unsets a specific log level for a single module.
 *
 * @param moduleName - The name of the module to configure (e.g., 'Background', 'DatabaseService').
 * @param level - The log level to apply. If `undefined`, the module-specific override is removed, and it will inherit the global level.
 */
export async function setModuleLogLevel(
  moduleName: string,
  level: LogLevel | undefined,
): Promise<void> {
  const currentConfig = await getLogConfig();
  const newModules = { ...currentConfig.modules };

  if (level) {
    newModules[moduleName] = level;
  } else {
    delete newModules[moduleName];
  }

  await logConfigStorage.setValue({
    ...currentConfig,
    modules: newModules,
  });
}

/**
 * Watches for any changes to the log configuration.
 *
 * @param callback - The function to call with the new configuration when it changes.
 * @returns A function to call to remove the watcher.
 */
export function watchLogConfig(
  callback: (newValue: LogConfig | null, oldValue: LogConfig | null) => void,
): () => void {
  return logConfigStorage.watch(callback);
} 