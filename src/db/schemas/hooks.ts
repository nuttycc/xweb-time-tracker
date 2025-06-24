/**
 * Dexie Hooks Implementation
 *
 * This file implements Dexie hooks for automatic metadata management,
 * Include: aggregatedstats table's last_updated field.
 */

import type { Transaction } from 'dexie';
import type { AggregatedStatsRecord } from './aggregatedstats.schema';

/**
 * Sets the `last_updated` field to the current Unix timestamp when creating a new aggregated stats record.
 *
 * @param obj - The record object being created; its `last_updated` property is set in-place.
 */
export function aggregatedStatsCreatingHook(
  _primKey: string, // Required by Dexie.js hook signature but not used in this implementation
  obj: AggregatedStatsRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _trans: Transaction // Required by Dexie.js hook signature but not used in this implementation
): void {
  // Set last_updated to current Unix timestamp (milliseconds)
  obj.last_updated = Date.now();
}

/**
 * Dexie updating hook that sets the `last_updated` field to the current Unix timestamp when aggregated stats records are modified.
 *
 * Ensures the `last_updated` metadata reflects the time of the most recent update.
 *
 * @param modifications - The fields being updated in the record; modified in-place to include the new timestamp.
 */
export function aggregatedStatsUpdatingHook(
  modifications: Partial<AggregatedStatsRecord>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _primKey: string, // Required by Dexie.js hook signature but not used in this implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _obj: AggregatedStatsRecord, // Required by Dexie.js hook signature but not used in this implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _trans: Transaction // Required by Dexie.js hook signature but not used in this implementation
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
