/**
 * Vitest Test Setup
 *
 * Global test setup configuration for the WebTime Tracker project.
 * This file is executed before all tests run.
 */

import { expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// Global test configuration
beforeEach(() => {
  // Clear any existing IndexedDB data before each test
  if (typeof indexedDB !== 'undefined') {
    // Reset IndexedDB state for clean test isolation
    const databases = ['WebTimeTracker', 'test-db'];
    databases.forEach(dbName => {
      try {
        indexedDB.deleteDatabase(dbName);
      } catch (_error) {
        // Ignore errors during cleanup
      }
    });
  }
});

afterEach(() => {
  // Additional cleanup after each test if needed
});

// Global test utilities - Vitest custom matcher types
declare module 'vitest' {
  interface Matchers {
    toBeValidUUID(): void;
    toBeValidTimestamp(): void;
  }
}

// Custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid UUID`
          : `Expected ${received} to be a valid UUID`,
    };
  },

  toBeValidTimestamp(received: number) {
    const pass = typeof received === 'number' && received > 0 && received <= Date.now() + 1000; // Allow 1 second future tolerance

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid timestamp`
          : `Expected ${received} to be a valid timestamp`,
    };
  },
});
