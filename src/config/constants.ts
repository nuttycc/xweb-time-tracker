/**
 * Configuration Constants
 *
 * Centralized configuration file that exports all CSPEC constants as typed objects.
 * This includes time tracking thresholds, URL filtering rules, checkpoint parameters,
 * and other configuration values from CSPEC.
 *
 */

import { z } from 'zod/v4';

// ============================================================================
// 4.1 Time Tracking Engine Parameters
// ============================================================================

/**
 * Inactive timeout threshold for regular content (milliseconds)
 */
export const INACTIVE_TIMEOUT_DEFAULT = 30000; // 30s

/**
 * Inactive timeout threshold when audio content is playing (milliseconds)
 */
export const INACTIVE_TIMEOUT_MEDIA = 300000; // 5min

/**
 * Minimum scroll distance in pixels required to trigger Active Time
 */
export const SCROLL_THRESHOLD_PIXELS = 20;

/**
 * Minimum mouse movement distance in pixels required to trigger Active Time
 */
export const MOUSEMOVE_THRESHOLD_PIXELS = 10;

// ============================================================================
// 4.2 URL Filtering Rules Parameters
// ============================================================================

/**
 * Default list of hostnames to be completely ignored by time tracking engine
 */
export const IGNORED_HOSTNAMES_DEFAULT = ['newtab', 'extensions', 'localhost'] as const;

/**
 * Default list of URL query parameters to be removed during URL normalization
 * Covers most common marketing and advertising tracking parameters
 */
export const IGNORED_QUERY_PARAMS_DEFAULT = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
] as const;

// ============================================================================
// 4.3 Data Lifecycle & Storage Parameters
// ============================================================================

/**
 * Default retention policy for raw event logs
 */
export const RETENTION_POLICY_DEFAULT = 'immediate' as const;

/**
 * Available retention policy options
 */
export const RETENTION_POLICY_OPTIONS = ['immediate', 'short', 'long', 'permanent'] as const;

/**
 * Number of days for short-term retention policy
 */
export const RETENTION_POLICY_SHORT_DAYS = 7;

/**
 * Number of days for long-term retention policy
 */
export const RETENTION_POLICY_LONG_DAYS = 30;

/**
 * Storage usage percentage threshold that triggers warning
 */
export const STORAGE_WARNING_THRESHOLD_PERCENT = 80;

// ============================================================================
// 4.4 Checkpoint & Aggregation Task Parameters
// ============================================================================

/**
 * Active Time threshold that triggers checkpoint generation (milliseconds)
 */
export const CHECKPOINT_ACTIVE_TIME_THRESHOLD = 1 * 60 * 1000; // 1min

/**
 * Open Time threshold that triggers checkpoint generation (milliseconds)
 */
export const CHECKPOINT_OPEN_TIME_THRESHOLD = 3 * 60 * 1000; // 3min

/**
 * Interval for periodic checkpoint checking task (milliseconds)
 */
export const CHECKPOINT_INTERVAL = 5 * 60 * 1000; // 5min

/**
 * Interval for data aggregation task execution (milliseconds)
 */
export const AGGREGATION_INTERVAL = 10 * 60 * 1000; // 10min

// ============================================================================
// 4.5 User Interface & Experience Parameters
// ============================================================================

/**
 * Default time range selection for data query interface
 */
export const DEFAULT_TIME_RANGE = 'today' as const;

/**
 * Available time range options
 */
export const TIME_RANGE_OPTIONS = [
  'today',
  'yesterday',
  'last7days',
  'thisMonth',
  'lastMonth',
] as const;

/**
 * Default UI theme
 */
export const UI_THEME_DEFAULT = 'auto' as const;

/**
 * Available UI theme options
 */
export const UI_THEME_OPTIONS = ['light', 'dark', 'auto'] as const;

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Schema for time tracking configuration
 */
export const TimeTrackingConfigSchema = z.object({
  inactiveTimeoutDefault: z.number().int().min(5000).max(300000),
  inactiveTimeoutMedia: z.number().int().min(60000).max(1800000),
  scrollThresholdPixels: z.number().int().min(5).max(100),
  mousemoveThresholdPixels: z.number().int().min(3).max(50),
});

/**
 * Schema for URL filtering configuration
 */
export const UrlFilteringConfigSchema = z.object({
  ignoredHostnames: z.array(z.string()),
  ignoredQueryParams: z.array(z.string()),
});

/**
 * Schema for checkpoint configuration
 */
export const CheckpointConfigSchema = z.object({
  activeTimeThreshold: z.number().int().min(1_800_000).max(28_800_000), // 0.5h to 8h in ms
  openTimeThreshold: z.number().int().min(3_600_000).max(86_400_000), // 1h to 24h in ms
  interval: z.number().int().min(300_000).max(7_200_000), // 5min to 120min in ms
});

/**
 * Schema for retention policy configuration
 */
export const RetentionPolicyConfigSchema = z.object({
  policy: z.enum(['immediate', 'short', 'long', 'permanent']),
  shortDays: z.number().int().min(1).max(30),
  longDays: z.number().int().min(7).max(365),
});

/**
 * Complete configuration schema
 */
export const ConfigSchema = z.object({
  timeTracking: TimeTrackingConfigSchema,
  urlFiltering: UrlFilteringConfigSchema,
  checkpoint: CheckpointConfigSchema,
  retentionPolicy: RetentionPolicyConfigSchema,
});

// ============================================================================
// Type Exports
// ============================================================================

export type TimeTrackingConfig = z.infer<typeof TimeTrackingConfigSchema>;
export type UrlFilteringConfig = z.infer<typeof UrlFilteringConfigSchema>;
export type CheckpointConfig = z.infer<typeof CheckpointConfigSchema>;
export type RetentionPolicyConfig = z.infer<typeof RetentionPolicyConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export type RetentionPolicy = (typeof RETENTION_POLICY_OPTIONS)[number];
export type TimeRange = (typeof TIME_RANGE_OPTIONS)[number];
export type UITheme = (typeof UI_THEME_OPTIONS)[number];

// ============================================================================
// Default Configuration Object
// ============================================================================

/**
 * Default configuration object with all CSPEC values
 */
export const DEFAULT_CONFIG: Config = {
  timeTracking: {
    inactiveTimeoutDefault: INACTIVE_TIMEOUT_DEFAULT,
    inactiveTimeoutMedia: INACTIVE_TIMEOUT_MEDIA,
    scrollThresholdPixels: SCROLL_THRESHOLD_PIXELS,
    mousemoveThresholdPixels: MOUSEMOVE_THRESHOLD_PIXELS,
  },
  urlFiltering: {
    ignoredHostnames: [...IGNORED_HOSTNAMES_DEFAULT],
    ignoredQueryParams: [...IGNORED_QUERY_PARAMS_DEFAULT],
  },
  checkpoint: {
    activeTimeThreshold: CHECKPOINT_ACTIVE_TIME_THRESHOLD,
    openTimeThreshold: CHECKPOINT_OPEN_TIME_THRESHOLD,
    interval: CHECKPOINT_INTERVAL,
  },
  retentionPolicy: {
    policy: RETENTION_POLICY_DEFAULT,
    shortDays: RETENTION_POLICY_SHORT_DAYS,
    longDays: RETENTION_POLICY_LONG_DAYS,
  },
};

/**
 * Validates and parses a configuration object using the CSPEC configuration schema.
 *
 * Ensures the provided configuration matches the expected structure and types, returning a fully typed configuration object if valid.
 *
 * @returns The validated configuration object
 * @throws If the configuration does not conform to the schema
 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config);
}
