/**
 * Type-safe StartupRecovery Unit Tests
 *
 * Demonstrates proper TypeScript testing practices without using 'any' or 'unknown'
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { StartupRecovery } from '../../../../src/core/tracker/recovery/StartupRecovery';
import { EventGenerator } from '../../../../src/core/tracker/events/EventGenerator';
import { DatabaseService } from '../../../../src/core/db/services/database.service';
import {
  createMockEventGenerator,
  createMockDatabaseService,
  createTestEventsLogRecord,
} from '../../../utils/startup-recovery-helpers';

// Mock browser APIs
const mockTabs = {
  query: vi.fn(),
};

describe('StartupRecovery (Type-Safe)', () => {
  let startupRecovery: StartupRecovery;
  let mockEventGenerator: EventGenerator;
  let mockDatabaseService: DatabaseService;

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.clearAllMocks();

    // Create type-safe mocks
    mockEventGenerator = createMockEventGenerator();
    mockDatabaseService = await createMockDatabaseService();

    // Setup browser mocks
    fakeBrowser.tabs.query = mockTabs.query;

    // Note: In a real implementation, we would use dependency injection
    // For now, we create a real instance and test the public interface
    startupRecovery = new StartupRecovery(
      mockEventGenerator,
      mockDatabaseService,
      {
        enableDebugLogging: true,
      }
    );
  });

  describe('Basic Recovery Operations', () => {
    it('should execute recovery with no orphan sessions', async () => {
      // Setup: No orphan events using vi.mocked for proper typing
      const mockGetEventsByTypeAndTimeRange = vi.mocked(
        mockDatabaseService.getEventsByTypeAndTimeRange!
      );
      mockGetEventsByTypeAndTimeRange
        .mockResolvedValueOnce([]) // open_time_start events
        .mockResolvedValueOnce([]); // active_time_start events

      mockTabs.query.mockResolvedValue([]);

      // Execute
      const result = await startupRecovery.executeRecovery();

      // Verify
      expect(result.stats.orphanSessionsFound).toBe(0);
      expect(result.stats.recoveryEventsGenerated).toBe(0);
      expect(result.stats.currentTabsInitialized).toBe(0);
      expect(result.stats.errors).toEqual([]);
    });

    it('should recover orphan open_time_start sessions', async () => {
      // Setup: Mock orphan open_time_start event
      const orphanEvent = createTestEventsLogRecord({
        eventType: 'open_time_start',
        visitId: 'visit-1',
      });

      const mockGetEventsByTypeAndTimeRange = vi.mocked(
        mockDatabaseService.getEventsByTypeAndTimeRange!
      );
      mockGetEventsByTypeAndTimeRange
        .mockResolvedValueOnce([orphanEvent]) // open_time_start events
        .mockResolvedValueOnce([]); // active_time_start events

      // Mock that no end event exists (making it an orphan)
      const mockGetEventsByVisitId = vi.mocked(mockDatabaseService.getEventsByVisitId!);
      mockGetEventsByVisitId.mockResolvedValue([]);

      // Mock no current tabs
      mockTabs.query.mockResolvedValue([]);

      // Execute
      const result = await startupRecovery.executeRecovery();

      // Verify
      expect(result.stats.orphanSessionsFound).toBe(1);
      expect(result.stats.recoveryEventsGenerated).toBe(1);
      expect(mockEventGenerator.generateOpenTimeEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tabState: expect.objectContaining({
            url: 'https://example.com',
            visitId: 'visit-1',
          }),
          resolution: 'crash_recovery',
        })
      );
    });

    it('should recover orphan active_time_start sessions', async () => {
      // Setup: Mock orphan active_time_start event
      const orphanEvent = createTestEventsLogRecord({
        eventType: 'active_time_start',
        visitId: 'visit-1',
        activityId: 'activity-1',
      });

      const mockGetEventsByTypeAndTimeRange = vi.mocked(
        mockDatabaseService.getEventsByTypeAndTimeRange!
      );
      mockGetEventsByTypeAndTimeRange
        .mockResolvedValueOnce([]) // open_time_start events
        .mockResolvedValueOnce([orphanEvent]); // active_time_start events

      const mockGetEventsByActivityId = vi.mocked(mockDatabaseService.getEventsByActivityId!);
      mockGetEventsByActivityId.mockResolvedValue([]);

      mockTabs.query.mockResolvedValue([]);

      // Execute
      const result = await startupRecovery.executeRecovery();

      // Verify
      expect(result.stats.orphanSessionsFound).toBe(1);
      expect(result.stats.recoveryEventsGenerated).toBe(1);
      expect(mockEventGenerator.generateActiveTimeEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tabState: expect.objectContaining({
            url: 'https://example.com',
            activityId: 'activity-1',
          }),
          resolution: 'crash_recovery',
        }),
        'tab_closed' // reason parameter
      );
    });
  });

  describe('Edge Cases', () => {
    it('should skip sessions that already have end events', async () => {
      // Setup: Event with corresponding end event
      const startEvent = createTestEventsLogRecord({
        eventType: 'open_time_start',
        visitId: 'visit-1',
      });

      const endEvent = createTestEventsLogRecord({
        id: 2,
        eventType: 'open_time_end',
        visitId: 'visit-1',
      });

      const mockGetEventsByTypeAndTimeRange = vi.mocked(
        mockDatabaseService.getEventsByTypeAndTimeRange!
      );
      mockGetEventsByTypeAndTimeRange
        .mockResolvedValueOnce([startEvent]) // open_time_start events
        .mockResolvedValueOnce([]); // active_time_start events

      const mockGetEventsByVisitId = vi.mocked(mockDatabaseService.getEventsByVisitId!);
      mockGetEventsByVisitId.mockResolvedValue([endEvent]);

      mockTabs.query.mockResolvedValue([]);

      // Execute
      const result = await startupRecovery.executeRecovery();

      // Verify - should not generate recovery events for sessions that already have end events
      expect(result.stats.orphanSessionsFound).toBe(0);
      expect(result.stats.recoveryEventsGenerated).toBe(0);
      expect(mockEventGenerator.generateOpenTimeEnd).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Setup: Database error
      const mockGetEventsByTypeAndTimeRange = vi.mocked(
        mockDatabaseService.getEventsByTypeAndTimeRange!
      );
      mockGetEventsByTypeAndTimeRange.mockRejectedValue(new Error('Database connection failed'));

      // Execute and expect it to throw
      await expect(startupRecovery.executeRecovery()).rejects.toThrow(
        'Phase 1 failed: Database connection failed'
      );
    });
  });
});
