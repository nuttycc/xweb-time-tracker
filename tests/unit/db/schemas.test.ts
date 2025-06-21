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
  parseAggregatedStatsKey
} from '@/db/schemas';

describe('Database Schema Configuration', () => {
  let db: WebTimeTrackerDB;

  beforeEach(() => {
    db = new WebTimeTrackerDB();
  });

  afterEach(async () => {
    if (db.isOpen()) {
      await db.close();
    }
  });

  it('should have correct database name and version', () => {
    expect(DATABASE_NAME).toBe('WebTimeTracker');
    expect(DATABASE_VERSION).toBe(1);
    expect(db.name).toBe(DATABASE_NAME);
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

    it('should handle complex URLs', () => {
      const date = '2023-12-25';
      const url = 'https://example.com/path?param=value&other=123#section';
      const key = generateAggregatedStatsKey(date, url);
      
      expect(key).toBe('2023-12-25:https://example.com/path?param=value&other=123#section');
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
      expect(() => parseAggregatedStatsKey('invalid-key')).toThrow('Invalid aggregated stats key format');
      expect(() => parseAggregatedStatsKey('2023-12-25')).toThrow('Invalid aggregated stats key format');
      expect(() => parseAggregatedStatsKey('23-12-25:url')).toThrow('Invalid aggregated stats key format');
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
      resolution: 'crash_recovery'
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
      last_updated: Date.now()
    };

    // Type checking - if this compiles, the interface is correct
    expect(record.key).toBe('2023-12-25:https://example.com');
    expect(record.date).toBe('2023-12-25');
    expect(typeof record.total_open_time).toBe('number');
    expect(typeof record.last_updated).toBe('number');
  });
});
