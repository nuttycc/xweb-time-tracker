import { beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import 'fake-indexeddb/auto';

beforeEach(() => {
  // Reset fake browser state
  // Ref: https://webext-core.aklinker1.io/fake-browser/reseting-state
  fakeBrowser.reset();
  
  // Clean up IndexedDB state
  if (typeof indexedDB !== 'undefined') {
    // fake-indexeddb will automatically handle cleanup
  }
  
  // Reset console state (to avoid interference between tests)
  if (typeof console !== 'undefined') {
    console.clear?.();
  }
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Set test environment variables
Object.assign(globalThis, {
  __APP_NAME__: 'webtime-test',
  __APP_VERSION__: '0.0.0-test',
});
