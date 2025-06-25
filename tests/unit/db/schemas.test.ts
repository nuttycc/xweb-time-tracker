/**
 * Database Schemas Unit Tests
 *
 * Tests for database schema definitions, table structures, and Dexie configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WebTimeTrackerDB,
  DATABASE_NAME,
  DATABASE_VERSION,
  type EventsLogRecord,
  type AggregatedStatsRecord,
  getUtcDateString,
  generateAggregatedStatsKey,
  parseAggregatedStatsKey,
} from '@/db/schemas';

describe('Database Schema Configuration', () => {
  let db: WebTimeTrackerDB;
  let testDbName: string;

  beforeEach(async () => {
    // Use unique database name for each test to ensure isolation
    testDbName = `WebTimeTracker_Test_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Clean up any existing database with this name (unlikely but safe)
    try {
      await WebTimeTrackerDB.delete(testDbName);
    } catch {
      // Ignore errors if database doesn't exist
    }

    db = new WebTimeTrackerDB();
    // Override the database name for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).name = testDbName;
  });

  afterEach(async () => {
    // Ensure proper cleanup for test isolation
    if (db.isOpen()) {
      db.close();
    }

    // Delete the test database to ensure complete cleanup
    try {
      await WebTimeTrackerDB.delete(testDbName);
    } catch (_error) {
      // Ignore cleanup errors in tests
      console.warn(`Failed to cleanup test database ${testDbName}:`, _error);
    }
  });

  it('should have correct database name and version', () => {
    expect(DATABASE_NAME).toBe('WebTimeTracker');
    expect(DATABASE_VERSION).toBe(1);
    // Note: In tests, we use a unique database name for isolation
    expect(db.name).toBe(testDbName);
  });

  it('should define eventslog table with correct schema', async () => {
    await db.open();

    const eventslogTable = db.eventslog;
    expect(eventslogTable).toBeDefined();
    expect(eventslogTable.name).toBe('eventslog');

    // Check schema structure
    const schema = eventslogTable.schema;
    expect(schema.primKey.name).toBe('id');
    expect(schema.primKey.auto).toBe(true);

    // Check indexes
    const indexNames = schema.indexes.map(idx => idx.name);
    expect(indexNames).toContain('isProcessed');
    expect(indexNames).toContain('visitId');
    expect(indexNames).toContain('activityId');
  });

  it('should define aggregatedstats table with correct schema', async () => {
    await db.open();

    const aggregatedstatsTable = db.aggregatedstats;
    expect(aggregatedstatsTable).toBeDefined();
    expect(aggregatedstatsTable.name).toBe('aggregatedstats');

    // Check schema structure
    const schema = aggregatedstatsTable.schema;
    expect(schema.primKey.name).toBe('key');
    expect(schema.primKey.auto).toBe(false);

    // Check indexes
    const indexNames = schema.indexes.map(idx => idx.name);
    expect(indexNames).toContain('date');
    expect(indexNames).toContain('hostname');
    expect(indexNames).toContain('parentDomain');
  });

  it('should open database successfully', async () => {
    expect(db.isOpen()).toBe(false);

    await db.open();

    expect(db.isOpen()).toBe(true);
    expect(db.verno).toBe(DATABASE_VERSION);
  });

  it('should have correct table count', async () => {
    await db.open();

    expect(db.tables.length).toBe(2);

    const tableNames = db.tables.map(table => table.name);
    expect(tableNames).toContain('eventslog');
    expect(tableNames).toContain('aggregatedstats');
  });

  it('should handle database operations gracefully', async () => {
    // Test that database can be opened and closed multiple times
    await db.open();
    expect(db.isOpen()).toBe(true);

    db.close();
    expect(db.isOpen()).toBe(false);

    // Should be able to reopen
    await db.open();
    expect(db.isOpen()).toBe(true);
  });

  it('should maintain schema integrity after reopen', async () => {
    await db.open();
    const initialSchema = {
      eventslogPrimKey: db.eventslog.schema.primKey.name,
      aggregatedstatsPrimKey: db.aggregatedstats.schema.primKey.name,
      tableCount: db.tables.length,
    };

    db.close();
    await db.open();

    // Schema should remain consistent
    expect(db.eventslog.schema.primKey.name).toBe(initialSchema.eventslogPrimKey);
    expect(db.aggregatedstats.schema.primKey.name).toBe(initialSchema.aggregatedstatsPrimKey);
    expect(db.tables.length).toBe(initialSchema.tableCount);
  });
});

describe('Schema Utility Functions', () => {
  describe('getUtcDateString', () => {
    it('should return current UTC date in YYYY-MM-DD format', () => {
      const dateString = getUtcDateString();
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify it's a valid date
      const date = new Date(dateString);
      expect(date.toISOString().split('T')[0]).toBe(dateString);
    });

    it('should return specific UTC date for given timestamp', () => {
      const timestamp = new Date('2023-12-25T15:30:45.123Z').getTime();
      const dateString = getUtcDateString(timestamp);
      expect(dateString).toBe('2023-12-25');
    });
  });

  describe('generateAggregatedStatsKey', () => {
    it('should generate correct key format', () => {
      const date = '2023-12-25';
      const url = 'https://example.com/path';
      const key = generateAggregatedStatsKey(date, url);

      expect(key).toBe('2023-12-25:https://example.com/path');
    });

    it('should handle complex URLs with normalization', () => {
      const date = '2023-12-25';
      const url = 'https://example.com/path?param=value&other=123#section';
      const key = generateAggregatedStatsKey(date, url);

      // URL normalization removes non-whitelisted parameters and fragments
      expect(key).toBe('2023-12-25:https://example.com/path');
    });

    it('should preserve whitelisted parameters', () => {
      const date = '2023-12-25';
      const url = 'https://example.com/path?id=123&utm_source=google&page=2';
      const key = generateAggregatedStatsKey(date, url);

      // Only whitelisted parameters (id, page) should be preserved
      expect(key).toBe('2023-12-25:https://example.com/path?id=123&page=2');
    });

    it('should remove marketing parameters automatically', () => {
      const date = '2023-12-25';
      const url = 'https://example.com/path?id=123&utm_source=google&fbclid=abc&gclid=xyz';
      const key = generateAggregatedStatsKey(date, url);

      // Marketing parameters should be removed, only business parameters preserved
      expect(key).toBe('2023-12-25:https://example.com/path?id=123');
    });
  });

  describe('parseAggregatedStatsKey', () => {
    it('should parse valid key correctly', () => {
      const key = '2023-12-25:https://example.com/path';
      const parsed = parseAggregatedStatsKey(key);

      expect(parsed.date).toBe('2023-12-25');
      expect(parsed.url).toBe('https://example.com/path');
    });

    it('should handle URLs with colons', () => {
      const key = '2023-12-25:https://example.com:8080/path';
      const parsed = parseAggregatedStatsKey(key);

      expect(parsed.date).toBe('2023-12-25');
      expect(parsed.url).toBe('https://example.com:8080/path');
    });

    it('should throw error for invalid key format', () => {
      expect(() => parseAggregatedStatsKey('invalid-key')).toThrow(
        'Invalid aggregated stats key format'
      );
      expect(() => parseAggregatedStatsKey('2023-12-25')).toThrow(
        'Invalid aggregated stats key format'
      );
      expect(() => parseAggregatedStatsKey('23-12-25:url')).toThrow(
        'Invalid aggregated stats key format'
      );
    });

    it('should throw error for invalid dates', () => {
      // Invalid month
      expect(() => parseAggregatedStatsKey('2023-13-01:url')).toThrow(
        'Invalid date in key: 2023-13-01'
      );

      // Invalid day
      expect(() => parseAggregatedStatsKey('2023-02-30:url')).toThrow(
        'Invalid date in key: 2023-02-30'
      );

      // Invalid day for April (only 30 days)
      expect(() => parseAggregatedStatsKey('2023-04-31:url')).toThrow(
        'Invalid date in key: 2023-04-31'
      );

      // Invalid leap year date
      expect(() => parseAggregatedStatsKey('2023-02-29:url')).toThrow(
        'Invalid date in key: 2023-02-29'
      );

      // Completely invalid date format (but correct length)
      expect(() => parseAggregatedStatsKey('abcd-ef-gh:url')).toThrow(
        'Invalid date in key: abcd-ef-gh'
      );
    });

    it('should accept valid leap year dates', () => {
      // 2024 is a leap year
      const key = '2024-02-29:https://example.com/path';
      const parsed = parseAggregatedStatsKey(key);

      expect(parsed.date).toBe('2024-02-29');
      expect(parsed.url).toBe('https://example.com/path');
    });

    it('should accept edge case valid dates', () => {
      // Last day of months with 31 days
      expect(() => parseAggregatedStatsKey('2023-01-31:url')).not.toThrow();
      expect(() => parseAggregatedStatsKey('2023-03-31:url')).not.toThrow();
      expect(() => parseAggregatedStatsKey('2023-12-31:url')).not.toThrow();

      // Last day of February in non-leap year
      expect(() => parseAggregatedStatsKey('2023-02-28:url')).not.toThrow();

      // First day of year
      expect(() => parseAggregatedStatsKey('2023-01-01:url')).not.toThrow();
    });
  });
});

describe('Database Type Definitions', () => {
  it('should have correct EventsLogRecord interface', () => {
    const record: EventsLogRecord = {
      id: 1,
      timestamp: Date.now(),
      eventType: 'open_time_start',
      tabId: 123,
      url: 'https://example.com',
      visitId: 'uuid-visit-123',
      activityId: 'uuid-activity-456',
      isProcessed: 0,
      resolution: 'crash_recovery',
    };

    // Type checking - if this compiles, the interface is correct
    expect(record.id).toBe(1);
    expect(typeof record.timestamp).toBe('number');
    expect(record.eventType).toBe('open_time_start');
    expect(record.isProcessed).toBe(0);
  });

  it('should have correct AggregatedStatsRecord interface', () => {
    const record: AggregatedStatsRecord = {
      key: '2023-12-25:https://example.com',
      date: '2023-12-25',
      url: 'https://example.com',
      hostname: 'example.com',
      parentDomain: 'example.com',
      total_open_time: 3600,
      total_active_time: 1800,
      last_updated: Date.now(),
    };

    // Type checking - if this compiles, the interface is correct
    expect(record.key).toBe('2023-12-25:https://example.com');
    expect(record.date).toBe('2023-12-25');
    expect(typeof record.total_open_time).toBe('number');
    expect(typeof record.last_updated).toBe('number');
  });
});
