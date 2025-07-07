export { AggregationEngine } from './AggregationEngine';
export { AggregationScheduler } from './AggregationScheduler';
export { DataPruner } from './DataPruner';
export { AggregationService } from './AggregationService';


// ============================================================================
// TYPES AND INTERFACES - Namespaced exports to avoid conflicts
// ============================================================================

export * as AggregatorTypes from './types';

/**
 * Re-export commonly used types for convenience
 */
export type { AggregationResult, VisitGroup, AggregatedData } from './types';

/**
 * Re-export scheduler options interface
 */
export type { SchedulerOptions } from './AggregationScheduler';
