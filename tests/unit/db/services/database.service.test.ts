/**
 * DatabaseService Unit Tests
 *
 * Tests for pure CRUD operations in the new DatabaseService class.
 * This service follows Core Task Plan requirements with NO business logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WebTimeTrackerDB } from '@/core/db/schemas';
import { ConnectionState } from '@/core/db/connection/manager';
import {
  createMockEventsLogRepository,
  createMockAggregatedStatsRepository,
  createTestCreateEventsLogRecord,
  createTestEventsLogRecord,
  createTestAggregatedStatsRecord,
  createTestRepositoryOptions,
  createTestTimeAggregationData,
} from './test-utils';

// Mock the database connection service
vi.mock('@/core/db/connection', async () => {
  const actual = await vi.importActual('@/core/db/connection');
  return {
    ...actual,
    connectionService: {
      getHealthStatus: vi.fn().mockResolvedValue({
        isHealthy: true,
        state: ConnectionState.OPEN,
        version: 1,
        lastError: null,
        lastChecked: Date.now(),
      }),
    },
  };
});

// Import after mocking
import { DatabaseService, type DatabaseHealthInfo } from '@/core/db/services/database.service';

describe('DatabaseService (New CRUD-only Implementation)', () => {
  let service: DatabaseService;
  let mockEventsLogRepo: ReturnType<typeof createMockEventsLogRepository>;
  let mockAggregatedStatsRepo: ReturnType<typeof createMockAggregatedStatsRepository>;
  let mockDb: WebTimeTrackerDB;

  beforeEach(() => {
    // Create mock repositories
    mockEventsLogRepo = createMockEventsLogRepository();
    mockAggregatedStatsRepo = createMockAggregatedStatsRepository();

    // Create mock database
    mockDb = {} as WebTimeTrackerDB;

    // Create service instance
    service = new DatabaseService(mockDb);

    // Replace the repository instances with mocks
    (service as unknown as { eventsLogRepo: unknown }).eventsLogRepo = mockEventsLogRepo;
    (service as unknown as { aggregatedStatsRepo: unknown }).aggregatedStatsRepo =
      mockAggregatedStatsRepo;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== EVENT CRUD OPERATIONS TESTS ====================

  describe('addEvent', () => {
    it('should add a new event successfully', async () => {
      const eventData = createTestCreateEventsLogRecord({
        url: 'https://example.com/page',
      });
      const expectedEventId = 123;
      const options = createTestRepositoryOptions();

      mockEventsLogRepo.createEvent.mockResolvedValue(expectedEventId);

      const result = await service.addEvent(eventData, options);

      expect(result).toBe(expectedEventId);
      expect(mockEventsLogRepo.createEvent).toHaveBeenCalledWith(eventData, options);
      expect(mockEventsLogRepo.createEvent).toHaveBeenCalledTimes(1);
    });

    it('should propagate repository errors', async () => {
      const eventData = createTestCreateEventsLogRecord();
      const repositoryError = new Error('Database connection failed');

      mockEventsLogRepo.createEvent.mockRejectedValue(repositoryError);

      await expect(service.addEvent(eventData)).rejects.toThrow('Database connection failed');
      expect(mockEventsLogRepo.createEvent).toHaveBeenCalledWith(eventData, {});
    });

    it('should handle validation errors from repository', async () => {
      const invalidEventData = createTestCreateEventsLogRecord({
        url: 'invalid-url',
      });
      const validationError = new Error('URL is required');

      mockEventsLogRepo.createEvent.mockRejectedValue(validationError);

      await expect(service.addEvent(invalidEventData)).rejects.toThrow('URL is required');
    });
  });

  describe('getUnprocessedEvents', () => {
    it('should retrieve unprocessed events successfully', async () => {
      const unprocessedEvents = [
        createTestEventsLogRecord({ id: 1, isProcessed: 0 }),
        createTestEventsLogRecord({ id: 2, isProcessed: 0 }),
      ];
      const options = { limit: 10, orderBy: 'timestamp' as const };

      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue(unprocessedEvents);

      const result = await service.getUnprocessedEvents(options);

      expect(result).toEqual(unprocessedEvents);
      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledWith(options);
      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results', async () => {
      mockEventsLogRepo.getUnprocessedEvents.mockResolvedValue([]);

      const result = await service.getUnprocessedEvents();

      expect(result).toEqual([]);
      expect(mockEventsLogRepo.getUnprocessedEvents).toHaveBeenCalledWith({});
    });

    it('should propagate repository errors', async () => {
      const repositoryError = new Error('Query failed');

      mockEventsLogRepo.getUnprocessedEvents.mockRejectedValue(repositoryError);

      await expect(service.getUnprocessedEvents()).rejects.toThrow('Query failed');
    });
  });

  describe('markEventsAsProcessed', () => {
    it('should mark events as processed successfully', async () => {
      const eventIds = [1, 2, 3];
      const expectedUpdateCount = 3;
      const options = createTestRepositoryOptions();

      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(expectedUpdateCount);

      const result = await service.markEventsAsProcessed(eventIds, options);

      expect(result).toBe(expectedUpdateCount);
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith(eventIds, options);
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event IDs array', async () => {
      mockEventsLogRepo.markEventsAsProcessed.mockResolvedValue(0);

      const result = await service.markEventsAsProcessed([]);

      expect(result).toBe(0);
      expect(mockEventsLogRepo.markEventsAsProcessed).toHaveBeenCalledWith([], {});
    });

    it('should propagate repository errors', async () => {
      const eventIds = [1, 2];
      const repositoryError = new Error('Update failed');

      mockEventsLogRepo.markEventsAsProcessed.mockRejectedValue(repositoryError);

      await expect(service.markEventsAsProcessed(eventIds)).rejects.toThrow('Update failed');
    });
  });

  describe('deleteEventsByIds', () => {
    it('should delete events successfully', async () => {
      const eventIds = [1, 2, 3];
      const expectedDeleteCount = 3;
      const options = createTestRepositoryOptions();

      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(expectedDeleteCount);

      const result = await service.deleteEventsByIds(eventIds, options);

      expect(result).toBe(expectedDeleteCount);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith(eventIds, options);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event IDs array', async () => {
      mockEventsLogRepo.deleteEventsByIds.mockResolvedValue(0);

      const result = await service.deleteEventsByIds([]);

      expect(result).toBe(0);
      expect(mockEventsLogRepo.deleteEventsByIds).toHaveBeenCalledWith([], {});
    });

    it('should propagate repository errors', async () => {
      const eventIds = [1, 2];
      const repositoryError = new Error('Delete failed');

      mockEventsLogRepo.deleteEventsByIds.mockRejectedValue(repositoryError);

      await expect(service.deleteEventsByIds(eventIds)).rejects.toThrow('Delete failed');
    });
  });

  // ==================== STATS CRUD OPERATIONS TESTS ====================

  describe('upsertStat', () => {
    it('should upsert statistics successfully', async () => {
      const aggregationData = createTestTimeAggregationData({
        url: 'https://example.com/page',
      });
      const expectedKey = '2023-12-25:https://example.com/page';
      const options = createTestRepositoryOptions();

      mockAggregatedStatsRepo.upsertTimeAggregation.mockResolvedValue(expectedKey);

      const result = await service.upsertStat(aggregationData, options);

      expect(result).toBe(expectedKey);
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledWith(
        aggregationData,
        options
      );
      expect(mockAggregatedStatsRepo.upsertTimeAggregation).toHaveBeenCalledTimes(1);
    });

    it('should propagate repository errors', async () => {
      const aggregationData = createTestTimeAggregationData({
        url: 'https://example.com/page',
      });
      const repositoryError = new Error('Upsert failed');

      mockAggregatedStatsRepo.upsertTimeAggregation.mockRejectedValue(repositoryError);

      await expect(service.upsertStat(aggregationData)).rejects.toThrow('Upsert failed');
    });
  });

  describe('getStatsByDateRange', () => {
    it('should retrieve stats by date range successfully', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-01-31';
      const mockStats = [
        createTestAggregatedStatsRecord({ date: '2023-01-15' }),
        createTestAggregatedStatsRecord({ date: '2023-01-20' }),
      ];
      const options = { limit: 10, orderBy: 'date' as const };

      mockAggregatedStatsRepo.getStatsByDateRange.mockResolvedValue(mockStats);

      const result = await service.getStatsByDateRange(startDate, endDate, options);

      expect(result).toEqual(mockStats);
      expect(mockAggregatedStatsRepo.getStatsByDateRange).toHaveBeenCalledWith(
        startDate,
        endDate,
        options
      );
      expect(mockAggregatedStatsRepo.getStatsByDateRange).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-01-31';

      mockAggregatedStatsRepo.getStatsByDateRange.mockResolvedValue([]);

      const result = await service.getStatsByDateRange(startDate, endDate);

      expect(result).toEqual([]);
      expect(mockAggregatedStatsRepo.getStatsByDateRange).toHaveBeenCalledWith(
        startDate,
        endDate,
        {}
      );
    });

    it('should propagate repository errors', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-01-31';
      const repositoryError = new Error('Query failed');

      mockAggregatedStatsRepo.getStatsByDateRange.mockRejectedValue(repositoryError);

      await expect(service.getStatsByDateRange(startDate, endDate)).rejects.toThrow('Query failed');
    });
  });

  describe('getStatsByHostname', () => {
    it('should retrieve stats by hostname successfully', async () => {
      const hostname = 'example.com';
      const mockStats = [
        createTestAggregatedStatsRecord({ hostname }),
        createTestAggregatedStatsRecord({ hostname }),
      ];
      const options = { limit: 5, orderBy: 'date' as const };

      mockAggregatedStatsRepo.getStatsByHostname.mockResolvedValue(mockStats);

      const result = await service.getStatsByHostname(hostname, options);

      expect(result).toEqual(mockStats);
      expect(mockAggregatedStatsRepo.getStatsByHostname).toHaveBeenCalledWith(hostname, options);
      expect(mockAggregatedStatsRepo.getStatsByHostname).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results for hostname', async () => {
      const hostname = 'nonexistent.com';

      mockAggregatedStatsRepo.getStatsByHostname.mockResolvedValue([]);

      const result = await service.getStatsByHostname(hostname);

      expect(result).toEqual([]);
      expect(mockAggregatedStatsRepo.getStatsByHostname).toHaveBeenCalledWith(hostname, {});
    });

    it('should propagate repository errors', async () => {
      const hostname = 'example.com';
      const repositoryError = new Error('Hostname query failed');

      mockAggregatedStatsRepo.getStatsByHostname.mockRejectedValue(repositoryError);

      await expect(service.getStatsByHostname(hostname)).rejects.toThrow('Hostname query failed');
    });
  });

  describe('getStatsByParentDomain', () => {
    it('should retrieve stats by parent domain successfully', async () => {
      const parentDomain = 'example.com';
      const mockStats = [
        createTestAggregatedStatsRecord({ parentDomain }),
        createTestAggregatedStatsRecord({ parentDomain }),
      ];
      const options = { limit: 5, orderBy: 'date' as const };

      mockAggregatedStatsRepo.getStatsByParentDomain.mockResolvedValue(mockStats);

      const result = await service.getStatsByParentDomain(parentDomain, options);

      expect(result).toEqual(mockStats);
      expect(mockAggregatedStatsRepo.getStatsByParentDomain).toHaveBeenCalledWith(
        parentDomain,
        options
      );
      expect(mockAggregatedStatsRepo.getStatsByParentDomain).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results for parent domain', async () => {
      const parentDomain = 'nonexistent.com';

      mockAggregatedStatsRepo.getStatsByParentDomain.mockResolvedValue([]);

      const result = await service.getStatsByParentDomain(parentDomain);

      expect(result).toEqual([]);
      expect(mockAggregatedStatsRepo.getStatsByParentDomain).toHaveBeenCalledWith(parentDomain, {});
    });

    it('should propagate repository errors', async () => {
      const parentDomain = 'example.com';
      const repositoryError = new Error('Parent domain query failed');

      mockAggregatedStatsRepo.getStatsByParentDomain.mockRejectedValue(repositoryError);

      await expect(service.getStatsByParentDomain(parentDomain)).rejects.toThrow(
        'Parent domain query failed'
      );
    });
  });

  // ==================== HEALTH CHECK OPERATIONS TESTS ====================

  describe('getDatabaseHealth', () => {
    describe('without health checker (standalone mode)', () => {
      it('should return healthy status when database operations succeed', async () => {
        // Mock repository counts
        mockEventsLogRepo.getUnprocessedEventsCount.mockResolvedValue(5);
        mockEventsLogRepo.count.mockResolvedValue(100);
        mockAggregatedStatsRepo.count.mockResolvedValue(50);

        const result = await service.getDatabaseHealth();

        expect(result.isHealthy).toBe(true);
        expect(result.unprocessedEventCount).toBe(5);
        expect(result.totalEventCount).toBe(100);
        expect(result.totalStatsCount).toBe(50);
        expect(result.lastProcessedDate).toBeDefined();
        expect(typeof result.lastProcessedDate).toBe('string');
        expect(result.lastProcessedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format

        expect(mockEventsLogRepo.getUnprocessedEventsCount).toHaveBeenCalledTimes(1);
        expect(mockEventsLogRepo.count).toHaveBeenCalledTimes(1);
        expect(mockAggregatedStatsRepo.count).toHaveBeenCalledTimes(1);
      });

      it('should handle repository errors gracefully', async () => {
        const repositoryError = new Error('Repository unavailable');
        mockEventsLogRepo.getUnprocessedEventsCount.mockRejectedValue(repositoryError);

        const result = await service.getDatabaseHealth();

        expect(result.isHealthy).toBe(false);
        expect(result.unprocessedEventCount).toBe(0);
        expect(result.totalEventCount).toBe(0);
        expect(result.totalStatsCount).toBe(0);
        expect(result.lastProcessedDate).toBeDefined();
      });
    });

    describe('with health checker (production mode)', () => {
      let serviceWithHealthChecker: DatabaseService;
      let mockHealthChecker: { getHealthStatus: ReturnType<typeof vi.fn> };

      beforeEach(() => {
        mockHealthChecker = {
          getHealthStatus: vi.fn(),
        };
        serviceWithHealthChecker = new DatabaseService(mockDb, mockHealthChecker);

        // Replace the repository instances with mocks
        (serviceWithHealthChecker as unknown as { eventsLogRepo: unknown }).eventsLogRepo = mockEventsLogRepo;
        (serviceWithHealthChecker as unknown as { aggregatedStatsRepo: unknown }).aggregatedStatsRepo = mockAggregatedStatsRepo;
      });

      it('should return healthy status when health checker reports healthy', async () => {
        mockHealthChecker.getHealthStatus.mockResolvedValue({ isHealthy: true });
        mockEventsLogRepo.getUnprocessedEventsCount.mockResolvedValue(5);
        mockEventsLogRepo.count.mockResolvedValue(100);
        mockAggregatedStatsRepo.count.mockResolvedValue(50);

        const result = await serviceWithHealthChecker.getDatabaseHealth();

        expect(result.isHealthy).toBe(true);
        expect(result.unprocessedEventCount).toBe(5);
        expect(result.totalEventCount).toBe(100);
        expect(result.totalStatsCount).toBe(50);
        expect(mockHealthChecker.getHealthStatus).toHaveBeenCalledTimes(1);
      });

      it('should reflect unhealthy status when health checker reports unhealthy', async () => {
        mockHealthChecker.getHealthStatus.mockResolvedValue({ isHealthy: false });
        mockEventsLogRepo.getUnprocessedEventsCount.mockResolvedValue(0);
        mockEventsLogRepo.count.mockResolvedValue(0);
        mockAggregatedStatsRepo.count.mockResolvedValue(0);

        const result = await serviceWithHealthChecker.getDatabaseHealth();

        expect(result.isHealthy).toBe(false);
        expect(result.unprocessedEventCount).toBe(0);
        expect(result.totalEventCount).toBe(0);
        expect(result.totalStatsCount).toBe(0);
        expect(mockHealthChecker.getHealthStatus).toHaveBeenCalledTimes(1);
      });

      it('should handle repository errors even with health checker', async () => {
        const repositoryError = new Error('Repository unavailable');
        mockEventsLogRepo.getUnprocessedEventsCount.mockRejectedValue(repositoryError);

        const result = await serviceWithHealthChecker.getDatabaseHealth();

        expect(result.isHealthy).toBe(false);
        expect(result.unprocessedEventCount).toBe(0);
        expect(result.totalEventCount).toBe(0);
        expect(result.totalStatsCount).toBe(0);
        expect(result.lastProcessedDate).toBeDefined();
        // Health checker should not be called if database operations fail
        expect(mockHealthChecker.getHealthStatus).not.toHaveBeenCalled();
      });
    });
  });

  // ==================== TYPE SAFETY AND INTERFACE COMPLIANCE TESTS ====================

  describe('Type Safety and Interface Compliance', () => {
    it('should maintain type safety with repository interfaces', () => {
      // This test ensures that the service correctly implements the expected interfaces
      expect(service).toBeInstanceOf(DatabaseService);
      expect(typeof service.addEvent).toBe('function');
      expect(typeof service.getUnprocessedEvents).toBe('function');
      expect(typeof service.markEventsAsProcessed).toBe('function');
      expect(typeof service.deleteEventsByIds).toBe('function');
      expect(typeof service.upsertStat).toBe('function');
      expect(typeof service.getStatsByDateRange).toBe('function');
      expect(typeof service.getStatsByHostname).toBe('function');
      expect(typeof service.getStatsByParentDomain).toBe('function');
      expect(typeof service.getDatabaseHealth).toBe('function');
    });

    it('should return correct DatabaseHealthInfo interface', async () => {
      mockEventsLogRepo.getUnprocessedEventsCount.mockResolvedValue(10);
      mockEventsLogRepo.count.mockResolvedValue(200);
      mockAggregatedStatsRepo.count.mockResolvedValue(75);

      const result: DatabaseHealthInfo = await service.getDatabaseHealth();

      // Type checking at compile time and runtime validation
      expect(typeof result.isHealthy).toBe('boolean');
      expect(typeof result.unprocessedEventCount).toBe('number');
      expect(typeof result.totalEventCount).toBe('number');
      expect(typeof result.totalStatsCount).toBe('number');
      if (result.lastProcessedDate) {
        expect(typeof result.lastProcessedDate).toBe('string');
      }
    });
  });

  // ==================== ERROR HANDLING TESTS ====================

  describe('Error Handling', () => {
    it('should propagate validation errors from repositories', async () => {
      const eventData = createTestCreateEventsLogRecord();
      const validationError = new Error('Invalid hostname format');
      validationError.name = 'ValidationError';

      mockEventsLogRepo.createEvent.mockRejectedValue(validationError);

      await expect(service.addEvent(eventData)).rejects.toThrow('Invalid hostname format');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Operation timeout');
      timeoutError.name = 'TimeoutError';

      mockEventsLogRepo.getUnprocessedEvents.mockRejectedValue(timeoutError);

      await expect(service.getUnprocessedEvents({ timeout: 1000 })).rejects.toThrow(
        'Operation timeout'
      );
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Database connection lost');
      connectionError.name = 'ConnectionError';

      mockAggregatedStatsRepo.getStatsByDateRange.mockRejectedValue(connectionError);

      await expect(service.getStatsByDateRange('2023-01-01', '2023-01-31')).rejects.toThrow(
        'Database connection lost'
      );
    });
  });
});
