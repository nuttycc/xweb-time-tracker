/**
 * Mock for WXT #imports
 *
 * This file provides mock implementations for WXT's auto-imported modules
 * to enable testing in environments where WXT's import resolution is not available.
 */

import { vi } from 'vitest';

// Mock storage API
export const storage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  watch: vi.fn(),
};

// Mock browser API
export const browser = {
  tabs: {
    query: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  windows: {
    onFocusChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
};

// Mock defineBackground
export const defineBackground = vi.fn((callback: () => void) => {
  return callback;
});

// Mock defineContentScript
export const defineContentScript = vi.fn((config: unknown) => {
  return config;
});

// Mock other common WXT utilities
export const defineUnlistedScript = vi.fn();
export const definePopup = vi.fn();
export const defineOptions = vi.fn();
