/**
 * Dexie Hooks Implementation
 *
 * This file implements Dexie hooks for automatic metadata management,
 * Include: aggregatedstats table's last_updated field.
 */

import type { Transaction } from 'dexie';
import type { AggregatedStatsRecord } from './aggregatedstats.schema';

/**
 * Hook function for creating aggregated stats records
 * Automatically sets the last_updated field to current Unix timestamp
 *
 * @param _primKey - Primary key of the record being created (unused but required by Dexie)
 * @param obj - The record object being created
 * @param _trans - Dexie transaction context (unused but required by Dexie)
 */
export function aggregatedStatsCreatingHook(
  _primKey: string,
  obj: AggregatedStatsRecord,
  _trans: Transaction
): void {
  // Set last_updated to current Unix timestamp (milliseconds)
  obj.last_updated = Date.now();
}

/**
 * Hook function for updating aggregated stats records
 * Automatically updates the last_updated field to current Unix timestamp
 *
 * @param modifications - Object containing the modifications being made
 * @param _primKey - Primary key of the record being updated (unused but required by Dexie)
 * @param _obj - The current record object (unused but required by Dexie)
 * @param _trans - Dexie transaction context (unused but required by Dexie)
 */
export function aggregatedStatsUpdatingHook(
  modifications: Partial<AggregatedStatsRecord>,
  _primKey: string,
  _obj: AggregatedStatsRecord,
  _trans: Transaction
): void {
  // Always update last_updated when any modification occurs (Unix timestamp in milliseconds)
  modifications.last_updated = Date.now();
}

/**
 * Type definitions for Dexie hook functions
 * These ensure proper typing when registering hooks
 */
export type DexieCreatingHook<T, TKey> = (primKey: TKey, obj: T, trans: Transaction) => void;

export type DexieUpdatingHook<T, TKey> = (
  modifications: Partial<T>,
  primKey: TKey,
  obj: T,
  trans: Transaction
) => void;
