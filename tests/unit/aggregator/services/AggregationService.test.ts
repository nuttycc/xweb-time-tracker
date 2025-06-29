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

// Create mock logger instance first
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
};

// Mock the logger module
vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
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

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service started successfully.');
    });

    it('should handle scheduler start errors gracefully', async () => {
      const error = new Error('Scheduler start failed');
      mockAggregationScheduler.start.mockRejectedValue(error);

      await expect(service.start()).rejects.toThrow('Scheduler start failed');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start aggregation service:', error);
    });

    it('should handle synchronous scheduler start errors', async () => {
      const error = new Error('Synchronous error');
      mockAggregationScheduler.start.mockImplementation(() => {
        throw error;
      });

      await expect(service.start()).rejects.toThrow('Synchronous error');

      expect(mockAggregationScheduler.start).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to start aggregation service:', error);
    });
  });

  describe('stop method', () => {
    it('should stop the aggregation scheduler successfully', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service stopped successfully.');
    });

    it('should handle scheduler stop errors gracefully', async () => {
      const error = new Error('Scheduler stop failed');
      mockAggregationScheduler.stop.mockRejectedValue(error);

      await expect(service.stop()).rejects.toThrow('Scheduler stop failed');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to stop aggregation service:', error);
    });

    it('should handle synchronous scheduler stop errors', async () => {
      const error = new Error('Synchronous stop error');
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw error;
      });

      await expect(service.stop()).rejects.toThrow('Synchronous stop error');

      expect(mockAggregationScheduler.stop).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to stop aggregation service:', error);
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
      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service started successfully.');
      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service stopped successfully.');
    });

    it('should handle multiple start calls', async () => {
      mockAggregationScheduler.start.mockResolvedValue(undefined);

      await service.start();
      await service.start();
      await service.start();

      expect(mockAggregationScheduler.start).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple stop calls', async () => {
      mockAggregationScheduler.stop.mockResolvedValue(true);

      await service.stop();
      await service.stop();
      await service.stop();

      expect(mockAggregationScheduler.stop).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions in start', async () => {
      mockAggregationScheduler.start.mockImplementation(() => {
        throw 'String error';
      });

      await expect(service.start()).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        'String error'
      );
    });

    it('should handle non-Error exceptions in stop', async () => {
      mockAggregationScheduler.stop.mockImplementation(() => {
        throw 'String stop error';
      });

      await expect(service.stop()).rejects.toBe('String stop error');

      expect(mockLogger.error).toHaveBeenCalledWith(
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

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        expect.any(TypeError),
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to stop aggregation service:',
        expect.any(TypeError),
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
      expect(mockLogger.error).toHaveBeenCalledWith(
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

      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service started successfully.');
      expect(mockLogger.info).toHaveBeenCalledWith('Aggregation service stopped successfully.');
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

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start aggregation service:',
        startError
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to stop aggregation service:',
        stopError
      );
    });
  });
});
