/**
 * AggregationService Unit Tests
 *
 * Tests for the aggregation service functionality including:
 * - Service lifecycle management
 * - Component coordination
 * - Error handling and logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AggregationService } from '@/core/aggregator/services/AggregationService';
import type { AggregationScheduler } from '@/core/aggregator/scheduler/AggregationScheduler';

// Mock data helpers
const createMockAggregationScheduler = () => ({
  start: vi.fn(),
  stop: vi.fn(),
  // Note: reset method is not used by AggregationService
});

const createMockConsole = () => ({
  log: vi.fn(),
  error: vi.fn(),
  // Note: Only log and error are used by AggregationService
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  dir: vi.fn(),
  dirxml: vi.fn(),
  table: vi.fn(),
  clear: vi.fn(),
  count: vi.fn(),
  countReset: vi.fn(),
  group: vi.fn(),
  groupCollapsed: vi.fn(),
  groupEnd: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
  timeLog: vi.fn(),
  assert: vi.fn(),
  profile: vi.fn(),
  profileEnd: vi.fn(),
  timeStamp: vi.fn(),
});

describe('AggregationService', () => {
  let service: AggregationService;
  let mockAggregationScheduler: ReturnType<typeof createMockAggregationScheduler>;
  let mockConsole: ReturnType<typeof createMockConsole>;
  let originalConsole: typeof console;

  beforeEach(() => {
    mockConsole = createMockConsole();

    // Mock console
    originalConsole = global.console;
    global.console = mockConsole as unknown as Console;

    mockAggregationScheduler = createMockAggregationScheduler();
    service = new AggregationService(mockAggregationScheduler as unknown as AggregationScheduler);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore console
    global.console = originalConsole;
    vi.clearAllMocks();
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

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service started successfully.');
    });

    it('should handle scheduler start errors gracefully', async () => {
      const error = new Error('Scheduler start failed');
      mockAggregationScheduler.start.mockRejectedValue(error);

      await expect(service.start()).rejects.toThrow('Scheduler start failed');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to start aggregation service:', error);
    });

    it('should handle synchronous scheduler start errors', async () => {
      const error = new Error('Synchronous error');
      mockAggregationScheduler.start.mockImplementation(() => {
        throw error;
      });

      await expect(service.start()).rejects.toThrow('Synchronous error');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to start aggregation service:', error);
    });
  });

  describe('stop method', () => {
    it('should stop the aggregation scheduler successfully', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service stopped successfully.');
    });

    it('should handle scheduler stop errors gracefully', async () => {
      const error = new Error('Scheduler stop failed');
      mockAggregationScheduler.stop.mockRejectedValue(error);

      await expect(service.stop()).rejects.toThrow('Scheduler stop failed');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to stop aggregation service:', error);
    });

    it('should handle synchronous scheduler stop errors', async () => {
      const error = new Error('Synchronous stop error');
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw error;
      });

      await expect(service.stop()).rejects.toThrow('Synchronous stop error');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to stop aggregation service:', error);
    });
  });

  describe('service lifecycle', () => {
    it('should handle start-stop cycle correctly', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.start();
      await service.stop();

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service started successfully.');
      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service stopped successfully.');
    });

    it('should handle multiple start calls', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);

      await service.start();
      await service.start();
      await service.start();

      expect(mockAggregationScheduler.start).toHaveBeenCalledTimes(3);
      expect(mockConsole.log).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple stop calls', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();
      await service.stop();
      await service.stop();

      expect(mockAggregationScheduler.stop).toHaveBeenCalledTimes(3);
      expect(mockConsole.log).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions in start', async () => {
      mockAggregationScheduler.start.mockImplementation(() => {
        throw 'String error';
      });

      await expect(service.start()).rejects.toBe('String error');

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        'String error'
      );
    });

    it('should handle non-Error exceptions in stop', async () => {
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw 'String stop error';
      });

      await expect(service.stop()).rejects.toBe('String stop error');

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to stop aggregation service:',
        'String stop error'
      );
    });

    it('should handle undefined scheduler methods gracefully', async () => {
      const brokenScheduler = {} as unknown as AggregationScheduler;
      const brokenService = new AggregationService(brokenScheduler);

      // AggregationService has try-catch, so it will rethrow errors
      await expect(brokenService.start()).rejects.toThrow(TypeError);
      await expect(brokenService.stop()).rejects.toThrow(TypeError);

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        expect.any(TypeError)
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to stop aggregation service:',
        expect.any(TypeError)
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle scheduler that returns promises', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.start();
      await service.stop();

      // Service methods are now async and properly await scheduler operations
      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
    });

    it('should handle scheduler that throws immediately', async () => {
      const immediateError = new Error('Immediate failure');
      mockAggregationScheduler.start.mockImplementation(() => {
        throw immediateError;
      });

      await expect(service.start()).rejects.toThrow('Immediate failure');
      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        immediateError
      );
    });
  });

  describe('logging behavior', () => {
    it('should log success messages with correct format', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.start();
      await service.stop();

      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service started successfully.');
      expect(mockConsole.log).toHaveBeenCalledWith('Aggregation service stopped successfully.');
    });

    it('should log error messages with correct format', async () => {
      const startError = new Error('Start error');
      const stopError = new Error('Stop error');

      mockAggregationScheduler.start.mockImplementation(() => {
        throw startError;
      });
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw stopError;
      });

      await expect(service.start()).rejects.toThrow('Start error');
      await expect(service.stop()).rejects.toThrow('Stop error');

      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        startError
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        'Failed to stop aggregation service:',
        stopError
      );
    });
  });
});
