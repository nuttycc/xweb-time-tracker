import { storage } from '#imports';
import { getDefaults } from '../utils/zod-defaults';
import {
  AggregationConfigSchema,
  CheckpointConfigSchema,
  ConfigSchema,
  EventQueueConfigSchema,
  RetentionPolicyConfigSchema,
  StartupRecoveryConfigSchema,
  TimeTrackingConfigSchema,
  UIConfigSchema,
  UrlFilteringConfigSchema,
} from './constants';

/**
 * Grouped configuration items, defined using wxt/storage `defineItem`.
 * Each item corresponds to a top-level key in the main `Config` object.
 * This structure allows for granular updates and leverages wxt's built-in
 * features like fallbacks and type safety.
 */

// ============================================================================
// SYNC STORAGE (synced across user's devices)
// ============================================================================

export const timeTrackingConfig = storage.defineItem(`sync:timeTracking`, {
  fallback: getDefaults(TimeTrackingConfigSchema),
});

export const urlFilteringConfig = storage.defineItem(`sync:urlFiltering`, {
  fallback: getDefaults(UrlFilteringConfigSchema),
});

export const checkpointConfig = storage.defineItem(`sync:checkpoint`, {
  fallback: getDefaults(CheckpointConfigSchema),
});

export const aggregationConfig = storage.defineItem(`sync:aggregation`, {
  fallback: getDefaults(AggregationConfigSchema),
});

export const uiConfig = storage.defineItem(`sync:ui`, {
  fallback: getDefaults(UIConfigSchema),
});

export const retentionPolicyConfig = storage.defineItem(`sync:retentionPolicy`, {
  fallback: getDefaults(RetentionPolicyConfigSchema),
});

export const eventQueueConfig = storage.defineItem(`sync:eventQueue`, {
  fallback: getDefaults(EventQueueConfigSchema),
});

export const startupRecoveryConfig = storage.defineItem(`sync:startupRecovery`, {
  fallback: getDefaults(StartupRecoveryConfigSchema),
});

export const enableStartupRecovery = storage.defineItem(`sync:enableStartupRecovery`, {
  fallback: getDefaults(ConfigSchema.shape.enableStartupRecovery),
});

export const enableCheckpoints = storage.defineItem(`sync:enableCheckpoints`, {
  fallback: getDefaults(ConfigSchema.shape.enableCheckpoints),
});

// ============================================================================
// LOCAL STORAGE (specific to this device)
// ============================================================================

export const enableDebugLogging = storage.defineItem(`local:enableDebugLogging`, {
  fallback: getDefaults(ConfigSchema.shape.enableDebugLogging),
});

export const storageWarningThresholdPercent = storage.defineItem(
  `local:storageWarningThresholdPercent`,
  {
    fallback: getDefaults(ConfigSchema.shape.storageWarningThresholdPercent),
  },
);

/**
 * A collection of all defined storage items, keyed by their corresponding
 * name in the `Config` object. This is used by the ConfigManager to
 * dynamically interact with all configuration items.
 */
export const configItems = {
  timeTracking: timeTrackingConfig,
  urlFiltering: urlFilteringConfig,
  checkpoint: checkpointConfig,
  aggregation: aggregationConfig,
  ui: uiConfig,
  retentionPolicy: retentionPolicyConfig,
  eventQueue: eventQueueConfig,
  startupRecovery: startupRecoveryConfig,
  enableStartupRecovery,
  enableCheckpoints,
  enableDebugLogging,
  storageWarningThresholdPercent,
}; 