/**
 * AggregationScheduler Unit Tests
 *
 * Tests for the aggregation scheduler functionality including:
 * - Chrome.alarms scheduling system
 * - Task queue and concurrency control mechanisms
 * - Task monitoring and retry mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AggregationEngine } from '@/core/aggregator/engine/AggregationEngine';
import type { DataPruner } from '@/core/aggregator/pruner/DataPruner';
import type { AggregationResult } from '@/core/aggregator/utils/types';
import {
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
  AGGREGATION_LOCK_TTL_MS,
  SCHEDULER_PERIOD_MINUTES_KEY,
} from '@/core/aggregator/utils/constants';

// Mock wxt/browser module
const mockBrowser = {
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

// Mock storage for testing
const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

// Mock the modules
vi.mock('wxt/browser', () => ({
  browser: mockBrowser,
}));

vi.mock('#imports', () => ({
  storage: mockStorage,
}));

// Mock data helpers
const createMockAggregationEngine = () => ({
  run: vi.fn(),
});

const createMockDataPruner = () => ({
  run: vi.fn(),
});

const createMockLogger = () => ({
  log: vi.fn(),
  error: vi.fn(),
});

describe('AggregationScheduler', () => {
  let scheduler: InstanceType<typeof AggregationScheduler>;
  let AggregationScheduler: typeof import('@/core/aggregator/scheduler/AggregationScheduler').AggregationScheduler;
  let mockAggregationEngine: ReturnType<typeof createMockAggregationEngine>;
  let mockDataPruner: ReturnType<typeof createMockDataPruner>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    // Import AggregationScheduler after mocks are set up
    const module = await import('@/core/aggregator/scheduler/AggregationScheduler');
    AggregationScheduler = module.AggregationScheduler;

    mockAggregationEngine = createMockAggregationEngine();
    mockDataPruner = createMockDataPruner();
    mockLogger = createMockLogger();

    scheduler = new AggregationScheduler(
      mockAggregationEngine as unknown as AggregationEngine,
      mockDataPruner as unknown as DataPruner,
      { logger: mockLogger }
    );

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(scheduler).toBeInstanceOf(AggregationScheduler);
    });

    it('should use console as default logger when none provided', () => {
      const schedulerWithoutLogger = new AggregationScheduler(
        mockAggregationEngine as unknown as AggregationEngine,
        mockDataPruner as unknown as DataPruner
      );
      expect(schedulerWithoutLogger).toBeInstanceOf(AggregationScheduler);
    });
  });

  describe('start method', () => {
    it('should create alarm with default period when no custom period is set', async () => {
      mockStorage.getItem.mockResolvedValue(null);

      await scheduler.start();

      expect(mockStorage.getItem).toHaveBeenCalledWith(SCHEDULER_PERIOD_MINUTES_KEY);
      expect(mockBrowser.alarms.create).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME, {
        periodInMinutes: 60,
      });
      expect(mockBrowser.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should create alarm with custom period from storage', async () => {
      const customPeriod = 30;
      mockStorage.getItem.mockResolvedValue(customPeriod);

      await scheduler.start();

      expect(mockStorage.getItem).toHaveBeenCalledWith(SCHEDULER_PERIOD_MINUTES_KEY);
      expect(mockBrowser.alarms.create).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME, {
        periodInMinutes: customPeriod,
      });
    });

    it('should register alarm listener only once', async () => {
      mockStorage.getItem.mockResolvedValue(null);

      await scheduler.start();
      await scheduler.start(); // Call again

      expect(mockBrowser.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop method', () => {
    it('should clear alarm and remove listener', async () => {
      mockBrowser.alarms.clear.mockResolvedValue(true);
      mockStorage.getItem.mockResolvedValue(null);

      // Start first to register listener
      await scheduler.start();
      const result = await scheduler.stop();

      expect(mockBrowser.alarms.clear).toHaveBeenCalledWith(AGGREGATION_ALARM_NAME);
      expect(mockBrowser.alarms.onAlarm.removeListener).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when alarm clearing fails', async () => {
      mockBrowser.alarms.clear.mockResolvedValue(false);

      const result = await scheduler.stop();

      expect(result).toBe(false);
    });

    it('should handle stop when listener was never registered', async () => {
      mockBrowser.alarms.clear.mockResolvedValue(true);

      const result = await scheduler.stop();

      expect(mockBrowser.alarms.onAlarm.removeListener).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('reset method', () => {
    it('should stop and then start the scheduler', async () => {
      mockBrowser.alarms.clear.mockResolvedValue(true);
      mockStorage.getItem.mockResolvedValue(null);

      const stopSpy = vi.spyOn(scheduler, 'stop');
      const startSpy = vi.spyOn(scheduler, 'start');

      await scheduler.reset();

      expect(stopSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('alarm handling', () => {
    it('should handle correct alarm name', async () => {
      const mockAlarm = { name: AGGREGATION_ALARM_NAME };
      const runTaskSpy = vi
        .spyOn(scheduler as unknown as { runTask: () => Promise<void> }, 'runTask')
        .mockResolvedValue(undefined);

      // Simulate alarm handler call
      const handleAlarm = (
        scheduler as unknown as { handleAlarm: (alarm: { name: string }) => void }
      ).handleAlarm;
      handleAlarm(mockAlarm);

      expect(runTaskSpy).toHaveBeenCalled();
    });

    it('should ignore alarms with different names', async () => {
      const mockAlarm = { name: 'different-alarm' };
      const runTaskSpy = vi
        .spyOn(scheduler as unknown as { runTask: () => Promise<void> }, 'runTask')
        .mockResolvedValue(undefined);

      const handleAlarm = (
        scheduler as unknown as { handleAlarm: (alarm: { name: string }) => void }
      ).handleAlarm;
      handleAlarm(mockAlarm);

      expect(runTaskSpy).not.toHaveBeenCalled();
    });
  });

  describe('concurrency control', () => {
    it('should skip task when lock is active', async () => {
      const activeLock = { timestamp: Date.now() - 1000 }; // 1 second ago
      mockStorage.getItem.mockResolvedValue(activeLock);

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockLogger.log).toHaveBeenCalledWith('Aggregation task is already running. Skipping.');
      expect(mockAggregationEngine.run).not.toHaveBeenCalled();
    });

    it('should run task when lock is expired', async () => {
      const expiredLock = { timestamp: Date.now() - AGGREGATION_LOCK_TTL_MS - 1000 }; // Expired
      mockStorage.getItem.mockResolvedValue(expiredLock);
      mockAggregationEngine.run.mockResolvedValue({ success: true, processedEvents: 5 });

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockAggregationEngine.run).toHaveBeenCalled();
      expect(mockDataPruner.run).toHaveBeenCalled();
    });

    it('should run task when no lock exists', async () => {
      mockStorage.getItem.mockResolvedValue(null);
      mockAggregationEngine.run.mockResolvedValue({ success: true, processedEvents: 3 });

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockAggregationEngine.run).toHaveBeenCalled();
      expect(mockDataPruner.run).toHaveBeenCalled();
    });

    it('should set and remove lock during task execution', async () => {
      mockStorage.getItem.mockResolvedValue(null);
      mockAggregationEngine.run.mockResolvedValue({ success: true, processedEvents: 2 });

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        AGGREGATION_LOCK_KEY,
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
      expect(mockStorage.removeItem).toHaveBeenCalledWith(AGGREGATION_LOCK_KEY);
    });
  });

  describe('task execution', () => {
    beforeEach(() => {
      mockStorage.getItem.mockResolvedValue(null); // No lock
    });

    it('should run aggregation and pruning on success', async () => {
      const successResult: AggregationResult = { success: true, processedEvents: 10 };
      mockAggregationEngine.run.mockResolvedValue(successResult);

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockAggregationEngine.run).toHaveBeenCalled();
      expect(mockDataPruner.run).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('Starting scheduled aggregation...');
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Aggregation finished successfully. Processed 10 events.'
      );
    });

    it('should handle aggregation failure', async () => {
      const failureResult: AggregationResult = {
        success: false,
        processedEvents: 0,
        error: 'Database error',
      };
      mockAggregationEngine.run.mockResolvedValue(failureResult);

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockAggregationEngine.run).toHaveBeenCalled();
      expect(mockDataPruner.run).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Aggregation failed:', 'Database error');
    });

    it('should handle aggregation engine exceptions', async () => {
      const error = new Error('Engine crashed');
      mockAggregationEngine.run.mockRejectedValue(error);

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockLogger.error).toHaveBeenCalledWith('Error during scheduled aggregation:', error);
      expect(mockStorage.removeItem).toHaveBeenCalledWith(AGGREGATION_LOCK_KEY);
    });

    it('should log task duration', async () => {
      const startTime = Date.now();
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(startTime) // Lock timestamp
        .mockReturnValueOnce(startTime) // Start time
        .mockReturnValueOnce(startTime + 1500); // End time

      mockAggregationEngine.run.mockResolvedValue({ success: true, processedEvents: 1 });

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockLogger.log).toHaveBeenCalledWith('Aggregation task finished in 1500ms.');
    });

    it('should always remove lock even if task fails', async () => {
      mockAggregationEngine.run.mockRejectedValue(new Error('Test error'));

      await (scheduler as unknown as { runTask: () => Promise<void> }).runTask();

      expect(mockStorage.removeItem).toHaveBeenCalledWith(AGGREGATION_LOCK_KEY);
    });
  });
});
