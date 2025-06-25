/**
 * HealthCheckUtil Unit Tests
 *
 * Tests for database health checking functionality including connection verification,
 * performance metrics, operation testing, and error handling scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type MockProxy } from 'vitest-mock-extended';
import { HealthCheckUtil, type HealthCheckResult, type WebTimeTrackerDB } from '@/core/db';
import {
  createMockDatabase,
  createTestHealthCheckOptions,
  createErrorDatabase,
  mockPerformanceNow,
  mockDateNow,
  validateHealthCheckResult,
  createPerformanceTestData,
  setMockDatabaseVersion,
} from './test-utils';

describe('HealthCheckUtil', () => {
  let mockDb: MockProxy<WebTimeTrackerDB>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should perform basic health check successfully', async () => {
      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.database.connected).toBe(true);
      expect(result.database.version).toBe('1');
      expect(result.timestamp).toBeTypeOf('number');
      expect(result.performance?.responseTime).toBeTypeOf('number');
      expect(validateHealthCheckResult(result)).toBe(true);
      expect(mockDb.isOpen).toHaveBeenCalled();
      expect(mockDb.eventslog.count).toHaveBeenCalled();
    });

    it('should handle database not open error', async () => {
      // Arrange
      const errorDb = createErrorDatabase('connection');

      // Act
      const result = await HealthCheckUtil.performHealthCheck(errorDb);

      // Assert
      expect(result.healthy).toBe(false);
      expect(result.database.connected).toBe(false);
      expect(result.database.error).toBe('Database is not open');
      expect(result.performance?.responseTime).toBeTypeOf('number');
    });

    it('should include performance metrics when requested', async () => {
      // Arrange
      const options = createTestHealthCheckOptions({ includePerformance: true });

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb, options);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.performance).toBeDefined();
      expect(result.performance?.responseTime).toBeTypeOf('number');
      // memoryUsage may not be available in Node.js test environment
      if (result.performance?.memoryUsage !== undefined) {
        expect(result.performance.memoryUsage).toBeTypeOf('number');
      }
      expect(mockDb.eventslog.count).toHaveBeenCalled();
    });

    it('should test basic operations when requested', async () => {
      // Arrange
      const options = createTestHealthCheckOptions({ testOperations: true });
      (mockDb.eventslog.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);
      (mockDb.aggregatedstats.count as ReturnType<typeof vi.fn>).mockResolvedValue(25);

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb, options);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.details?.tableStatus).toBeDefined();
      expect(result.details?.tableStatus).toEqual({
        eventslog: { count: 50, accessible: true },
        aggregatedstats: { count: 25, accessible: true },
      });
      expect(mockDb.eventslog.count).toHaveBeenCalled();
      expect(mockDb.aggregatedstats.count).toHaveBeenCalled();
    });

    it('should fail health check when response time exceeds threshold', async () => {
      // Arrange
      const performanceData = createPerformanceTestData();
      vi.useFakeTimers();

      // Mock both Date.now and performance.now to simulate slow response
      // Date.now is used for overall response time calculation (line 44, 76)
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(0) // startTime
        .mockReturnValueOnce(200); // endTime - 200ms total

      // performance.now is used for performance metrics (line 123, 129)
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0) // performance startTime
        .mockReturnValueOnce(200); // performance endTime - 200ms

      const options = createTestHealthCheckOptions({
        includePerformance: true,
        maxResponseTime: performanceData.fastResponse, // 10ms threshold
      });

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb, options);

      // Assert
      expect(result.healthy).toBe(false);
      expect(result.performance?.responseTime).toBe(200); // Final responseTime from Date.now calculation
      expect(result.performance?.responseTime).toBeGreaterThan(performanceData.fastResponse);

      vi.useRealTimers();
    });

    it('should handle all options combined', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 2);
      const options = createTestHealthCheckOptions({
        includePerformance: true,
        testOperations: true,
        maxResponseTime: 1000,
        verbose: true,
        timeout: 5000,
        retries: 2,
      });

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb, options);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.database.connected).toBe(true);
      expect(result.database.version).toBe('2');
      expect(result.performance).toBeDefined();
      expect(result.details?.tableStatus).toBeDefined();
      expect(result.performance?.responseTime).toBeLessThan(1000);
      expect(validateHealthCheckResult(result)).toBe(true);
    });

    it('should use default options when none provided', async () => {
      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.database.connected).toBe(true);
      expect(result.performance?.responseTime).toBeTypeOf('number');
      // Should not include performance metrics or test operations by default
      expect(result.performance?.memoryUsage).toBeUndefined();
      expect(result.details?.tableStatus).toBeUndefined();
      expect(validateHealthCheckResult(result)).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database with zero version', async () => {
      // Arrange
      setMockDatabaseVersion(mockDb, 0);

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.database.version).toBe('0');
      expect(validateHealthCheckResult(result)).toBe(true);
    });

    it('should handle undefined database version', async () => {
      // Arrange
      Object.defineProperty(mockDb, 'verno', {
        get: () => undefined,
        enumerable: true,
        configurable: true,
      });

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert
      // When verno is undefined, toString() throws error, causing health check to fail
      expect(result.healthy).toBe(false);
      expect(result.database.connected).toBe(false);
      expect(result.database.error).toContain('Cannot read properties of undefined');
    });

    it('should handle null options gracefully', async () => {
      // Act
      // @ts-expect-error Testing null options
      const result = await HealthCheckUtil.performHealthCheck(mockDb, null);

      // Assert
      // null options are handled explicitly in the function, so health check should succeed
      expect(result.healthy).toBe(true);
      expect(result.database.connected).toBe(true);
      expect(result.database.version).toBe('1');
    });

    it('should handle performance timing consistently', async () => {
      // Arrange
      mockPerformanceNow();
      mockDateNow();

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert
      expect(result.performance?.responseTime).toBeTypeOf('number');
      expect(result.timestamp).toBeTypeOf('number');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for HealthCheckResult', async () => {
      // Act
      const result: HealthCheckResult = await HealthCheckUtil.performHealthCheck(mockDb);

      // Assert - Type checking at compile time
      expect(typeof result.healthy).toBe('boolean');
      expect(typeof result.timestamp).toBe('number');
      expect(typeof result.database.connected).toBe('boolean');
      if (result.database.version) {
        expect(typeof result.database.version).toBe('string');
      }
      if (result.performance) {
        expect(typeof result.performance.responseTime).toBe('number');
      }
      expect(validateHealthCheckResult(result)).toBe(true);
    });

    it('should maintain type safety for HealthCheckOptions', async () => {
      // Arrange
      const options = createTestHealthCheckOptions({
        includePerformance: true,
        testOperations: false,
        maxResponseTime: 1000,
        verbose: true,
        timeout: 5000,
        retries: 3,
      });

      // Act
      const result = await HealthCheckUtil.performHealthCheck(mockDb, options);

      // Assert - Type checking ensures options are properly typed
      expect(result.healthy).toBe(true);
      expect(options.includePerformance).toBe(true);
      expect(options.testOperations).toBe(false);
      expect(options.maxResponseTime).toBe(1000);
    });
  });
});
