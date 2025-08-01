import { z } from 'zod/v4';
import { getDefaults } from '../utils/zod-defaults';

// ============================================================================
// System Static Constants
// ============================================================================
// These are constants that are not part of the user-configurable settings,
// such as storage keys or system identifiers.

export const SCHEDULER_PERIOD_MINUTES_KEY = 'sync:scheduler_period';
export const AGGREGATION_ALARM_NAME = 'aggregateData';
export const AGGREGATION_LOCK_KEY = 'local:aggregation_lock';

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Schema for time tracking configuration
 */
export const TimeTrackingConfigSchema = z.object({
  inactiveTimeoutDefault: z.number().int().default(30000), // 30s
  inactiveTimeoutMedia: z.number().int().default(300000), // 5min
  scrollThresholdPixels: z.number().int().default(20),
  mousemoveThresholdPixels: z.number().int().default(10),
});

/**
 * Schema for URL filtering configuration
 */
export const UrlFilteringConfigSchema = z.object({
  ignoredHostnames: z.array(z.string()).default(['newtab', 'extensions', 'localhost']),
  ignoredQueryParams: z
    .array(z.string())
    .default([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
    ]),
});

/**
 * Schema for checkpoint configuration
 */
export const CheckpointConfigSchema = z.object({
  activeTimeThreshold: z
    .number()
    .int()
    .default(1 * 60 * 1000), // 1min, ms
  openTimeThreshold: z
    .number()
    .int()
    .default(2 * 60 * 1000), // 2min, ms
  interval: z.number().int().default(3), // 3min (chrome alarm interval)
});

/**
 * Schema for aggregation configuration
 */
export const AggregationConfigSchema = z.object({
  interval: z.number().int().default(5), // 5min (chrome alarm interval)
  /** TTL for the aggregation lock to prevent concurrent runs (in milliseconds). */
  lockTtlMs: z
    .number()
    .int()
    .default(5 * 60 * 1000), // 5 minutes
});

/**
 * Schema for UI configuration
 */
export const UIConfigSchema = z.object({
  defaultTimeRange: z
    .enum(['today', 'yesterday', 'last7days', 'thisMonth', 'lastMonth'])
    .default('today'),
  defaultTheme: z.enum(['light', 'dark', 'auto']).default('auto'),
});

/**
 * Schema for retention policy configuration
 */
export const RetentionPolicyConfigSchema = z.object({
  policy: z.enum(['immediate', 'short', 'long', 'permanent']).default('immediate'),
  shortDays: z.number().int().default(7),
  longDays: z.number().int().default(30),
});

/**
 * Schema for event queue configuration
 */
export const EventQueueConfigSchema = z.object({
  maxQueueSize: z.number().int().default(100),
  maxWaitTime: z.number().int().default(5000),
  maxRetries: z.number().int().default(3),
});

/**
 * Schema for startup recovery configuration
 */
export const StartupRecoveryConfigSchema = z.object({
  maxSessionAge: z.number().int().default(86_400_000), // 24 hours
});

/**
 * Complete configuration schema
 */
export const ConfigSchema = z.object({
  enableDebugLogging: z.boolean().default(false),
  enableStartupRecovery: z.boolean().default(true),
  enableCheckpoints: z.boolean().default(true),
  timeTracking: TimeTrackingConfigSchema,
  urlFiltering: UrlFilteringConfigSchema,
  checkpoint: CheckpointConfigSchema,
  aggregation: AggregationConfigSchema,
  ui: UIConfigSchema,
  retentionPolicy: RetentionPolicyConfigSchema,
  eventQueue: EventQueueConfigSchema,
  startupRecovery: StartupRecoveryConfigSchema,
  storageWarningThresholdPercent: z.number().int().default(80),
});

// ============================================================================
// Type Exports
// ============================================================================

export type TimeTrackingConfig = z.infer<typeof TimeTrackingConfigSchema>;
export type UrlFilteringConfig = z.infer<typeof UrlFilteringConfigSchema>;
export type CheckpointConfig = z.infer<typeof CheckpointConfigSchema>;
export type RetentionPolicyConfig = z.infer<typeof RetentionPolicyConfigSchema>;
export type EventQueueConfig = z.infer<typeof EventQueueConfigSchema>;
export type StartupRecoveryConfig = z.infer<typeof StartupRecoveryConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export const RETENTION_POLICY_OPTIONS = Object.values(
  RetentionPolicyConfigSchema.shape.policy.unwrap().enum
);
export type RetentionPolicy = z.infer<typeof RetentionPolicyConfigSchema>['policy'];
export type TimeRange = z.infer<typeof UIConfigSchema>['defaultTimeRange'];
export type UITheme = z.infer<typeof UIConfigSchema>['defaultTheme'];

// ============================================================================
// Default Configuration Object
// ============================================================================

/**
 * Default configuration object with all CSPEC values,
 * safely derived from the Zod schemas.
 */
export const DEFAULT_CONFIG: Config = getDefaults(ConfigSchema);

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
