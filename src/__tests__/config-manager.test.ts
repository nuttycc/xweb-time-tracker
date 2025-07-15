import { describe, beforeEach, it, expect, vi } from 'vitest';

import { DEFAULT_CONFIG } from '@/config/constants';
import {
  configItems,
  uiConfig,
  enableDebugLogging,
} from '@/config/storage';

/**
 * Dynamically import the ConfigManager to get a fresh instance each test.
 */
async function importFreshConfigManager() {
  vi.resetModules();
  const module = await import('@/config/manager');
  return module.configManager as typeof import('@/config/manager').configManager;
}

/**
 * Helper to clear all defined storage items before each test.
 */
async function clearAllStorage() {
  const removalPromises: Promise<void>[] = [];
  for (const item of Object.values(configItems)) {
    // `removeValue` may throw if value not present; ignore such errors.
    removalPromises.push(item.removeValue().catch(() => {}));
  }
  await Promise.all(removalPromises);
}

describe('ConfigManager', () => {
  beforeEach(async () => {
    await clearAllStorage();
  });

  it('returns default configuration when storage is empty', async () => {
    const manager = await importFreshConfigManager();

    await manager.initialize();
    expect(manager.getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('merges stored values with defaults during initialization', async () => {
    // Override a single stored value before initialization
    await uiConfig.setValue({ ...DEFAULT_CONFIG.ui, defaultTheme: 'dark' });

    const manager = await importFreshConfigManager();

    await manager.initialize();
    const cfg = manager.getConfig();
    expect(cfg.ui.defaultTheme).toBe('dark');
    // Ensure other defaults remain intact
    expect(cfg.timeTracking).toEqual(DEFAULT_CONFIG.timeTracking);
  });

  it('updateConfig persists changes to storage and local cache', async () => {
    const manager = await importFreshConfigManager();
    await manager.initialize();

    // Update a primitive value
    await manager.updateConfig({ enableDebugLogging: true });

    // Value should be updated in local cache
    expect(manager.getConfig().enableDebugLogging).toBe(true);

    // Value should persist in storage
    expect(await enableDebugLogging.getValue()).toBe(true);
  });
}); 