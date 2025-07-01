/**
 * AggregationScheduler Unit Tests (WXT Standard)
 *
 * Tests for the aggregation scheduler functionality using WXT testing standards.
 * Uses fakeBrowser and WXT storage without manual mocking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import type { AggregationEngine } from '@/core/aggregator/engine/AggregationEngine';
import type { DataPruner } from '@/core/aggregator/pruner/DataPruner';
import type { AggregationResult } from '@/core/aggregator/utils/types';
import type { EmojiLogger } from '@/utils/logger-emoji';
import { LogCategory } from '@/utils/logger-emoji';
import { createMockEmojiLogger, expectEmojiLog } from '../../../helpers/emoji-logger-mock';
import {
  AGGREGATION_ALARM_NAME,
  SCHEDULER_PERIOD_MINUTES_KEY,
  DEFAULT_AGGREGATION_INTERVAL_MINUTES,
} from '@/core/aggregator/utils/constants';

// Create mock implementations
const createMockAggregationEngine = () => ({
  run: vi.fn().mockResolvedValue({
    success: true,
    processedEvents: 5,
  } as AggregationResult),
});

const createMockDataPruner = () => ({
  run: vi.fn().mockResolvedValue(undefined),
});

describe('AggregationScheduler (WXT Standard)', () => {
  let AggregationScheduler: typeof import('@/core/aggregator/scheduler/AggregationScheduler').AggregationScheduler;
  let scheduler: InstanceType<typeof AggregationScheduler>;
  let mockAggregationEngine: ReturnType<typeof createMockAggregationEngine>;
  let mockDataPruner: ReturnType<typeof createMockDataPruner>;
  let mockLogger: EmojiLogger;

  beforeEach(async () => {
    // Reset WXT fake browser state
    fakeBrowser.reset();

    // Import AggregationScheduler after mocks are set up
    const module = await import('@/core/aggregator/scheduler/AggregationScheduler');
    AggregationScheduler = module.AggregationScheduler;

    mockAggregationEngine = createMockAggregationEngine();
    mockDataPruner = createMockDataPruner();
    mockLogger = createMockEmojiLogger();

    scheduler = new AggregationScheduler(
      mockAggregationEngine as unknown as AggregationEngine,
      mockDataPruner as unknown as DataPruner,
      { logger: mockLogger }
    );

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(scheduler).toBeInstanceOf(AggregationScheduler);
    });

    it('should use default emoji logger when none provided', () => {
      const schedulerWithoutLogger = new AggregationScheduler(
        mockAggregationEngine as unknown as AggregationEngine,
        mockDataPruner as unknown as DataPruner
      );
      expect(schedulerWithoutLogger).toBeInstanceOf(AggregationScheduler);
    });
  });

  describe('start method', () => {
    it('should create alarm with default period when no custom period is set', async () => {
      // Mock production environment to avoid DEV mode override
      vi.stubEnv('DEV', false);
      
      const createSpy = vi.spyOn(fakeBrowser.alarms, 'create');
      const addListenerSpy = vi.spyOn(fakeBrowser.alarms.onAlarm, 'addListener');

      await scheduler.start();

      expect(createSpy).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME, {
        periodInMinutes: DEFAULT_AGGREGATION_INTERVAL_MINUTES,
      });
      expect(addListenerSpy).toHaveBeenCalled();
      
      // Clean up environment mock
      vi.unstubAllEnvs();
    });

    it('should create alarm with custom period from storage', async () => {
      // Mock production environment to avoid DEV mode override
      vi.stubEnv('DEV', false);
      
      const customPeriod = 30;
      const createSpy = vi.spyOn(fakeBrowser.alarms, 'create');

      // Set the storage value using the exact key (which already includes 'sync:')
      const periodStorage = storage.defineItem(SCHEDULER_PERIOD_MINUTES_KEY);
      await periodStorage.setValue(customPeriod);

      // Create a new scheduler instance to pick up the storage value
      const newScheduler = new AggregationScheduler(
        mockAggregationEngine as unknown as AggregationEngine,
        mockDataPruner as unknown as DataPruner,
        { logger: mockLogger }
      );

      await newScheduler.start();

      expect(createSpy).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME, {
        periodInMinutes: customPeriod,
      });
      
      // Clean up environment mock
      vi.unstubAllEnvs();
    });

    it('should register alarm listener only once', async () => {
      const addListenerSpy = vi.spyOn(fakeBrowser.alarms.onAlarm, 'addListener');

      await scheduler.start();
      await scheduler.start(); // Call again

      expect(addListenerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop method', () => {
    it('should clear alarm and remove listener', async () => {
      vi.spyOn(fakeBrowser.alarms, 'clear').mockResolvedValue(true);
      const removeListenerSpy = vi.spyOn(fakeBrowser.alarms.onAlarm, 'removeListener');

      await scheduler.start();
      const result = await scheduler.stop();

      expect(fakeBrowser.alarms.clear).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME);
      expect(removeListenerSpy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when alarm clearing fails', async () => {
      vi.spyOn(fakeBrowser.alarms, 'clear').mockResolvedValue(false);

      const result = await scheduler.stop();

      expect(result).toBe(false);
    });

    it('should handle stop when listener was never registered', async () => {
      vi.spyOn(fakeBrowser.alarms, 'clear').mockResolvedValue(true);
      const removeListenerSpy = vi.spyOn(fakeBrowser.alarms.onAlarm, 'removeListener');

      const result = await scheduler.stop();

      expect(removeListenerSpy).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('alarm handling', () => {
    it('should handle correct alarm name', async () => {
      await scheduler.start();

      // Manually trigger the alarm using fake-browser API
      await fakeBrowser.alarms.onAlarm.trigger({ name: AGGREGATION_ALARM_NAME });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should trigger task execution
      expect(mockAggregationEngine.run).toHaveBeenCalled();
    });

    it('should ignore alarms with different names', async () => {
      await scheduler.start();

      // Manually trigger different alarm
      await fakeBrowser.alarms.onAlarm.trigger({ name: 'different-alarm' });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not trigger task execution
      expect(mockAggregationEngine.run).not.toHaveBeenCalled();
    });
  });

  describe('task execution', () => {
    it('should run aggregation and pruning on success', async () => {
      await scheduler.start();

      // Manually trigger the alarm
      await fakeBrowser.alarms.onAlarm.trigger({ name: AGGREGATION_ALARM_NAME });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAggregationEngine.run).toHaveBeenCalled();
      expect(mockDataPruner.run).toHaveBeenCalled();
    });

    it('should handle aggregation failure', async () => {
      const error = new Error('Aggregation failed');
      mockAggregationEngine.run.mockRejectedValue(error);

      await scheduler.start();

      // Manually trigger the alarm
      await fakeBrowser.alarms.onAlarm.trigger({ name: AGGREGATION_ALARM_NAME });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expectEmojiLog(mockLogger, LogCategory.ERROR, 'error', 'error during scheduled aggregation');
    });

    it('should log task duration', async () => {
      await scheduler.start();

      // Manually trigger the alarm
      await fakeBrowser.alarms.onAlarm.trigger({ name: AGGREGATION_ALARM_NAME });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify key log calls during task execution
      expect(mockLogger.logWithEmoji).toHaveBeenCalledWith(
        LogCategory.START, 'info', 'scheduled aggregation task'
      );
      expect(mockLogger.logWithEmoji).toHaveBeenCalledWith(
        LogCategory.END, 'info', 'aggregation task finished', expect.objectContaining({
          duration: expect.stringMatching(/\d+ms/)
        })
      );
    });
  });

  describe('WXT Integration', () => {
    it('should have access to fake browser APIs', () => {
      expect(fakeBrowser).toBeDefined();
      expect(fakeBrowser.alarms).toBeDefined();
      expect(fakeBrowser.alarms.create).toBeTypeOf('function');
    });

    it('should be able to use WXT storage', async () => {
      const testKey = 'test-key';
      const testValue = 42;

      // Use storage with proper area
      const testStorage = storage.defineItem(`local:${testKey}`);
      await testStorage.setValue(testValue);
      const retrievedValue = await testStorage.getValue();

      expect(retrievedValue).toBe(testValue);
    });

    it('should reset state between tests', () => {
      // This test verifies that fakeBrowser.reset() works
      expect(() => fakeBrowser.reset()).not.toThrow();
    });
  });
});
