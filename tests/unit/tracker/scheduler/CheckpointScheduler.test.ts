/**
 * Unit Tests for CheckpointScheduler
 *
 * Tests the checkpoint scheduling system using chrome.alarms API, including
 * alarm creation, periodic triggering, session threshold detection, and
 * checkpoint event generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from '#imports';
import {
  CheckpointScheduler,
  createCheckpointScheduler,
} from '@/core/tracker/scheduler/CheckpointScheduler';
import { TabStateManager } from '@/core/tracker/state/TabStateManager';
import { EventGenerator } from '@/core/tracker/events/EventGenerator';
import { EventQueue } from '@/core/tracker/queue/EventQueue';
import { TabState, DomainEvent } from '@/core/tracker/types';

// Mock dependencies
const mockTabStateManager = {
  getAllTabStates: vi.fn(),
} as unknown as TabStateManager;

const mockEventGenerator = {
  generateCheckpoint: vi.fn(),
} as unknown as EventGenerator;

const mockEventQueue = {
  enqueue: vi.fn(),
} as unknown as EventQueue;

// Helper function to create test domain event
function createTestEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    timestamp: Date.now(),
    eventType: 'checkpoint',
    tabId: 123,
    url: 'https://example.com/test',
    visitId: '550e8400-e29b-41d4-a716-446655440000',
    activityId: '550e8400-e29b-41d4-a716-446655440001',
    isProcessed: 0,
    ...overrides,
  };
}

// Helper function to create test tab state
function createTestTabState(overrides: Partial<TabState> = {}): TabState {
  return {
    url: 'https://example.com/test',
    visitId: '550e8400-e29b-41d4-a716-446655440000',
    activityId: '550e8400-e29b-41d4-a716-446655440001',
    isAudible: false,
    lastInteractionTimestamp: Date.now() - 1000,
    openTimeStart: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    activeTimeStart: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    isFocused: true,
    tabId: 123,
    windowId: 1,
    ...overrides,
  };
}

describe('CheckpointScheduler', () => {
  let scheduler: CheckpointScheduler;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();

    scheduler = new CheckpointScheduler(mockTabStateManager, mockEventGenerator, mockEventQueue, {
      enableDebugLogging: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(scheduler.isRunning()).toBe(false);

      const stats = scheduler.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.totalCheckpoints).toBe(0);
      expect(stats.activeSessions).toBe(0);
    });

    it('should create alarm on initialization', async () => {
      await scheduler.initialize();

      expect(scheduler.isRunning()).toBe(true);

      // Verify alarm was created
      const alarms = await browser.alarms.getAll();
      expect(alarms.length).toBe(1);
      expect(alarms[0].name).toBe('webtime-checkpoint-scheduler');
    });

    it('should not create duplicate alarms', async () => {
      // Create alarm manually first
      await browser.alarms.create('webtime-checkpoint-scheduler', {
        delayInMinutes: 30,
        periodInMinutes: 30,
      });

      await scheduler.initialize();

      // Should still have only one alarm
      const alarms = await browser.alarms.getAll();
      expect(alarms.length).toBe(1);
    });

    it('should handle initialization errors gracefully', async () => {
      // Create a new scheduler for this test to avoid affecting others
      const testScheduler = new CheckpointScheduler(
        mockTabStateManager,
        mockEventGenerator,
        mockEventQueue,
        { enableDebugLogging: true }
      );

      // Mock browser.alarms.create to throw error
      const createSpy = vi
        .spyOn(browser.alarms, 'create')
        .mockRejectedValue(new Error('Permission denied'));

      await expect(testScheduler.initialize()).rejects.toThrow('Permission denied');
      expect(testScheduler.isRunning()).toBe(false);

      // Restore the spy
      createSpy.mockRestore();
    });
  });

  describe('Alarm Management', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should handle alarm events correctly', async () => {
      // Mock empty tab states
      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(new Map());

      // Trigger alarm manually and wait for it to complete
      await fakeBrowser.alarms.onAlarm.trigger({
        name: 'webtime-checkpoint-scheduler',
        scheduledTime: Date.now(),
      });

      // Verify that the check was performed by checking stats
      const stats = scheduler.getStats();
      expect(stats.totalChecks).toBe(1);
    });

    it('should ignore alarms with different names', async () => {
      const checkSpy = vi.spyOn(scheduler, 'triggerCheck');

      // Trigger alarm with different name
      await fakeBrowser.alarms.onAlarm.trigger({
        name: 'different-alarm',
        scheduledTime: Date.now(),
      });

      expect(checkSpy).not.toHaveBeenCalled();
    });

    it('should stop and clear alarms', async () => {
      await scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);

      // Verify alarm was cleared
      const alarms = await browser.alarms.getAll();
      expect(alarms.length).toBe(0);
    });
  });

  describe('Checkpoint Evaluation', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should detect active time threshold exceeded', async () => {
      const longActiveSession = createTestTabState({
        activeTimeStart: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago (exceeds 2h threshold)
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(
        new Map([[123, longActiveSession]])
      );

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].needsCheckpoint).toBe(true);
      expect(evaluations[0].checkpointType).toBe('active_time');
      expect(mockEventGenerator.generateCheckpoint).toHaveBeenCalled();
      expect(mockEventQueue.enqueue).toHaveBeenCalled();
    });

    it('should detect open time threshold exceeded', async () => {
      const longOpenSession = createTestTabState({
        activeTimeStart: null, // No active time
        openTimeStart: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago (exceeds 4h threshold)
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(
        new Map([[123, longOpenSession]])
      );

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].needsCheckpoint).toBe(true);
      expect(evaluations[0].checkpointType).toBe('open_time');
    });

    it('should prioritize active time over open time', async () => {
      const bothThresholdsExceeded = createTestTabState({
        activeTimeStart: Date.now() - 3 * 60 * 60 * 1000, // 3 hours (exceeds active threshold)
        openTimeStart: Date.now() - 5 * 60 * 60 * 1000, // 5 hours (exceeds open threshold)
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(
        new Map([[123, bothThresholdsExceeded]])
      );

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations[0].checkpointType).toBe('active_time');
    });

    it('should not generate checkpoint when thresholds not exceeded', async () => {
      const shortSession = createTestTabState({
        activeTimeStart: Date.now() - 30 * 60 * 1000, // 30 minutes
        openTimeStart: Date.now() - 1 * 60 * 60 * 1000, // 1 hour
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(
        new Map([[123, shortSession]])
      );

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations).toHaveLength(1);
      expect(evaluations[0].needsCheckpoint).toBe(false);
      expect(evaluations[0].checkpointType).toBe(null);
      expect(mockEventGenerator.generateCheckpoint).not.toHaveBeenCalled();
    });

    it('should handle multiple sessions correctly', async () => {
      const sessions = new Map([
        [
          1,
          createTestTabState({
            activeTimeStart: Date.now() - 3 * 60 * 60 * 1000, // Needs checkpoint
          }),
        ],
        [
          2,
          createTestTabState({
            activeTimeStart: Date.now() - 30 * 60 * 1000, // No checkpoint needed
          }),
        ],
        [
          3,
          createTestTabState({
            activeTimeStart: null,
            openTimeStart: Date.now() - 5 * 60 * 60 * 1000, // Needs checkpoint
          }),
        ],
      ]);

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(sessions);
      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations).toHaveLength(3);

      const checkpointsNeeded = evaluations.filter(e => e.needsCheckpoint);
      expect(checkpointsNeeded).toHaveLength(2);

      expect(mockEventGenerator.generateCheckpoint).toHaveBeenCalledTimes(2);
      expect(mockEventQueue.enqueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should handle checkpoint generation errors', async () => {
      const session = createTestTabState({
        activeTimeStart: Date.now() - 3 * 60 * 60 * 1000,
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(new Map([[123, session]]));

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: false,
        error: 'Generation failed',
      });

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations[0].needsCheckpoint).toBe(true);
      expect(mockEventQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should handle event queue errors', async () => {
      const session = createTestTabState({
        activeTimeStart: Date.now() - 3 * 60 * 60 * 1000,
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(new Map([[123, session]]));

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      vi.mocked(mockEventQueue.enqueue).mockRejectedValue(new Error('Queue full'));

      // Should not throw, but handle error gracefully
      await expect(scheduler.triggerCheck()).resolves.not.toThrow();
    });

    it('should handle focus state manager errors', async () => {
      vi.mocked(mockTabStateManager.getAllTabStates).mockImplementation(() => {
        throw new Error('State manager error');
      });

      await expect(scheduler.triggerCheck()).rejects.toThrow('State manager error');
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await scheduler.initialize();
    });

    it('should track statistics correctly', async () => {
      const session = createTestTabState({
        activeTimeStart: Date.now() - 3 * 60 * 60 * 1000,
      });

      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(new Map([[123, session]]));

      vi.mocked(mockEventGenerator.generateCheckpoint).mockReturnValue({
        success: true,
        event: createTestEvent(),
      });

      // Reset the mock to resolve successfully for this test
      vi.mocked(mockEventQueue.enqueue).mockResolvedValue();

      await scheduler.triggerCheck();

      const stats = scheduler.getStats();
      expect(stats.totalChecks).toBe(1);
      expect(stats.totalCheckpoints).toBe(1);
      expect(stats.activeSessions).toBe(1);
      expect(stats.lastCheckTime).toBeTypeOf('number');
    });

    it('should handle empty sessions', async () => {
      vi.mocked(mockTabStateManager.getAllTabStates).mockReturnValue(new Map());

      const evaluations = await scheduler.triggerCheck();

      expect(evaluations).toHaveLength(0);

      const stats = scheduler.getStats();
      expect(stats.totalChecks).toBe(1);
      expect(stats.totalCheckpoints).toBe(0);
      expect(stats.activeSessions).toBe(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create scheduler with default config', () => {
      const newScheduler = createCheckpointScheduler(
        mockTabStateManager,
        mockEventGenerator,
        mockEventQueue
      );

      expect(newScheduler).toBeInstanceOf(CheckpointScheduler);
    });

    it('should create debug scheduler', async () => {
      const { createDebugCheckpointScheduler } = await import(
        '@/core/tracker/scheduler/CheckpointScheduler'
      );

      const debugScheduler = createDebugCheckpointScheduler(
        mockTabStateManager,
        mockEventGenerator,
        mockEventQueue
      );

      expect(debugScheduler).toBeInstanceOf(CheckpointScheduler);
    });
  });
});
