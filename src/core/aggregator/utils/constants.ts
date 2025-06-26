/**
 * Aggregation Task Scheduling Configuration
 *
 * This file defines configuration constants for the aggregation task scheduling system.
 * Configuration items are categorized by user accessibility.
 */

// ==================== USER CONFIGURABLE SETTINGS ====================
// These settings can be modified by users through the UI

/**
 * Data retention period for processed events
 * 🔧 USER CONFIGURABLE: Yes
 * 📊 Default: 30 days
 * 📏 Range: 1-365 days
 * 💾 Storage Key: sync:pruner_retention_days
 */
export const DEFAULT_PRUNER_RETENTION_DAYS = 30;
export const PRUNER_RETENTION_DAYS_KEY = 'sync:pruner_retention_days';

/**
 * Aggregation task execution interval
 * 🔧 USER CONFIGURABLE: Yes (for advanced users)
 * 📊 Default: 60 minutes
 * 📏 Range: 10-240 minutes
 * 💾 Storage Key: sync:scheduler_period
 */
export const DEFAULT_AGGREGATION_INTERVAL_MINUTES = 60;
export const SCHEDULER_PERIOD_MINUTES_KEY = 'sync:scheduler_period';

// ==================== SYSTEM INTERNAL SETTINGS ====================
// These settings are managed by the system and not exposed to users

/**
 * Chrome alarm identifier for aggregation tasks
 * 🔧 USER CONFIGURABLE: No (System internal)
 */
export const AGGREGATION_ALARM_NAME = 'aggregateData';

/**
 * Aggregation task execution lock to prevent concurrent runs
 * 🔧 USER CONFIGURABLE: No (System internal)
 * ⏱️ TTL: 5 minutes
 * 💾 Storage: local (runtime state, should not sync across devices)
 */
export const AGGREGATION_LOCK_KEY = 'local:aggregation_lock';
export const AGGREGATION_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
