import { merge } from 'es-toolkit';
import type { Config } from './constants';
import { DEFAULT_CONFIG } from './constants';
import { configItems } from './storage';
import { createLogger, type Logger } from '../utils/logger';

const logger: Logger = createLogger('ConfigManager');
type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;
type ConfigKeys = keyof Config;

/**
 * Manages the application's configuration by interfacing with wxt/storage.
 * It provides a centralized way to load, access, update, and watch for
 * configuration changes.
 */
class ConfigManager {
  private currentConfig: Config = DEFAULT_CONFIG;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.watchChanges();
  }

  /**
   * Loads the configuration from storage and merges it with the default config.
   * This method should be called once when the application starts.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      logger.info('ConfigManager initializing...');

      const configPromises = Object.keys(configItems).map(async (key) => {
        const itemKey = key as ConfigKeys;
        try {
          const value = await configItems[itemKey].getValue();
          return [itemKey, value];
        } catch (error) {
          logger.error(`Failed to get value for config key: ${itemKey}`, error);
          return [itemKey, undefined]; // Use undefined to signify failure
        }
      });

      const loadedEntries = await Promise.all(configPromises);
      const loadedConfig = Object.fromEntries(
        loadedEntries.filter(([, value]) => value !== undefined),
      );

      // Deep merge loaded config with defaults to ensure all keys are present
      this.currentConfig = merge(this.currentConfig, loadedConfig as Partial<Config>);
      this.isInitialized = true;
      this.initializationPromise = null;
      logger.info('ConfigManager initialized successfully.');
    })();

    return this.initializationPromise;
  }

  /**
   * Returns the current configuration object.
   * If the manager is not initialized, it will return the default configuration
   * and log a warning.
   */
  getConfig(): Config {
    if (!this.isInitialized) {
      logger.warn('ConfigManager not initialized. Returning default config.');
    }
    return this.currentConfig;
  }

  /**
   * Updates one or more configuration values in storage.
   * The provided object should be a deep partial of the `Config` type.
   * It intelligently merges object-based configs and replaces primitive values.
   */
  async updateConfig(partialConfig: DeepPartial<Config>): Promise<void> {
    await this.initialize(); // Ensure config is loaded before updating

    const updatePromises: Promise<void>[] = [];

    for (const key of Object.keys(partialConfig) as Array<ConfigKeys>) {
      if (key in configItems) {
        const item = configItems[key];
        const newValuePart = partialConfig[key];

        if (newValuePart === undefined) continue;

        const promise = (async () => {
          const currentValue = await item.getValue();
          let finalValue;

          // Deep merge for objects, direct assignment for primitives
          if (
            typeof currentValue === 'object' &&
            currentValue !== null &&
            !Array.isArray(currentValue) &&
            typeof newValuePart === 'object' &&
            newValuePart !== null
          ) {
            finalValue = merge(currentValue, newValuePart);
          } else {
            finalValue = newValuePart;
          }
          // @ts-expect-error - We are confident finalValue is of the correct type
          await item.setValue(finalValue);
        })();

        updatePromises.push(promise);
      } else {
        logger.warn(`Attempted to update unknown config key: ${key}`);
      }
    }

    await Promise.all(updatePromises);
  }

  /**
   * Sets up watchers on all configuration items to keep the local `currentConfig`
   * in sync with changes from storage (e.g., from other browser contexts or sync).
   */
  private watchChanges(): void {
    for (const key of Object.keys(configItems) as Array<ConfigKeys>) {
      configItems[key].watch((newValue) => {
        logger.debug(`Config key changed: ${key}`, newValue);
        if (this.currentConfig) {
          // @ts-expect-error - We know the key and value match the config structure
          this.currentConfig[key] = newValue;
        }
      });
    }
  }
}

export const configManager = new ConfigManager(); 