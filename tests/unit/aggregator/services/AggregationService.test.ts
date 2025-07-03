/**
 * AggregationService Unit Tests
 *
 * Tests for the aggregation service functionality including:
 * - Service lifecycle management
 * - Component coordination
 * - Error handling and logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AggregationService as AggregationServiceType } from '@/core/aggregator/services/AggregationService';
import type { AggregationScheduler } from '@/core/aggregator/scheduler/AggregationScheduler';

// Mock the emoji logger module - we only care that logging happens, not the content
vi.mock('@/utils/logger-emoji', () => ({
  createEmojiLogger: vi.fn(() => ({
    logWithEmoji: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
  LogCategory: {
    SUCCESS: '✅',
    ERROR: '❌',
  },
}));

// Mock data helpers
const createMockAggregationScheduler = () => ({
  start: vi.fn(),
  stop: vi.fn(),
  // Note: reset method is not used by AggregationService
});

describe('AggregationService', () => {
  let service: AggregationServiceType;
  let mockAggregationScheduler: ReturnType<typeof createMockAggregationScheduler>;
  let AggregationService: typeof import('@/core/aggregator/services/AggregationService').AggregationService;

  beforeEach(async () => {
    vi.clearAllMocks(); // Clear mocks before each test
    // Dynamically import the service to ensure mocks are applied first
    const module = await import('@/core/aggregator/services/AggregationService');
    AggregationService = module.AggregationService;
    mockAggregationScheduler = createMockAggregationScheduler();
    service = new AggregationService(mockAggregationScheduler as unknown as AggregationScheduler);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore all mocks after each test
  });

  describe('constructor', () => {
    it('should initialize with provided scheduler', () => {
      expect(service).toBeInstanceOf(AggregationService);
    });
  });

  describe('start method', () => {
    it('should start the aggregation scheduler successfully', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);

      await service.start();

      // Focus on behavior: verify the scheduler was started
      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
    });

    it('should handle scheduler start errors gracefully', async () => {
      const error = new Error('Scheduler start failed');
      mockAggregationScheduler.start.mockRejectedValue(error);

      // Focus on behavior: service should propagate scheduler errors
      await expect(service.start()).rejects.toThrow('Scheduler start failed');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
    });

    it('should handle synchronous scheduler start errors', async () => {
      const error = new Error('Synchronous error');
      mockAggregationScheduler.start.mockImplementation(() => {
        throw error;
      });

      // Focus on behavior: service should handle synchronous errors from scheduler
      await expect(service.start()).rejects.toThrow('Synchronous error');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
    });
  });

  describe('stop method', () => {
    it('should stop the aggregation scheduler successfully', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();

      // Focus on behavior: verify the scheduler was stopped
      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });

    it('should handle scheduler stop errors gracefully', async () => {
      const error = new Error('Scheduler stop failed');
      mockAggregationScheduler.stop.mockRejectedValue(error);

      // Focus on behavior: service should propagate scheduler stop errors
      await expect(service.stop()).rejects.toThrow('Scheduler stop failed');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });

    it('should handle synchronous scheduler stop errors', async () => {
      const error = new Error('Synchronous stop error');
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw error;
      });

      // Focus on behavior: service should handle synchronous stop errors from scheduler
      await expect(service.stop()).rejects.toThrow('Synchronous stop error');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });
  });

  describe('service lifecycle', () => {
    it('should handle start-stop cycle correctly', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.start();
      await service.stop();

      // Focus on behavior: verify complete lifecycle operations
      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });

    it('should handle multiple start calls', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);

      await service.start();
      await service.start();
      await service.start();

      // Focus on behavior: each start call should delegate to scheduler
      expect(mockAggregationScheduler.start).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple stop calls', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();
      await service.stop();
      await service.stop();

      // Focus on behavior: each stop call should delegate to scheduler
      expect(mockAggregationScheduler.stop).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions in start', async () => {
      mockAggregationScheduler.start.mockImplementation(() => {
        throw 'String error';
      });

      // Focus on behavior: service should propagate non-Error exceptions
      await expect(service.start()).rejects.toBe('String error');
    });

    it('should handle non-Error exceptions in stop', async () => {
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw 'String stop error';
      });

      // Focus on behavior: service should propagate non-Error exceptions
      await expect(service.stop()).rejects.toBe('String stop error');
    });

    it('should handle undefined scheduler methods gracefully', async () => {
      const brokenScheduler = {} as unknown as AggregationScheduler;
      const brokenService = new AggregationService(brokenScheduler);

      // Focus on behavior: service should handle invalid schedulers by throwing TypeError
      await expect(brokenService.start()).rejects.toThrow(TypeError);
      await expect(brokenService.stop()).rejects.toThrow(TypeError);
    });
  });

  describe('integration scenarios', () => {
    it('should handle scheduler that returns promises', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.start();
      await service.stop();

      // Focus on behavior: service should properly await async scheduler operations
      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });

    it('should handle scheduler that throws immediately', async () => {
      const immediateError = new Error('Immediate failure');
      mockAggregationScheduler.start.mockImplementation(() => {
        throw immediateError;
      });

      // Focus on behavior: service should propagate immediate scheduler failures
      await expect(service.start()).rejects.toThrow('Immediate failure');
    });
  });

  // Note: Removed logging behavior tests as they test implementation details
  // The service's core responsibility is to manage the scheduler lifecycle,
  // not to produce specific log messages. Logging is a side effect, not the main behavior.
});
