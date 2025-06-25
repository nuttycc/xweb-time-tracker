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
} from '@/core/db/models';

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
    resolution: 'crash_recovery' as const,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { resolution: _resolution, ...dataWithoutResolution } = validEventsLogData; // Destructuring to exclude resolution property
      const result = EventsLogSchema.safeParse(dataWithoutResolution);
      expect(result.success).toBe(true);
    });

    it('should reject timestamp in seconds (too small)', () => {
      // Unix timestamp in seconds (10 digits) should be rejected
      const invalidData = { ...validEventsLogData, timestamp: 1735000000 }; // 2024 in seconds
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Timestamp must be in milliseconds');
      }
    });

    it('should accept valid timestamp in milliseconds', () => {
      // Unix timestamp in milliseconds (13 digits) should be accepted
      const validData = { ...validEventsLogData, timestamp: 1735000000000 }; // 2024 in milliseconds
      const result = EventsLogSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative timestamp', () => {
      const invalidData = { ...validEventsLogData, timestamp: -1000000000000 };
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero timestamp', () => {
      const invalidData = { ...validEventsLogData, timestamp: 0 };
      const result = EventsLogSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
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
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = CreateEventsLogSchema.safeParse(createData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.isProcessed).toBe(0); // Default value
        expect('id' in result.data).toBe(false); // Should not have ID field
      }
    });

    it('should omit id field from create data', () => {
      const createDataWithId = {
        id: 1,
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = CreateEventsLogSchema.safeParse(createDataWithId);
      // CreateEventsLogSchema omits id field, so extra fields are ignored by Zod
      expect(result.success).toBe(true);
      if (result.success) {
        expect('id' in result.data).toBe(false);
        expect(result.data.isProcessed).toBe(0); // Default value should be applied
      }
    });

    it('should apply default isProcessed value', () => {
      const createData = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = CreateEventsLogSchema.safeParse(createData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isProcessed).toBe(0);
      }
    });
  });

  describe('UpdateEventsLogSchema', () => {
    it('should validate update data with required id', () => {
      const updateData = {
        id: 1,
        isProcessed: 1 as const,
        timestamp: Date.now(),
      };

      const result = UpdateEventsLogSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.isProcessed).toBe(1);
      }
    });

    it('should reject update data without id', () => {
      const updateDataWithoutId = {
        isProcessed: 1 as const,
        timestamp: Date.now(),
      };

      const result = UpdateEventsLogSchema.safeParse(updateDataWithoutId);
      expect(result.success).toBe(false);
    });

    it('should allow partial updates', () => {
      const partialUpdateData = {
        id: 1,
        isProcessed: 1 as const,
      };

      const result = UpdateEventsLogSchema.safeParse(partialUpdateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.isProcessed).toBe(1);
        expect(result.data.timestamp).toBeUndefined();
      }
    });

    it('should validate all optional fields in update', () => {
      const fullUpdateData = {
        id: 1,
        timestamp: Date.now(),
        eventType: 'active_time_start' as const,
        tabId: 456,
        url: 'https://updated.example.com',
        visitId: '550e8400-e29b-41d4-a716-446655440002',
        activityId: '550e8400-e29b-41d4-a716-446655440003',
        isProcessed: 1 as const,
        resolution: 'crash_recovery' as const,
      };

      const result = UpdateEventsLogSchema.safeParse(fullUpdateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe('active_time_start');
        expect(result.data.resolution).toBe('crash_recovery');
      }
    });

    it('should reject invalid field values in update', () => {
      const invalidUpdateData = {
        id: 1,
        eventType: 'invalid_event_type',
        isProcessed: 1 as const,
      };

      const result = UpdateEventsLogSchema.safeParse(invalidUpdateData);
      expect(result.success).toBe(false);
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

    it('should validate create data using validateCreate', () => {
      const createData = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const validated = EventsLogValidation.validateCreate(createData);
      expect(validated.eventType).toBe('open_time_start');
      expect(validated.isProcessed).toBe(0);
      expect('id' in validated).toBe(false);
    });

    it('should safely validate create data using safeValidateCreate', () => {
      const createData = {
        timestamp: Date.now(),
        eventType: 'open_time_start' as const,
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = EventsLogValidation.safeValidateCreate(createData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isProcessed).toBe(0);
      }
    });

    it('should throw error for invalid create data', () => {
      const invalidCreateData = {
        timestamp: Date.now(),
        eventType: 'invalid_type',
        tabId: 123,
        url: 'https://example.com/path',
        visitId: '550e8400-e29b-41d4-a716-446655440000',
        activityId: '550e8400-e29b-41d4-a716-446655440001',
      };

      expect(() => EventsLogValidation.validateCreate(invalidCreateData)).toThrow();
    });

    it('should validate update data using validateUpdate', () => {
      const updateData = {
        id: 1,
        isProcessed: 1 as const,
        timestamp: Date.now(),
      };

      const validated = EventsLogValidation.validateUpdate(updateData);
      expect(validated.id).toBe(1);
      expect(validated.isProcessed).toBe(1);
    });

    it('should safely validate update data using safeValidateUpdate', () => {
      const updateData = {
        id: 1,
        isProcessed: 1 as const,
      };

      const result = EventsLogValidation.safeValidateUpdate(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
      }
    });

    it('should throw error for update data without required id', () => {
      const invalidUpdateData = {
        isProcessed: 1 as const,
      };

      expect(() => EventsLogValidation.validateUpdate(invalidUpdateData)).toThrow();
    });

    it('should return error for invalid update data using safeValidateUpdate', () => {
      const invalidUpdateData = {
        id: 'not-a-number',
        isProcessed: 1 as const,
      };

      const result = EventsLogValidation.safeValidateUpdate(invalidUpdateData);
      expect(result.success).toBe(false);
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
    last_updated: Date.now(),
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

    it('should reject float values for total_open_time', () => {
      const invalidData = { ...validAggregatedStatsData, total_open_time: 3600.5 };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('expected int');
      }
    });

    it('should reject float values for total_active_time', () => {
      const invalidData = { ...validAggregatedStatsData, total_active_time: 1800.7 };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('expected int');
      }
    });

    it('should accept integer values for time fields', () => {
      const validData = {
        ...validAggregatedStatsData,
        total_open_time: 3600,
        total_active_time: 1800,
      };
      const result = AggregatedStatsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept zero values for time fields', () => {
      const validData = {
        ...validAggregatedStatsData,
        total_open_time: 0,
        total_active_time: 0,
      };
      const result = AggregatedStatsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const invalidData = { ...validAggregatedStatsData, url: 'not-a-url' };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject last_updated timestamp in seconds (too small)', () => {
      // Unix timestamp in seconds (10 digits) should be rejected
      const invalidData = { ...validAggregatedStatsData, last_updated: 1735000000 }; // 2024 in seconds
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Timestamp must be in milliseconds');
      }
    });

    it('should accept valid last_updated timestamp in milliseconds', () => {
      // Unix timestamp in milliseconds (13 digits) should be accepted
      const validData = { ...validAggregatedStatsData, last_updated: 1735000000000 }; // 2024 in milliseconds
      const result = AggregatedStatsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative last_updated timestamp', () => {
      const invalidData = { ...validAggregatedStatsData, last_updated: -1000000000000 };
      const result = AggregatedStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero last_updated timestamp', () => {
      const invalidData = { ...validAggregatedStatsData, last_updated: 0 };
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
        total_active_time: 1800,
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
        last_updated: Date.now(),
      };

      const result = CreateAggregatedStatsSchema.safeParse(createData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid last_updated timestamp in creation schema', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
        last_updated: 1735000000, // Invalid: seconds instead of milliseconds
      };

      const result = CreateAggregatedStatsSchema.safeParse(createData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Timestamp must be in milliseconds');
      }
    });

    it('should reject float values for time fields in creation schema', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600.5, // Invalid: float value
        total_active_time: 1800,
      };

      const result = CreateAggregatedStatsSchema.safeParse(createData);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('expected int');
      }
    });
  });

  describe('UpdateAggregatedStatsSchema', () => {
    it('should validate partial update data', () => {
      const updateData = {
        key: '2023-12-25:https://example.com/path',
        total_open_time: 7200,
        last_updated: Date.now(),
      };

      const result = UpdateAggregatedStatsSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total_open_time).toBe(7200);
        expect(result.data.date).toBeUndefined();
      }
    });

    it('should allow updating only specific fields', () => {
      const updateData = {
        key: '2023-12-25:https://example.com/path',
        total_active_time: 3600,
      };

      const result = UpdateAggregatedStatsSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total_active_time).toBe(3600);
        expect(result.data.total_open_time).toBeUndefined();
      }
    });

    it('should reject invalid field values in update', () => {
      const invalidUpdateData = {
        key: 'invalid-key-format',
        total_open_time: 3600,
      };

      const result = UpdateAggregatedStatsSchema.safeParse(invalidUpdateData);
      expect(result.success).toBe(false);
    });

    it('should reject negative time values in update', () => {
      const invalidUpdateData = {
        key: '2023-12-25:https://example.com/path',
        total_open_time: -100,
      };

      const result = UpdateAggregatedStatsSchema.safeParse(invalidUpdateData);
      expect(result.success).toBe(false);
    });
  });

  describe('UpsertAggregatedStatsSchema', () => {
    it('should validate complete upsert data', () => {
      const upsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const result = UpsertAggregatedStatsSchema.safeParse(upsertData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('2023-12-25:https://example.com/path');
        expect(result.data.total_open_time).toBe(3600);
      }
    });

    it('should allow optional last_updated in upsert', () => {
      const upsertDataWithTimestamp = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
        last_updated: Date.now(),
      };

      const result = UpsertAggregatedStatsSchema.safeParse(upsertDataWithTimestamp);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.last_updated).toBeDefined();
      }
    });

    it('should reject invalid upsert data', () => {
      const invalidUpsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'not-a-valid-url',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const result = UpsertAggregatedStatsSchema.safeParse(invalidUpsertData);
      expect(result.success).toBe(false);
    });

    it('should require all mandatory fields for upsert', () => {
      const incompleteUpsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        // Missing required fields
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const result = UpsertAggregatedStatsSchema.safeParse(incompleteUpsertData);
      expect(result.success).toBe(false);
    });
  });

  describe('DateRangeQuerySchema', () => {
    it('should validate correct date range', () => {
      const dateRange = {
        startDate: '2023-12-01',
        endDate: '2023-12-31',
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const dateRange = {
        startDate: '2023/12/01',
        endDate: '2023-12-31',
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(false);
    });

    it('should reject start date after end date', () => {
      const dateRange = {
        startDate: '2023-12-31',
        endDate: '2023-12-01',
      };

      const result = DateRangeQuerySchema.safeParse(dateRange);
      expect(result.success).toBe(false);
    });

    it('should allow same start and end date', () => {
      const dateRange = {
        startDate: '2023-12-25',
        endDate: '2023-12-25',
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
        total_active_time: 1800,
      };

      const validated = AggregatedStatsValidation.validateUpsert(upsertData);
      expect(validated.key).toBe('2023-12-25:https://example.com/path');
    });

    it('should validate create data using validateCreate', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const validated = AggregatedStatsValidation.validateCreate(createData);
      expect(validated.key).toBe('2023-12-25:https://example.com/path');
      expect(validated.total_open_time).toBe(3600);
    });

    it('should safely validate create data using safeValidateCreate', () => {
      const createData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const result = AggregatedStatsValidation.safeValidateCreate(createData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('2023-12-25:https://example.com/path');
      }
    });

    it('should throw error for invalid create data', () => {
      const invalidCreateData = {
        key: 'invalid-key-format',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      expect(() => AggregatedStatsValidation.validateCreate(invalidCreateData)).toThrow();
    });

    it('should validate update data using validateUpdate', () => {
      const updateData = {
        key: '2023-12-25:https://example.com/path',
        total_open_time: 7200,
        last_updated: Date.now(),
      };

      const validated = AggregatedStatsValidation.validateUpdate(updateData);
      expect(validated.key).toBe('2023-12-25:https://example.com/path');
      expect(validated.total_open_time).toBe(7200);
    });

    it('should safely validate update data using safeValidateUpdate', () => {
      const updateData = {
        key: '2023-12-25:https://example.com/path',
        total_active_time: 3600,
      };

      const result = AggregatedStatsValidation.safeValidateUpdate(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total_active_time).toBe(3600);
      }
    });

    it('should safely validate upsert data using safeValidateUpsert', () => {
      const upsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'https://example.com/path',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      const result = AggregatedStatsValidation.safeValidateUpsert(upsertData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('2023-12-25:https://example.com/path');
      }
    });

    it('should throw error for invalid upsert data', () => {
      const invalidUpsertData = {
        key: '2023-12-25:https://example.com/path',
        date: '2023-12-25',
        url: 'not-a-valid-url',
        hostname: 'example.com',
        parentDomain: 'example.com',
        total_open_time: 3600,
        total_active_time: 1800,
      };

      expect(() => AggregatedStatsValidation.validateUpsert(invalidUpsertData)).toThrow();
    });

    it('should validate date range using validateDateRange', () => {
      const dateRange = {
        startDate: '2023-12-01',
        endDate: '2023-12-31',
      };

      const validated = AggregatedStatsValidation.validateDateRange(dateRange);
      expect(validated.startDate).toBe('2023-12-01');
      expect(validated.endDate).toBe('2023-12-31');
    });

    it('should safely validate date range using safeValidateDateRange', () => {
      const dateRange = {
        startDate: '2023-12-01',
        endDate: '2023-12-31',
      };

      const result = AggregatedStatsValidation.safeValidateDateRange(dateRange);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBe('2023-12-01');
      }
    });

    it('should throw error for invalid date range', () => {
      const invalidDateRange = {
        startDate: '2023-12-31',
        endDate: '2023-12-01',
      };

      expect(() => AggregatedStatsValidation.validateDateRange(invalidDateRange)).toThrow();
    });

    it('should return error for invalid date range using safeValidateDateRange', () => {
      const invalidDateRange = {
        startDate: '2023/12/01',
        endDate: '2023-12-31',
      };

      const result = AggregatedStatsValidation.safeValidateDateRange(invalidDateRange);
      expect(result.success).toBe(false);
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
        'checkpoint',
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
