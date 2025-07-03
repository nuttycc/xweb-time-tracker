/**
 * TabState Persistent Storage
 *
 * Implements persistent storage for TabState using wxt-storage with dual-layer architecture.
 * Provides type-safe storage operations with simple error handling.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { storage } from '#imports';
import { TabState } from '../types';
import { createLogger } from '@/utils/logger';

/**
 * Storage format for TabState data
 * Maps tabId to TabState for efficient lookup
 */
export type TabStateStorageData = Record<number, TabState>;

/**
 * Storage metadata for TabState
 */
export interface TabStateStorageMetadata {
  /** Last update timestamp */
  lastUpdated: number;
  /** Number of stored tab states */
  count: number;
  /** Storage format version */
  version: number;
}

/**
 * Default empty storage data
 */
const DEFAULT_TAB_STATES: TabStateStorageData = {};

/**
 * TabState storage item definition using wxt-storage
 */
export const tabStatesStorage = storage.defineItem<TabStateStorageData>('local:tabStates', {
  fallback: DEFAULT_TAB_STATES,
  version: 1,
});

/**
 * Storage utilities for TabState operations
 */
export class TabStateStorageUtils {
  private static readonly logger = createLogger('TabStateStorage');

  /**
   * Get all stored tab states
   */
  static async getAllTabStates(): Promise<TabStateStorageData> {
    try {
      const data = await tabStatesStorage.getValue();
      this.logger.debug('Loaded tab states from storage', {
        tabCount: Object.keys(data).length,
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to load tab states from storage', { error });
      return DEFAULT_TAB_STATES;
    }
  }

  /**
   * Save all tab states to storage
   */
  static async saveAllTabStates(tabStates: TabStateStorageData): Promise<void> {
    try {
      await tabStatesStorage.setValue(tabStates);

      // Update metadata
      await tabStatesStorage.setMeta({
        lastUpdated: Date.now(),
        count: Object.keys(tabStates).length,
        version: 1,
      });

      this.logger.debug('Saved tab states to storage', {
        tabCount: Object.keys(tabStates).length,
      });
    } catch (error) {
      this.logger.error('Failed to save tab states to storage', { error });
      throw error;
    }
  }

  /**
   * Get storage metadata
   */
  static async getStorageMetadata(): Promise<TabStateStorageMetadata | null> {
    try {
      const metadata = await tabStatesStorage.getMeta();
      return metadata as TabStateStorageMetadata | null;
    } catch (error) {
      this.logger.error('Failed to get storage metadata', { error });
      return null;
    }
  }

  /**
   * Clear all stored tab states
   */
  static async clearAllTabStates(): Promise<void> {
    try {
      await tabStatesStorage.removeValue();
      await tabStatesStorage.removeMeta();
      this.logger.info('Cleared all tab states from storage');
    } catch (error) {
      this.logger.error('Failed to clear tab states storage', { error });
      throw error;
    }
  }

  /**
   * Watch for storage changes
   */
  static watchStorageChanges(
    callback: (newData: TabStateStorageData, oldData: TabStateStorageData) => void
  ): () => void {
    return tabStatesStorage.watch(callback);
  }

  /**
   * Get storage statistics for debugging
   */
  static async getStorageStats(): Promise<{
    hasData: boolean;
    tabCount: number;
    lastUpdated: number | null;
    storageSize: number;
  }> {
    try {
      const data = await tabStatesStorage.getValue();
      const metadata = await tabStatesStorage.getMeta();
      const typedMetadata = metadata as TabStateStorageMetadata | null;

      return {
        hasData: Object.keys(data).length > 0,
        tabCount: Object.keys(data).length,
        lastUpdated: typedMetadata?.lastUpdated || null,
        storageSize: JSON.stringify(data).length,
      };
    } catch (error) {
      this.logger.error('Failed to get storage stats', { error });
      return {
        hasData: false,
        tabCount: 0,
        lastUpdated: null,
        storageSize: 0,
      };
    }
  }
}
