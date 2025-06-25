/**
 * URL Normalization Database Operations Tests
 *
 * Tests for verifying that normalized URLs are correctly stored and queried
 * in the database, specifically testing aggregation key generation and data consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AggregatedStatsRepository,
  type TimeAggregationData,
} from '@/core/db/repositories/aggregatedstats.repository';
import { generateAggregatedStatsKey } from '@/core/db/schemas/aggregatedstats.schema';
import { normalizeUrl } from '@/core/db/utils/url-normalizer.util';
import type { WebTimeTrackerDB } from '@/core/db/schemas';
import type { EventsLogRecord } from '@/core/db/models/eventslog.model';
import type { AggregatedStatsRecord } from '@/core/db/models/aggregatedstats.model';
import Dexie, { type EntityTable } from 'dexie';

// Create a test database
class TestDatabase extends Dexie implements WebTimeTrackerDB {
  aggregatedstats!: EntityTable<AggregatedStatsRecord, 'key'>;
  eventslog!: EntityTable<EventsLogRecord, 'id'>;

  constructor() {
    super('TestDatabase');
    this.version(1).stores({
      aggregatedstats:
        'key, date, url, hostname, parentDomain, total_open_time, total_active_time, last_updated',
      eventslog: '++id, url, timestamp, eventType, tabId, visitId, activityId, isProcessed',
    });
  }
}

describe('URL Normalization Database Operations', () => {
  let db: TestDatabase;
  let repository: AggregatedStatsRepository;

  beforeEach(async () => {
    db = new TestDatabase();
    await db.open();
    repository = new AggregatedStatsRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  describe('Aggregation Key Generation', () => {
    it('should generate consistent keys for URLs with different marketing parameters', () => {
      const date = '2024-01-15';
      const originalUrls = [
        'https://example.com/page?id=123',
        'https://example.com/page?id=123&utm_source=google',
        'https://example.com/page?id=123&fbclid=abc&utm_campaign=summer',
      ];

      // generateAggregatedStatsKey now handles normalization internally
      const keys = originalUrls.map(url => generateAggregatedStatsKey(date, url));

      // All keys should be identical due to automatic normalization
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1);

      // Key should contain normalized URL
      const key = keys[0];
      expect(key).toBe(`${date}:https://example.com/page?id=123`);
    });

    it('should generate different keys for different business parameters', () => {
      const date = '2024-01-15';
      const urls = [
        'https://example.com/page?id=123',
        'https://example.com/page?id=456',
        'https://example.com/page?id=123&page=2',
      ];

      // generateAggregatedStatsKey now handles normalization internally
      const keys = urls.map(url => generateAggregatedStatsKey(date, url));

      // All keys should be different because business parameters are preserved
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
    });
  });

  describe('Database Storage and Retrieval', () => {
    const createTestAggregationData = (url: string, date = '2024-01-15'): TimeAggregationData => {
      const normalizedUrl = normalizeUrl(url);
      const urlObj = new URL(normalizedUrl);

      return {
        date,
        url: normalizedUrl,
        hostname: urlObj.hostname,
        parentDomain: urlObj.hostname,
        openTimeToAdd: 1000,
        activeTimeToAdd: 500,
      };
    };

    it('should store normalized URLs correctly', async () => {
      const originalUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
      const aggregationData = createTestAggregationData(originalUrl);

      const key = await repository.upsertTimeAggregation(aggregationData);

      // Retrieve the stored record
      const storedRecord = await repository.findById(key);

      expect(storedRecord).not.toBeNull();
      expect(storedRecord!.url).toBe('https://example.com/page?id=123');
      expect(storedRecord!.url).not.toContain('utm_source');
      expect(storedRecord!.url).not.toContain('fbclid');
    });

    it('should aggregate data for URLs with different marketing parameters', async () => {
      const baseUrl = 'https://shop.com/product?id=123&category=electronics';
      const urlVariants = [
        baseUrl,
        `${baseUrl}&utm_source=google`,
        `${baseUrl}&fbclid=abc123`,
        `${baseUrl}&utm_campaign=summer&gclid=xyz`,
      ];

      // Insert data for each URL variant
      for (const url of urlVariants) {
        const aggregationData = createTestAggregationData(url);
        await repository.upsertTimeAggregation(aggregationData);
      }

      // Should only have one record due to URL normalization
      const allRecords = await repository.getStatsByDateRange('2024-01-15', '2024-01-15');
      expect(allRecords).toHaveLength(1);

      const record = allRecords[0];
      expect(record.url).toContain('id=123');
      expect(record.url).toContain('category=electronics');
      expect(record.url).not.toContain('utm_');
      expect(record.url).not.toContain('fbclid');
      expect(record.url).not.toContain('gclid');

      // Time should be accumulated (4 variants × 1000ms = 4000ms)
      expect(record.total_open_time).toBe(4000);
      expect(record.total_active_time).toBe(2000);
    });

    it('should handle concurrent upserts for same normalized URL', async () => {
      const urls = [
        'https://example.com/page?id=123&utm_source=google',
        'https://example.com/page?id=123&fbclid=abc',
        'https://example.com/page?id=123&gclid=xyz',
      ];

      // Perform concurrent upserts
      const promises = urls.map(url => {
        const aggregationData = createTestAggregationData(url);
        return repository.upsertTimeAggregation(aggregationData);
      });

      const keys = await Promise.all(promises);

      // All operations should return the same key
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1);

      // Should have only one record with accumulated time
      const record = await repository.findById(keys[0]);
      expect(record).not.toBeNull();
      expect(record!.total_open_time).toBe(3000); // 3 × 1000ms
      expect(record!.total_active_time).toBe(1500); // 3 × 500ms
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Set up test data with various URLs
      const testData = [
        {
          url: 'https://example.com/page1?id=123&utm_source=google',
          date: '2024-01-15',
        },
        {
          url: 'https://example.com/page1?id=123&fbclid=abc',
          date: '2024-01-15',
        },
        {
          url: 'https://example.com/page2?category=tech&utm_campaign=ads',
          date: '2024-01-15',
        },
        {
          url: 'https://different.com/page?id=456&gclid=xyz',
          date: '2024-01-16',
        },
      ];

      for (const { url, date } of testData) {
        const normalizedUrl = normalizeUrl(url);
        const urlObj = new URL(normalizedUrl);

        const aggregationData: TimeAggregationData = {
          date,
          url: normalizedUrl,
          hostname: urlObj.hostname,
          parentDomain: urlObj.hostname,
          openTimeToAdd: 1000,
          activeTimeToAdd: 500,
        };

        await repository.upsertTimeAggregation(aggregationData);
      }
    });

    it('should query by normalized URL correctly', async () => {
      const originalUrl = 'https://example.com/page1?id=123&utm_source=facebook';
      const normalizedUrl = normalizeUrl(originalUrl);

      const record = await repository.getStatsByDateAndUrl('2024-01-15', normalizedUrl);

      expect(record).not.toBeNull();
      expect(record!.url).toBe('https://example.com/page1?id=123');
      // Should have accumulated data from multiple marketing variants
      expect(record!.total_open_time).toBe(2000); // 2 variants
    });

    it('should query by hostname correctly', async () => {
      const records = await repository.getStatsByHostname('example.com');

      expect(records).toHaveLength(2); // page1 and page2

      // Verify URLs are normalized
      records.forEach(record => {
        expect(record.url).not.toContain('utm_');
        expect(record.url).not.toContain('fbclid');
        expect(record.url).not.toContain('gclid');
      });
    });

    it('should query by date range correctly', async () => {
      const records = await repository.getStatsByDateRange('2024-01-15', '2024-01-15');

      expect(records).toHaveLength(2); // Only 2024-01-15 records

      // Verify all URLs are normalized
      records.forEach(record => {
        expect(record.date).toBe('2024-01-15');
        expect(record.url).not.toContain('utm_');
        expect(record.url).not.toContain('fbclid');
      });
    });

    it('should calculate totals correctly with normalized URLs', async () => {
      const totals = await repository.getTotalTimeByDateRange('2024-01-15', '2024-01-16');

      // Should include all records across both dates
      expect(totals.recordCount).toBe(3); // 2 from 2024-01-15 + 1 from 2024-01-16
      expect(totals.totalOpenTime).toBe(4000); // 2000 + 1000 + 1000
      expect(totals.totalActiveTime).toBe(2000); // 1000 + 500 + 500
    });
  });

  describe('Data Consistency Verification', () => {
    it('should maintain referential integrity with normalized URLs', async () => {
      const originalUrl = 'https://example.com/page?id=123&utm_source=google&fbclid=abc';
      const normalizedUrl = normalizeUrl(originalUrl);
      const date = '2024-01-15';

      // Create aggregation data
      const aggregationData: TimeAggregationData = {
        date,
        url: normalizedUrl,
        hostname: 'example.com',
        parentDomain: 'example.com',
        openTimeToAdd: 1000,
        activeTimeToAdd: 500,
      };

      const key = await repository.upsertTimeAggregation(aggregationData);

      // Verify key format
      expect(key).toBe(`${date}:${normalizedUrl}`);

      // Verify record can be retrieved by generated key
      const record = await repository.findById(key);
      expect(record).not.toBeNull();
      expect(record!.key).toBe(key);
      expect(record!.url).toBe(normalizedUrl);
    });

    it('should handle edge cases in URL normalization storage', async () => {
      const edgeCases = [
        'https://example.com', // No query parameters
        'https://example.com?', // Empty query
        'https://example.com?utm_source=test', // Only marketing parameters
        'https://example.com?id=1&utm_source=test&page=2&fbclid=abc', // Mixed parameters
      ];

      for (let i = 0; i < edgeCases.length; i++) {
        const url = edgeCases[i];
        const normalizedUrl = normalizeUrl(url);
        const date = `2024-01-${15 + i}`;

        const aggregationData: TimeAggregationData = {
          date,
          url: normalizedUrl,
          hostname: 'example.com',
          parentDomain: 'example.com',
          openTimeToAdd: 1000,
          activeTimeToAdd: 500,
        };

        const key = await repository.upsertTimeAggregation(aggregationData);
        const record = await repository.findById(key);

        expect(record).not.toBeNull();
        expect(record!.url).toBe(normalizedUrl);
        expect(record!.url).not.toContain('utm_');
        expect(record!.url).not.toContain('fbclid');
      }
    });
  });
});
