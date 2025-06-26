/**
 * Data Aggregation Module
 *
 * This module provides comprehensive data aggregation functionality for the WebTime tracker,
 * including event processing, scheduling, data pruning, and service management.
 *
 * @example
 * ```typescript
 * // Import main components
 * import { AggregationEngine, AggregationScheduler, DataPruner } from '@/core/aggregator';
 *
 * // Import types and constants
 * import { AggregatorTypes, AggregatorConstants } from '@/core/aggregator';
 *
 * // Or import specific items
 * import { DEFAULT_PRUNER_RETENTION_DAYS, AGGREGATION_ALARM_NAME } from '@/core/aggregator';
 * ```
 */

// ============================================================================
// MAIN COMPONENTS - Direct exports for primary aggregation components
// ============================================================================

/**
 * Core aggregation engine for processing raw event logs into statistical data
 */
export { AggregationEngine } from './engine';

/**
 * Scheduler for managing automated aggregation tasks using Chrome alarms API
 */
export { AggregationScheduler } from './scheduler';

/**
 * Data pruner for cleaning up old processed event logs
 */
export { DataPruner } from './pruner';

/**
 * Main service for coordinating aggregation components
 */
export { AggregationService } from './services';

// ============================================================================
// TYPES AND INTERFACES - Namespaced exports to avoid conflicts
// ============================================================================

/**
 * Type definitions for the aggregation module
 *
 * @example
 * ```typescript
 * import { AggregatorTypes } from '@/core/aggregator';
 * type Result = AggregatorTypes.AggregationResult;
 * ```
 */
export * as AggregatorTypes from './utils/types';

// ============================================================================
// CONSTANTS - Named exports for better discoverability
// ============================================================================

/**
 * Configuration constants for data retention and scheduling
 */
export {
  DEFAULT_PRUNER_RETENTION_DAYS,
  PRUNER_RETENTION_DAYS_KEY,
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
  AGGREGATION_LOCK_TTL_MS,
  SCHEDULER_PERIOD_MINUTES_KEY,
} from './utils/constants';

// ============================================================================
// CONVENIENCE RE-EXPORTS - For commonly used types
// ============================================================================

/**
 * Re-export commonly used types for convenience
 */
export type { AggregationResult, VisitGroup, AggregatedData, Logger } from './utils/types';

/**
 * Re-export scheduler options interface
 */
export type { SchedulerOptions } from './scheduler';
