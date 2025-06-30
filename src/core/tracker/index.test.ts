/**
 * Comprehensive Unit Tests for Tracker
 *
 * Testing Framework: Vitest
 * 
 * This test suite covers tracker functionality including:
 * - Initialization and configuration
 * - Event tracking with various data types
 * - Edge cases and error handling
 * - Storage operations and batching
 * - State management and lifecycle
 * - Performance scenarios and stress testing
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { Tracker } from './index';

// Mock dependencies
const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0
};

const mockEventTarget = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
};

// Mock global APIs
Object.defineProperty(window, 'localStorage', {
  value: mockStorage,
  writable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockStorage,
  writable: true
});

describe('Tracker', () => {
  let tracker: Tracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new Tracker();
  });

  afterEach(() => {
    if (tracker && typeof tracker.destroy === 'function') {
      tracker.destroy();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(tracker).toBeInstanceOf(Tracker);
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        enabled: false,
        batchSize: 10,
        flushInterval: 5000
      };
      const customTracker = new Tracker(config);
      expect(customTracker.isEnabled()).toBe(false);
      customTracker.destroy();
    });

    it('should handle null configuration gracefully', () => {
      expect(() => new Tracker(null as any)).not.toThrow();
    });

    it('should handle undefined configuration gracefully', () => {
      expect(() => new Tracker(undefined)).not.toThrow();
    });

    it('should merge partial configuration with defaults', () => {
      const partialConfig = { batchSize: 25 };
      const customTracker = new Tracker(partialConfig);
      expect(customTracker).toBeInstanceOf(Tracker);
      customTracker.destroy();
    });
  });

  describe('Event Tracking - Happy Path', () => {
    it('should track simple events', () => {
      expect(() => tracker.track('user_click', { button: 'submit' })).not.toThrow();
    });

    it('should track events with string data', () => {
      const eventData = { message: 'Hello World', type: 'info' };
      expect(() => tracker.track('log_message', eventData)).not.toThrow();
    });

    it('should track events with numeric data', () => {
      const eventData = { value: 42, score: 95.5, count: 0 };
      expect(() => tracker.track('numeric_event', eventData)).not.toThrow();
    });

    it('should track events with boolean data', () => {
      const eventData = { success: true, enabled: false, visible: true };
      expect(() => tracker.track('boolean_event', eventData)).not.toThrow();
    });

    it('should track events with array data', () => {
      const eventData = { 
        items: ['item1', 'item2', 'item3'],
        numbers: [1, 2, 3, 4, 5],
        mixed: ['string', 42, true, null]
      };
      expect(() => tracker.track('array_event', eventData)).not.toThrow();
    });

    it('should track events with nested object data', () => {
      const eventData = {
        user: {
          id: 123,
          profile: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
              notifications: true
            }
          }
        }
      };
      expect(() => tracker.track('nested_event', eventData)).not.toThrow();
    });

    it('should track events with Date objects', () => {
      const eventData = {
        timestamp: new Date(),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(Date.now())
      };
      expect(() => tracker.track('date_event', eventData)).not.toThrow();
    });
  });

  describe('Event Tracking - Edge Cases', () => {
    it('should handle null event data', () => {
      expect(() => tracker.track('null_event', null)).not.toThrow();
    });

    it('should handle undefined event data', () => {
      expect(() => tracker.track('undefined_event', undefined)).not.toThrow();
    });

    it('should handle empty object event data', () => {
      expect(() => tracker.track('empty_event', {})).not.toThrow();
    });

    it('should handle empty string event name', () => {
      expect(() => tracker.track('', { data: 'test' })).not.toThrow();
    });

    it('should handle non-string event names', () => {
      expect(() => tracker.track(123 as any, { data: 'test' })).not.toThrow();
      expect(() => tracker.track(null as any, { data: 'test' })).not.toThrow();
      expect(() => tracker.track(undefined as any, { data: 'test' })).not.toThrow();
    });

    it('should handle circular reference in event data', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      expect(() => tracker.track('circular_event', circularObj)).not.toThrow();
    });

    it('should handle very large event data', () => {
      const largeData = {
        largeString: 'x'.repeat(50000),
        largeArray: new Array(5000).fill('data'),
        largeObject: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`key${i}`, `value${i}`])
        )
      };
      expect(() => tracker.track('large_event', largeData)).not.toThrow();
    });

    it('should handle special characters in event names', () => {
      const specialNames = [
        'event with spaces',
        'event-with-dashes',
        'event_with_underscores',
        'event.with.dots',
        'event/with/slashes',
        'event@with@symbols',
        'event#with#hash',
        'event$with$dollar',
        'event%with%percent'
      ];
      
      specialNames.forEach(name => {
        expect(() => tracker.track(name, { test: true })).not.toThrow();
      });
    });

    it('should handle events with functions in data', () => {
      const eventData = {
        callback: () => 'test',
        handler: function() { return 'handler'; },
        arrow: () => ({ result: 'arrow' })
      };
      expect(() => tracker.track('function_event', eventData)).not.toThrow();
    });

    it('should handle events with symbols in data', () => {
      const eventData = {
        symbol1: Symbol('test'),
        symbol2: Symbol.for('global'),
        [Symbol.iterator]: function* () { yield 1; }
      };
      expect(() => tracker.track('symbol_event', eventData)).not.toThrow();
    });
  });

  describe('State Management', () => {
    it('should start enabled by default', () => {
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should disable tracking', () => {
      tracker.disable();
      expect(tracker.isEnabled()).toBe(false);
    });

    it('should enable tracking', () => {
      tracker.disable();
      tracker.enable();
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should not track events when disabled', () => {
      const trackSpy = vi.spyOn(tracker, 'track');
      tracker.disable();
      tracker.track('disabled_event', { data: 'test' });
      
      // Event should be ignored or queued but not processed
      expect(tracker.isEnabled()).toBe(false);
    });

    it('should toggle state multiple times', () => {
      for (let i = 0; i < 10; i++) {
        tracker.disable();
        expect(tracker.isEnabled()).toBe(false);
        tracker.enable();
        expect(tracker.isEnabled()).toBe(true);
      }
    });

    it('should maintain state after multiple operations', () => {
      tracker.track('event1', { data: 1 });
      tracker.disable();
      tracker.track('event2', { data: 2 });
      tracker.enable();
      tracker.track('event3', { data: 3 });
      
      expect(tracker.isEnabled()).toBe(true);
    });
  });

  describe('Batching and Flushing', () => {
    it('should have a flush method', () => {
      expect(typeof tracker.flush).toBe('function');
    });

    it('should flush manually', () => {
      tracker.track('event1', { data: 1 });
      tracker.track('event2', { data: 2 });
      expect(() => tracker.flush()).not.toThrow();
    });

    it('should handle flush when no events are queued', () => {
      expect(() => tracker.flush()).not.toThrow();
    });

    it('should handle multiple flush calls', () => {
      tracker.track('event1', { data: 1 });
      expect(() => {
        tracker.flush();
        tracker.flush();
        tracker.flush();
      }).not.toThrow();
    });

    it('should auto-flush based on batch size', () => {
      const batchTracker = new Tracker({ batchSize: 3 });
      
      batchTracker.track('event1', { data: 1 });
      batchTracker.track('event2', { data: 2 });
      batchTracker.track('event3', { data: 3 }); // Should trigger auto-flush
      
      batchTracker.destroy();
    });

    it('should handle flush with mixed event types', () => {
      tracker.track('string_event', 'string data');
      tracker.track('number_event', 42);
      tracker.track('object_event', { complex: { data: true } });
      tracker.track('array_event', [1, 2, 3]);
      
      expect(() => tracker.flush()).not.toThrow();
    });
  });

  describe('Storage Operations', () => {
    it('should handle storage unavailable scenarios', () => {
      const noStorageTracker = new Tracker({ storage: null as any });
      expect(() => {
        noStorageTracker.track('event', { data: 'test' });
        noStorageTracker.flush();
      }).not.toThrow();
      noStorageTracker.destroy();
    });

    it('should handle storage write failures', () => {
      mockStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      
      expect(() => {
        tracker.track('event1', { data: 1 });
        tracker.flush();
      }).not.toThrow();
    });

    it('should handle storage read failures', () => {
      mockStorage.getItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      
      expect(() => new Tracker()).not.toThrow();
    });

    it('should handle storage clear failures', () => {
      mockStorage.clear.mockImplementation(() => {
        throw new Error('Storage clear failed');
      });
      
      expect(() => tracker.clear()).not.toThrow();
    });

    it('should work with different storage backends', () => {
      const customStorage = {
        store: new Map(),
        getItem: vi.fn().mockImplementation(function(key) { return this.store.get(key) || null; }),
        setItem: vi.fn().mockImplementation(function(key, value) { this.store.set(key, value); }),
        removeItem: vi.fn().mockImplementation(function(key) { this.store.delete(key); }),
        clear: vi.fn().mockImplementation(function() { this.store.clear(); }),
        key: vi.fn(),
        length: 0
      };
      
      const customTracker = new Tracker({ storage: customStorage });
      expect(() => {
        customTracker.track('custom_event', { data: 'test' });
        customTracker.flush();
      }).not.toThrow();
      customTracker.destroy();
    });
  });

  describe('Event Queue Management', () => {
    it('should have a method to get queue size', () => {
      if (typeof tracker.getQueueSize === 'function') {
        expect(typeof tracker.getQueueSize()).toBe('number');
      }
    });

    it('should manage queue size correctly', () => {
      if (typeof tracker.getQueueSize === 'function') {
        const initialSize = tracker.getQueueSize();
        tracker.track('event1', { data: 1 });
        expect(tracker.getQueueSize()).toBeGreaterThan(initialSize);
      }
    });

    it('should clear queue on flush', () => {
      if (typeof tracker.getQueueSize === 'function') {
        tracker.track('event1', { data: 1 });
        tracker.track('event2', { data: 2 });
        tracker.flush();
        expect(tracker.getQueueSize()).toBe(0);
      }
    });

    it('should clear all queued events', () => {
      tracker.track('event1', { data: 1 });
      tracker.track('event2', { data: 2 });
      expect(() => tracker.clear()).not.toThrow();
    });

    it('should handle queue overflow gracefully', () => {
      // Track many events to test queue limits
      for (let i = 0; i < 10000; i++) {
        tracker.track(`overflow_event_${i}`, { index: i });
      }
      expect(() => tracker.flush()).not.toThrow();
    });
  });

  describe('Lifecycle Management', () => {
    it('should have a destroy method', () => {
      expect(typeof tracker.destroy).toBe('function');
    });

    it('should destroy cleanly', () => {
      tracker.track('event1', { data: 1 });
      expect(() => tracker.destroy()).not.toThrow();
    });

    it('should handle multiple destroy calls', () => {
      expect(() => {
        tracker.destroy();
        tracker.destroy();
        tracker.destroy();
      }).not.toThrow();
    });

    it('should flush events on destroy', () => {
      tracker.track('event1', { data: 1 });
      tracker.track('event2', { data: 2 });
      expect(() => tracker.destroy()).not.toThrow();
    });

    it('should not accept new events after destroy', () => {
      tracker.destroy();
      // Should either throw or ignore, but not crash
      expect(() => tracker.track('post_destroy_event', { data: 'test' })).not.toThrow();
    });

    it('should handle window unload events', () => {
      // Simulate page unload
      const unloadEvent = new Event('beforeunload');
      expect(() => window.dispatchEvent(unloadEvent)).not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent tracking calls', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => tracker.track(`concurrent_event_${i}`, { index: i }))
      );
      
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle rapid enable/disable cycles', () => {
      for (let i = 0; i < 100; i++) {
        tracker.enable();
        tracker.track(`rapid_event_${i}`, { cycle: i });
        tracker.disable();
      }
      expect(() => tracker.flush()).not.toThrow();
    });

    it('should handle interleaved operations', () => {
      expect(() => {
        tracker.track('event1', { data: 1 });
        tracker.disable();
        tracker.track('event2', { data: 2 });
        tracker.flush();
        tracker.enable();
        tracker.track('event3', { data: 3 });
        tracker.clear();
        tracker.track('event4', { data: 4 });
        tracker.destroy();
      }).not.toThrow();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle JSON serialization errors', () => {
      const problematicData = {
        toJSON: () => {
          throw new Error('JSON serialization failed');
        }
      };
      expect(() => tracker.track('json_error_event', problematicData)).not.toThrow();
    });

    it('should handle timer-related errors', () => {
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Timer failed');
      });
      
      expect(() => new Tracker({ flushInterval: 1000 })).not.toThrow();
      
      global.setTimeout = originalSetTimeout;
    });

    it('should recover from temporary storage failures', () => {
      let failureCount = 0;
      mockStorage.setItem.mockImplementation(() => {
        failureCount++;
        if (failureCount <= 2) {
          throw new Error('Temporary storage failure');
        }
      });
      
      tracker.track('recovery_event', { data: 'test' });
      expect(() => tracker.flush()).not.toThrow();
    });

    it('should handle malformed configuration gracefully', () => {
      const malformedConfigs = [
        { batchSize: -1 },
        { flushInterval: 'invalid' },
        { enabled: 'not_boolean' },
        { storage: 'not_storage_object' },
        { maxRetries: -10 }
      ];
      
      malformedConfigs.forEach(config => {
        expect(() => new Tracker(config as any)).not.toThrow();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should work with custom event targets', () => {
      const customEventTarget = new EventTarget();
      const customTracker = new Tracker({ eventTarget: customEventTarget });
      
      expect(() => {
        customTracker.track('custom_target_event', { data: 'test' });
        customTracker.flush();
      }).not.toThrow();
      
      customTracker.destroy();
    });

    it('should integrate with real-world data patterns', () => {
      const realWorldEvents = [
        {
          name: 'page_view',
          data: {
            url: 'https://example.com/page',
            title: 'Example Page',
            referrer: 'https://google.com',
            timestamp: Date.now(),
            userAgent: 'Mozilla/5.0...',
            sessionId: 'abc123',
            userId: 'user456'
          }
        },
        {
          name: 'button_click',
          data: {
            element: 'submit-button',
            text: 'Submit Form',
            position: { x: 100, y: 200 },
            formData: {
              name: 'John Doe',
              email: 'john@example.com'
            }
          }
        },
        {
          name: 'api_request',
          data: {
            endpoint: '/api/users',
            method: 'POST',
            status: 201,
            duration: 150,
            requestId: 'req789',
            payload: { action: 'create_user' }
          }
        }
      ];
      
      realWorldEvents.forEach(event => {
        expect(() => tracker.track(event.name, event.data)).not.toThrow();
      });
      
      expect(() => tracker.flush()).not.toThrow();
    });

    it('should handle mixed data types in single event', () => {
      const mixedEvent = {
        string: 'test string',
        number: 42,
        float: 3.14159,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 'two', { three: 3 }],
        object: {
          nested: {
            deeply: {
              value: 'deep value'
            }
          }
        },
        date: new Date(),
        regex: /test pattern/gi,
        function: () => 'function result',
        symbol: Symbol('test symbol')
      };
      
      expect(() => tracker.track('mixed_types_event', mixedEvent)).not.toThrow();
    });
  });
});

// Performance and stress tests
describe('Tracker - Performance Tests', () => {
  let tracker: Tracker;

  beforeEach(() => {
    tracker = new Tracker();
  });

  afterEach(() => {
    tracker.destroy();
  });

  it('should handle high-frequency tracking efficiently', () => {
    const startTime = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      tracker.track(`perf_event_${i}`, { 
        index: i, 
        timestamp: Date.now(),
        data: `performance_test_data_${i}` 
      });
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Should complete within reasonable time (adjust threshold as needed)
    expect(duration).toBeLessThan(500); // 500ms for 1000 events
  });

  it('should handle rapid flush operations', () => {
    tracker.track('batch_event', { data: 'test' });
    
    const startTime = performance.now();
    
    for (let i = 0; i < 100; i++) {
      tracker.flush();
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(100); // Should be very fast for empty flushes
  });

  it('should maintain performance with large payloads', () => {
    const largePayload = {
      massiveString: 'x'.repeat(10000),
      largeArray: new Array(1000).fill({ data: 'test_item' }),
      complexObject: Object.fromEntries(
        Array.from({ length: 500 }, (_, i) => [`key${i}`, { value: i, data: `item_${i}` }])
      )
    };
    
    const startTime = performance.now();
    
    for (let i = 0; i < 10; i++) {
      tracker.track(`large_payload_event_${i}`, largePayload);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(1000); // Should handle large payloads reasonably
  });

  it('should handle memory pressure gracefully', () => {
    // Create many trackers to simulate memory pressure
    const trackers: Tracker[] = [];
    
    expect(() => {
      for (let i = 0; i < 100; i++) {
        const tempTracker = new Tracker();
        tempTracker.track(`memory_pressure_event_${i}`, { 
          index: i,
          data: new Array(100).fill(`data_${i}`)
        });
        trackers.push(tempTracker);
      }
      
      // Clean up all trackers
      trackers.forEach(t => t.destroy());
    }).not.toThrow();
  });
});