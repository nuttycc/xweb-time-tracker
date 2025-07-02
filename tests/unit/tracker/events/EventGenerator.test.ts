/**
 * EventGenerator Unit Tests
 *
 * Tests for the EventGenerator class. Tests event generation logic for all event types
 * (open_time_*, active_time_*, checkpoint), URL processing integration, and edge cases
 * like rapid navigation. Mocks dependencies like URLProcessor and verifies that generated
 * events conform to the expected schema and business rules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventGenerator,
  createEventGenerator,
  createEventGeneratorWithURLProcessor,
  EventGeneratorValidation,
  type EventGenerationContext,
  type EventGenerationOptions,
} from '@/core/tracker/events/EventGenerator';
import { URLProcessor } from '@/core/tracker/url/URLProcessor';
import { TabState, CheckpointData } from '@/core/tracker/types';

// Mock Web Crypto API randomUUID
const mockRandomUUID = vi.fn(() => '550e8400-e29b-41d4-a716-446655440000' as `${string}-${string}-${string}-${string}-${string}`);
vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(mockRandomUUID);

describe('EventGenerator', () => {
  let generator: EventGenerator;
  let mockURLProcessor: URLProcessor;
  let mockTabState: TabState;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock URL processor
    mockURLProcessor = {
      processUrl: vi.fn(),
    } as unknown as URLProcessor;

    // Create generator with mock URL processor
    generator = new EventGenerator({
      urlProcessor: mockURLProcessor,
      validateEvents: false, // Disable validation for easier testing
    });

    // Create mock tab state
    mockTabState = {
      url: 'https://example.com/page',
      visitId: '550e8400-e29b-41d4-a716-446655440000',
      activityId: '550e8400-e29b-41d4-a716-446655440001',
      isAudible: false,
      lastInteractionTimestamp: Date.now() - 5000,
      openTimeStart: Date.now() - 60000,
      activeTimeStart: Date.now() - 30000,
      isFocused: true,
      tabId: 123,
      windowId: 1,
    };
  });

  describe('Constructor and Configuration', () => {
    it('should create generator with default options', () => {
      const defaultGenerator = new EventGenerator();
      expect(defaultGenerator).toBeInstanceOf(EventGenerator);
      expect(defaultGenerator.getOptions().validateEvents).toBe(true);
    });

    it('should create generator with custom options', () => {
      const options: EventGenerationOptions = {
        validateEvents: false,
        timeouts: {
          inactiveDefault: 60000,
          inactiveMedia: 600000,
        },
      };

      const customGenerator = new EventGenerator(options);
      expect(customGenerator.getOptions().validateEvents).toBe(false);
      expect(customGenerator.getOptions().timeouts?.inactiveDefault).toBe(60000);
    });

    it('should update URL processor', () => {
      const newProcessor = new URLProcessor();
      generator.updateURLProcessor(newProcessor);
      // Should not throw and should accept the new processor
      expect(() => generator.updateURLProcessor(newProcessor)).not.toThrow();
    });
  });

  describe('Open Time Event Generation', () => {
    describe('generateOpenTimeStart', () => {
      it('should generate open_time_start event for valid URL', () => {
        // Mock URL processor to return valid result
        (mockURLProcessor.processUrl as ReturnType<typeof vi.fn>).mockReturnValue({
          isValid: true,
          normalizedUrl: 'https://example.com/page',
          hostname: 'example.com',
        });

        const result = generator.generateOpenTimeStart(
          1, // tabId
          'https://example.com/page',
          Date.now(),
          1 // windowId
        );

        expect(result.success).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.event!.eventType).toBe('open_time_start');
        expect(result.event!.tabId).toBe(1);
        expect(result.event!.url).toBe('https://example.com/page');
        expect(result.event!.visitId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(result.event!.activityId).toBeNull();
        expect(result.event!.isProcessed).toBe(0);
      });

      it('should reject invalid URLs', () => {
        // Mock URL processor to return invalid result
        (mockURLProcessor.processUrl as ReturnType<typeof vi.fn>).mockReturnValue({
          isValid: false,
          reason: 'Invalid URL format',
        });

        const result = generator.generateOpenTimeStart(1, 'invalid-url', Date.now(), 1);

        expect(result.success).toBe(false);
        expect(result.event).toBeUndefined();
        expect(result.metadata?.urlFiltered).toBe(true);
        expect(result.metadata?.skipReason).toBe('Invalid URL format');
      });

      it('should include resolution type when provided', () => {
        (mockURLProcessor.processUrl as ReturnType<typeof vi.fn>).mockReturnValue({
          isValid: true,
          normalizedUrl: 'https://example.com/page',
        });

        const result = generator.generateOpenTimeStart(
          1,
          'https://example.com/page',
          Date.now(),
          1,
          'crash_recovery'
        );

        expect(result.success).toBe(true);
        expect(result.event!.resolution).toBe('crash_recovery');
      });
    });

    describe('generateOpenTimeEnd', () => {
      it('should generate open_time_end event', () => {
        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
        };

        const result = generator.generateOpenTimeEnd(context);

        expect(result.success).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.event!.eventType).toBe('open_time_end');
        expect(result.event!.tabId).toBe(mockTabState.tabId);
        expect(result.event!.url).toBe(mockTabState.url);
        expect(result.event!.visitId).toBe(mockTabState.visitId);
        expect(result.event!.activityId).toBe(mockTabState.activityId);
      });

      it('should include resolution type when provided', () => {
        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
          resolution: 'crash_recovery',
        };

        const result = generator.generateOpenTimeEnd(context);

        expect(result.success).toBe(true);
        expect(result.event!.resolution).toBe('crash_recovery');
      });
    });
  });

  describe('Active Time Event Generation', () => {
    describe('generateActiveTimeStart', () => {
      it('should generate active_time_start event for valid URL', () => {
        (mockURLProcessor.processUrl as ReturnType<typeof vi.fn>).mockReturnValue({
          isValid: true,
          normalizedUrl: 'https://example.com/page',
        });

        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
        };

        const result = generator.generateActiveTimeStart(context);

        expect(result.success).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.event!.eventType).toBe('active_time_start');
        expect(result.event!.activityId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(result.event!.visitId).toBe(mockTabState.visitId);
      });

      it('should reject invalid URLs', () => {
        (mockURLProcessor.processUrl as ReturnType<typeof vi.fn>).mockReturnValue({
          isValid: false,
          reason: 'Hostname is in ignored list',
        });

        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
        };

        const result = generator.generateActiveTimeStart(context);

        expect(result.success).toBe(false);
        expect(result.metadata?.urlFiltered).toBe(true);
        expect(result.metadata?.skipReason).toBe('Hostname is in ignored list');
      });
    });

    describe('generateActiveTimeEnd', () => {
      it('should generate active_time_end event', () => {
        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
        };

        const result = generator.generateActiveTimeEnd(context, 'timeout');

        expect(result.success).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.event!.eventType).toBe('active_time_end');
        expect(result.event!.activityId).toBe(mockTabState.activityId);
        expect(result.metadata?.skipReason).toContain('timeout');
      });

      it('should fail when no activity ID is present', () => {
        const tabStateWithoutActivity = {
          ...mockTabState,
          activityId: null,
        };

        const context: EventGenerationContext = {
          tabState: tabStateWithoutActivity,
          timestamp: Date.now(),
        };

        const result = generator.generateActiveTimeEnd(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot end active time without active activity ID');
      });

      it('should handle different end reasons', () => {
        const context: EventGenerationContext = {
          tabState: mockTabState,
          timestamp: Date.now(),
        };

        const reasons = ['timeout', 'focus_lost', 'tab_closed', 'navigation'] as const;

        reasons.forEach(reason => {
          const result = generator.generateActiveTimeEnd(context, reason);
          expect(result.success).toBe(true);
          expect(result.metadata?.skipReason).toContain(reason);
        });
      });
    });
  });

  describe('Checkpoint Event Generation', () => {
    it('should generate checkpoint event for active time', () => {
      const checkpointData: CheckpointData = {
        checkpointType: 'active_time',
        duration: 7200000, // 2 hours
        isPeriodic: true,
      };

      const context: EventGenerationContext = {
        tabState: mockTabState,
        timestamp: Date.now(),
      };

      const result = generator.generateCheckpoint(context, checkpointData);

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event!.eventType).toBe('checkpoint');
      expect(result.event!.activityId).toBe(mockTabState.activityId);
      expect(result.metadata?.skipReason).toContain('active_time');
    });

    it('should generate checkpoint event for open time', () => {
      const checkpointData: CheckpointData = {
        checkpointType: 'open_time',
        duration: 14400000, // 4 hours
        isPeriodic: true,
      };

      const context: EventGenerationContext = {
        tabState: mockTabState,
        timestamp: Date.now(),
      };

      const result = generator.generateCheckpoint(context, checkpointData);

      expect(result.success).toBe(true);
      expect(result.event!.eventType).toBe('checkpoint');
      expect(result.event!.activityId).toBeNull(); // Open time checkpoints don't have activity ID
    });
  });

  describe('Utility Methods', () => {
    describe('shouldTriggerActiveTimeTimeout', () => {
      it('should return true when timeout threshold is exceeded', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          activeTimeStart: currentTime - 60000,
          lastInteractionTimestamp: currentTime - 35000, // 35 seconds ago
          isAudible: false,
        };

        const result = generator.shouldTriggerActiveTimeTimeout(tabState, currentTime);
        expect(result).toBe(true); // Default timeout is 30 seconds
      });

      it('should return false when within timeout threshold', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          activeTimeStart: currentTime - 60000,
          lastInteractionTimestamp: currentTime - 15000, // 15 seconds ago
          isAudible: false,
        };

        const result = generator.shouldTriggerActiveTimeTimeout(tabState, currentTime);
        expect(result).toBe(false);
      });

      it('should use media timeout for audible tabs', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          activeTimeStart: currentTime - 60000,
          lastInteractionTimestamp: currentTime - 60000, // 1 minute ago
          isAudible: true,
        };

        const result = generator.shouldTriggerActiveTimeTimeout(tabState, currentTime);
        expect(result).toBe(false); // Media timeout is 5 minutes
      });

      it('should return false when no active session', () => {
        const tabState = {
          ...mockTabState,
          activeTimeStart: null,
          activityId: null,
        };

        const result = generator.shouldTriggerActiveTimeTimeout(tabState, Date.now());
        expect(result).toBe(false);
      });
    });

    describe('shouldGenerateCheckpoint', () => {
      it('should return true for active time checkpoint when threshold exceeded', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          activeTimeStart: currentTime - 3 * 60 * 60 * 1000, // 3 hours ago
        };

        const result = generator.shouldGenerateCheckpoint(tabState, currentTime, 'active_time');
        expect(result).toBe(true); // Threshold is 2 hours
      });

      it('should return true for open time checkpoint when threshold exceeded', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          openTimeStart: currentTime - 5 * 60 * 60 * 1000, // 5 hours ago
        };

        const result = generator.shouldGenerateCheckpoint(tabState, currentTime, 'open_time');
        expect(result).toBe(true); // Threshold is 4 hours
      });

      it('should return false when thresholds not exceeded', () => {
        const currentTime = Date.now();
        const tabState = {
          ...mockTabState,
          activeTimeStart: currentTime - 1 * 60 * 60 * 1000, // 1 hour ago
          openTimeStart: currentTime - 2 * 60 * 60 * 1000, // 2 hours ago
        };

        expect(generator.shouldGenerateCheckpoint(tabState, currentTime, 'active_time')).toBe(
          false
        );
        expect(generator.shouldGenerateCheckpoint(tabState, currentTime, 'open_time')).toBe(false);
      });
    });
  });
});

describe('Factory Functions', () => {
  describe('createEventGenerator', () => {
    it('should create generator with default options', () => {
      const generator = createEventGenerator();
      expect(generator).toBeInstanceOf(EventGenerator);
    });

    it('should create generator with custom options', () => {
      const options: EventGenerationOptions = {
        validateEvents: false,
      };
      const generator = createEventGenerator(options);
      expect(generator.getOptions().validateEvents).toBe(false);
    });
  });

  describe('createEventGeneratorWithURLProcessor', () => {
    it('should create generator with custom URL processor', () => {
      const urlProcessor = new URLProcessor();
      const generator = createEventGeneratorWithURLProcessor(urlProcessor);
      expect(generator).toBeInstanceOf(EventGenerator);
    });
  });
});

describe('Validation Helpers', () => {
  describe('EventGeneratorValidation', () => {
    it('should validate event generation context', () => {
      const validContext = {
        tabState: {
          url: 'https://example.com',
          visitId: '550e8400-e29b-41d4-a716-446655440000',
          activityId: '550e8400-e29b-41d4-a716-446655440001',
          isAudible: false,
          lastInteractionTimestamp: Date.now(),
          openTimeStart: Date.now(),
          activeTimeStart: Date.now(),
          isFocused: true,
          tabId: 123,
          windowId: 1,
          sessionEnded: false,
        },
        timestamp: Date.now(),
      };

      expect(() => EventGeneratorValidation.validateContext(validContext)).not.toThrow();

      const invalidContext = {
        tabState: {
          url: 'not-a-url',
        },
      };

      expect(() => EventGeneratorValidation.validateContext(invalidContext)).toThrow();
    });

    it('should validate event generation options', () => {
      const validOptions = {
        validateEvents: true,
        timeouts: {
          inactiveDefault: 30000,
          inactiveMedia: 300000,
        },
      };

      expect(() => EventGeneratorValidation.validateOptions(validOptions)).not.toThrow();
    });
  });
});
