/**
 * AggregatedStatsRepository Unit Tests
 *
 * Tests for AggregatedStats repository CRUD operations, upsert logic,
 * time aggregation, domain-specific queries, and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie, { type EntityTable } from 'dexie';
import { AggregatedStatsRepository } from '@/core/db/repositories/aggregatedstats.repository';
import { ValidationError, RepositoryError } from '@/core/db/repositories/base.repository';
import type { AggregatedStatsRecord } from '@/core/db/schemas/aggregatedstats.schema';
import {
  generateAggregatedStatsKey,
  getUtcDateString,
} from '@/core/db/schemas/aggregatedstats.schema';
import type { TimeAggregationData } from '@/core/db/repositories/aggregatedstats.repository';
import type { WebTimeTrackerDB } from '@/core/db/schemas';
import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';

// Type-safe test database implementation
class TestDatabase extends Dexie implements WebTimeTrackerDB {
  aggregatedstats!: EntityTable<AggregatedStatsRecord, 'key'>;
  eventslog!: EntityTable<EventsLogRecord, 'id'>; // Proper type for interface compliance

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      aggregatedstats: 'key, date, url, hostname, parentDomain',
      eventslog: '++id', // Minimal schema for interface compliance
    });
  }
}

describe('AggregatedStatsRepository', () => {
  let db: TestDatabase;
  let repository: AggregatedStatsRepository;

  beforeEach(async () => {
    // Create a new database instance with a unique name for each test
    const dbName = `TestAggregatedStatsDB_${Date.now()}_${Math.random()}`;
    db = new TestDatabase(dbName);

    // Direct instantiation without unsafe type casting
    repository = new AggregatedStatsRepository(db);
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
    vi.clearAllMocks();
  });

  // Helper function to create test aggregation data
  const createTestAggregationData = (
    overrides: Partial<TimeAggregationData> = {}
  ): TimeAggregationData => ({
    date: getUtcDateString(),
    url: 'https://example.com/page',
    hostname: 'example.com',
    parentDomain: 'example.com',
    openTimeToAdd: 1000,
    activeTimeToAdd: 500,
    ...overrides,
  });

  // Helper function to create test stats record
  const createTestStatsRecord = (
    overrides: Partial<AggregatedStatsRecord> = {}
  ): AggregatedStatsRecord => {
    const defaultDate = getUtcDateString();
    const defaultUrl = 'https://example.com/page';

    // Apply overrides first to get final date and url
    const finalDate = overrides.date || defaultDate;
    const finalUrl = overrides.url || defaultUrl;

    const baseRecord = {
      date: finalDate,
      url: finalUrl,
      hostname: 'example.com',
      parentDomain: 'example.com',
      total_open_time: 1000,
      total_active_time: 500,
      last_updated: Date.now(),
      ...overrides,
    };

    // Generate key based on final date and url (after overrides)
    const finalKey = generateAggregatedStatsKey(baseRecord.date, baseRecord.url);

    return {
      ...baseRecord,
      key: finalKey,
    };
  };

  describe('upsertTimeAggregation', () => {
    it('should create new record when none exists', async () => {
      const aggregationData = createTestAggregationData();

      const key = await repository.upsertTimeAggregation(aggregationData);

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');

      const created = await repository.findById(key);
      expect(created).toBeDefined();
      expect(created!.url).toBe(aggregationData.url);
      expect(created!.total_open_time).toBe(aggregationData.openTimeToAdd);
      expect(created!.total_active_time).toBe(aggregationData.activeTimeToAdd);
    });

    it('should accumulate time when record exists', async () => {
      const aggregationData = createTestAggregationData({
        openTimeToAdd: 1000,
        activeTimeToAdd: 500,
      });

      // First upsert - creates new record
      const key = await repository.upsertTimeAggregation(aggregationData);

      // Second upsert - should accumulate time
      const additionalData = createTestAggregationData({
        date: aggregationData.date,
        url: aggregationData.url,
        openTimeToAdd: 2000,
        activeTimeToAdd: 1000,
      });

      await repository.upsertTimeAggregation(additionalData);

      const updated = await repository.findById(key);
      expect(updated!.total_open_time).toBe(3000); // 1000 + 2000
      expect(updated!.total_active_time).toBe(1500); // 500 + 1000
    });

    it('should generate correct composite key', async () => {
      const date = '2024-01-15';
      const url = 'https://example.com/test';
      const aggregationData = createTestAggregationData({ date, url });

      const key = await repository.upsertTimeAggregation(aggregationData);
      const expectedKey = generateAggregatedStatsKey(date, url);

      expect(key).toBe(expectedKey);
    });

    it('should handle validation errors', async () => {
      const invalidData = createTestAggregationData({
        url: 'not-a-valid-url', // Invalid URL
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should handle negative time values', async () => {
      const invalidData = createTestAggregationData({
        openTimeToAdd: -100, // Negative time
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });
  });

  describe('getStatsByDateRange', () => {
    beforeEach(async () => {
      // Create test records for different dates
      const records = [
        createTestStatsRecord({ date: '2024-01-15', url: 'https://example.com/page1' }),
        createTestStatsRecord({ date: '2024-01-15', url: 'https://example.com/page2' }),
        createTestStatsRecord({ date: '2024-01-16', url: 'https://example.com/page1' }),
        createTestStatsRecord({ date: '2024-01-16', url: 'https://example.com/page3' }),
      ];

      for (const record of records) {
        await db.aggregatedstats.add(record);
      }
    });

    it('should return stats for specific date range', async () => {
      const stats = await repository.getStatsByDateRange('2024-01-15', '2024-01-15');

      expect(stats).toHaveLength(2);
      stats.forEach((stat: AggregatedStatsRecord) => {
        expect(stat.date).toBe('2024-01-15');
      });
    });

    it('should support pagination', async () => {
      const firstPage = await repository.getStatsByDateRange('2024-01-15', '2024-01-15', {
        limit: 1,
        offset: 0,
      });

      expect(firstPage).toHaveLength(1);

      const secondPage = await repository.getStatsByDateRange('2024-01-15', '2024-01-15', {
        limit: 1,
        offset: 1,
      });

      expect(secondPage).toHaveLength(1);
    });

    it('should return empty array for non-existent date range', async () => {
      const stats = await repository.getStatsByDateRange('2024-12-31', '2024-12-31');
      expect(stats).toEqual([]);
    });
  });

  describe('getStatsByHostname', () => {
    beforeEach(async () => {
      // Create test records for different hostnames
      const records = [
        createTestStatsRecord({ hostname: 'example.com', url: 'https://example.com/page1' }),
        createTestStatsRecord({ hostname: 'example.com', url: 'https://example.com/page2' }),
        createTestStatsRecord({ hostname: 'google.com', url: 'https://google.com/search' }),
        createTestStatsRecord({ hostname: 'github.com', url: 'https://github.com/repo' }),
      ];

      for (const record of records) {
        await db.aggregatedstats.add(record);
      }
    });

    it('should return stats for specific hostname', async () => {
      const stats = await repository.getStatsByHostname('example.com');

      expect(stats).toHaveLength(2);
      stats.forEach(stat => {
        expect(stat.hostname).toBe('example.com');
      });
    });

    it('should support pagination for hostname query', async () => {
      const firstPage = await repository.getStatsByHostname('example.com', {
        limit: 1,
        offset: 0,
      });

      expect(firstPage).toHaveLength(1);
    });

    it('should return empty array for non-existent hostname', async () => {
      const stats = await repository.getStatsByHostname('nonexistent.com');
      expect(stats).toEqual([]);
    });
  });

  describe('getStatsByParentDomain', () => {
    beforeEach(async () => {
      // Create test records for different parent domains
      const records = [
        createTestStatsRecord({
          parentDomain: 'example.com',
          hostname: 'www.example.com',
          url: 'https://www.example.com/page1',
        }),
        createTestStatsRecord({
          parentDomain: 'example.com',
          hostname: 'api.example.com',
          url: 'https://api.example.com/page2',
        }),
        createTestStatsRecord({
          parentDomain: 'google.com',
          hostname: 'www.google.com',
          url: 'https://www.google.com/search',
        }),
        createTestStatsRecord({
          parentDomain: 'github.com',
          hostname: 'github.com',
          url: 'https://github.com/repo',
        }),
      ];

      for (const record of records) {
        await db.aggregatedstats.add(record);
      }
    });

    it('should return stats for specific parent domain', async () => {
      const stats = await repository.getStatsByParentDomain('example.com');

      expect(stats).toHaveLength(2);
      stats.forEach(stat => {
        expect(stat.parentDomain).toBe('example.com');
      });
    });

    it('should support pagination for parent domain query', async () => {
      const firstPage = await repository.getStatsByParentDomain('example.com', {
        limit: 1,
        offset: 0,
      });

      expect(firstPage).toHaveLength(1);
    });
  });

  describe('getStatsByDateAndUrl', () => {
    it('should return specific stats record', async () => {
      const date = '2024-01-15';
      const url = 'https://example.com/specific-page';
      const record = createTestStatsRecord({ date, url });

      await db.aggregatedstats.add(record);

      const found = await repository.getStatsByDateAndUrl(date, url);

      expect(found).toBeDefined();
      expect(found!.date).toBe(date);
      expect(found!.url).toBe(url);
    });

    it('should return undefined for non-existent combination', async () => {
      const found = await repository.getStatsByDateAndUrl('2024-01-15', 'https://nonexistent.com');
      expect(found).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle database transaction errors', async () => {
      const mockError = new Error('Transaction failed');
      vi.spyOn(db, 'transaction').mockImplementation(() => {
        return Promise.reject(mockError) as ReturnType<typeof db.transaction>;
      });

      const aggregationData = createTestAggregationData();

      await expect(repository.upsertTimeAggregation(aggregationData)).rejects.toThrow(
        RepositoryError
      );
    });

    it('should handle query errors', async () => {
      const mockError = new Error('Query failed');
      // Mock the executeWithRetry method to throw error directly
      vi.spyOn(
        repository as unknown as {
          executeWithRetry: (
            fn: () => Promise<unknown>,
            operation: string,
            options?: unknown
          ) => Promise<unknown>;
        },
        'executeWithRetry'
      ).mockRejectedValueOnce(mockError);

      await expect(repository.getStatsByDateRange('2024-01-15', '2024-01-15')).rejects.toThrow(
        RepositoryError
      );
    });
  });

  describe('validation', () => {
    it('should validate URL format', async () => {
      const invalidData = createTestAggregationData({
        url: 'not-a-valid-url',
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should validate date format', async () => {
      const invalidData = createTestAggregationData({
        date: 'invalid-date-format',
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should validate hostname format', async () => {
      const invalidData = createTestAggregationData({
        hostname: '', // Empty hostname
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should validate time values are non-negative', async () => {
      const invalidData = createTestAggregationData({
        openTimeToAdd: -100,
      });

      await expect(repository.upsertTimeAggregation(invalidData)).rejects.toThrow(ValidationError);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys for same date and URL', async () => {
      const date = '2024-01-15';
      const url = 'https://example.com/test';

      const key1 = generateAggregatedStatsKey(date, url);
      const key2 = generateAggregatedStatsKey(date, url);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different dates', async () => {
      const url = 'https://example.com/test';

      const key1 = generateAggregatedStatsKey('2024-01-15', url);
      const key2 = generateAggregatedStatsKey('2024-01-16', url);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different URLs', async () => {
      const date = '2024-01-15';

      const key1 = generateAggregatedStatsKey(date, 'https://example.com/page1');
      const key2 = generateAggregatedStatsKey(date, 'https://example.com/page2');

      expect(key1).not.toBe(key2);
    });
  });
});
