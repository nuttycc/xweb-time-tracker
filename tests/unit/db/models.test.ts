/**
 * Database Models Unit Tests
 * 
 * Tests for Zod v4 schema validation and type inference.
 */

import { describe, it, expect } from 'vitest';
import {
  EventsLogSchema,
  CreateEventsLogSchema,
  UpdateEventsLogSchema,
  EventsLogValidation,
  AggregatedStatsSchema,
  CreateAggregatedStatsSchema,
  UpdateAggregatedStatsSchema,
  UpsertAggregatedStatsSchema,
  DateRangeQuerySchema,
  AggregatedStatsValidation,
  EventTypeSchema,
  ResolutionTypeSchema,
  type EventsLogRecord,
  type AggregatedStatsRecord
} from '@/db/models';

describe('EventsLog Model Validation', () => {
  const validEventsLogData = {
    id: 1,
    timestamp: Date.now(),
    eventType: 'open_time_start' as const,
    tabId: 123,
    url: 'https://example.com/path',
    visitId: '550e8400-e29b-41d4-a716-446655440000',
    activityId: '550e8400-e29b-41d4-a716-446655440001',
    isProcessed: 0 as const,
    resolution: 'crash_recovery' as const
  };

  describe('EventsLogSchema', () => {
    it('should validate correct events log data', () => {
      const result = EventsLogSchema.safeParse(validEventsLogData);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.eventType).toBe('open_time_start');
        expect(result.data.isProcessed).toBe(0);
      }
    });

    it('should reject invalid event type', () => {
      const invalidData = { ...validEventsLogData, eventType: 'invalid_type' };
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL', () => {
      const invalidData = { ...validEventsLogData, url: 'not-a-url' };
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID', () => {
      const invalidData = { ...validEventsLogData, visitId: 'not-a-uuid' };
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null activityId', () => {
      const dataWithNullActivity = { ...validEventsLogData, activityId: null };
      const result = EventsLogSchema.safeParse(dataWithNullActivity);
      expect(result.success).toBe(true);
    });

    it('should allow optional resolution', () => {
      const { resolution, ...dataWithoutResolution } = validEventsLogData;
      const result = EventsLogSchema.safeParse(dataWithoutResolution);
      expect(result.success).toBe(true);
    });
  });

  describe('CreateEventsLogSchema', () => {
    it('should validate data for creating new events', () => {
      const createData = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001'
      };

      const result = CreateEventsLogSchema.safeParse(createData);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.isProcessed).toBe(0); // Default value
        expect(result.data.id).toBeUndefined(); // Should not have ID
      }
    });
  });

  describe('EventsLogValidation helpers', () => {
    it('should validate record using helper function', () => {
      const validated = EventsLogValidation.validateRecord(validEventsLogData);
      expect(validated.id).toBe(1);
      expect(validated.eventType).toBe('open_time_start');
    });

    it('should safely validate record using helper function', () => {
      const result = EventsLogValidation.safeValidateRecord(validEventsLogData);
      expect(result.success).toBe(true);
    });

    it('should throw error for invalid data', () => {
      const invalidData = { ...validEventsLogData, eventType: 'invalid' };
      expect(() => EventsLogValidation.validateRecord(invalidData)).toThrow();
    });
  });
});

describe('AggregatedStats Model Validation', () => {
  const validAggregatedStatsData = {
    key: '2023-12-25:https://example.com/path',
    date: '2023-12-25',
    url: 'https://example.com/path',
    hostname: 'example.com',
    parentDomain: 'example.com',
    total_open_time: 3600,
    total_active_time: 1800,
    last_updated: Date.now()
  };

  describe('AggregatedStatsSchema', () => {
    it('should validate correct aggregated stats data', () => {
      const result = AggregatedStatsSchema.safeParse(validAggregatedStatsData);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.key).toBe('2023-12-25:https://example.com/path');
        expect(result.data.date).toBe('2023-12-25');
        expect(result.data.total_open_time).toBe(3600);
      }
    });

    it('should reject invalid key format', () => {
      const invalidData = { ...validAggregatedStatsData, key: 'invalid-key' };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const invalidData = { ...validAggregatedStatsData, date: '2023/12/25' };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative time values', () => {
      const invalidData = { ...validAggregatedStatsData, total_open_time: -100 };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL', () => {
      const invalidData = { ...validAggregatedStatsData, url: 'not-a-url' };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateAggregatedStatsSchema', () => {
    it('should validate data for creating new stats', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800
      };

      const result = CreateAggregatedStatsSchema.safeParse(createData);
      expect(result.success).toBe(true);
    });

    it('should allow optional last_updated for creation', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
        last_updated: Date.now()
      };

      const result = CreateAggregatedStatsSchema.safeParse(createData);
      expect(result.success).toBe(true);
    });
  });

  describe('DateRangeQuerySchema', () => {
    it('should validate correct date range', () => {
      const dateRange = {
        startDate: '2023-12-01',
        endDate: '2023-12-31'
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const dateRange = {
        startDate: '2023/12/01',
        endDate: '2023-12-31'
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(false);
    });

    it('should reject start date after end date', () => {
      const dateRange = {
        startDate: '2023-12-31',
        endDate: '2023-12-01'
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(false);
    });

    it('should allow same start and end date', () => {
      const dateRange = {
        startDate: '2023-12-25',
        endDate: '2023-12-25'
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(true);
    });
  });

  describe('AggregatedStatsValidation helpers', () => {
    it('should validate record using helper function', () => {
      const validated = AggregatedStatsValidation.validateRecord(validAggregatedStatsData);
      expect(validated.key).toBe('2023-12-25:https://example.com/path');
      expect(validated.total_open_time).toBe(3600);
    });

    it('should safely validate record using helper function', () => {
      const result = AggregatedStatsValidation.safeValidateRecord(validAggregatedStatsData);
      expect(result.success).toBe(true);
    });

    it('should validate upsert data', () => {
      const upsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800
      };

      const validated = AggregatedStatsValidation.validateUpsert(upsertData);
      expect(validated.key).toBe('2023-12-25:https://example.com/path');
    });
  });
});

describe('Enum Schemas', () => {
  describe('EventTypeSchema', () => {
    it('should validate all valid event types', () => {
      const validTypes = [
        'open_time_start',
        'open_time_end',
        'active_time_start',
        'active_time_end',
        'checkpoint'
      ];

      validTypes.forEach(type => {
        const result = EventTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid event types', () => {
      const invalidTypes = ['invalid_type', 'start', 'end', ''];

      invalidTypes.forEach(type => {
        const result = EventTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('ResolutionTypeSchema', () => {
    it('should validate crash_recovery', () => {
      const result = ResolutionTypeSchema.safeParse('crash_recovery');
      expect(result.success).toBe(true);
    });

    it('should reject invalid resolution types', () => {
      const result = ResolutionTypeSchema.safeParse('invalid_resolution');
      expect(result.success).toBe(false);
    });
  });
});
