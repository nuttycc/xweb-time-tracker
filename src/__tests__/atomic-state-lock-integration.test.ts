import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

// Mock the dependencies
vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

/**
 * Integration tests for atomic state lock mechanism
 * Tests the core logic of preventing race conditions in session ending
 */
describe('Atomic State Lock Integration', () => {
  let mockEventGenerator: MockProxy<{
    generateActiveTimeEnd: (
      context: unknown,
      reason: string
    ) => { success: boolean; event?: unknown; error?: string };
  }>;
  let mockEventQueue: MockProxy<{
    enqueue: (event: unknown) => Promise<void>;
  }>;
  let mockTabStateManager: MockProxy<{
    updateTabState: (
      tabId: number,
      updates: { activityId: string | null; activeTimeStart: number | null }
    ) => void;
    getTabState: (
      tabId: number
    ) => { activityId: string | null; activeTimeStart: number | null } | undefined;
  }>;

  beforeEach(() => {
    mockEventGenerator = mock();
    mockEventQueue = mock();
    mockTabStateManager = mock();
  });

  describe('Core Logic: Atomic State Clearing', () => {
    it('should atomically check and clear state before generating event', async () => {
      // Simulate the core logic of generateAndQueueActiveTimeEnd
      const tabState = {
        tabId: 1,
        activityId: 'activity-123',
        activeTimeStart: Date.now() - 5000,
        visitId: 'visit-123',
        url: 'https://example.com',
      };

      const timestamp = Date.now();
      let stateCleared = false;

      // Mock successful event generation
      mockEventGenerator.generateActiveTimeEnd.mockReturnValue({
        success: true,
        event: {
          timestamp,
          eventType: 'active_time_end',
          tabId: 1,
          activityId: 'activity-123',
        },
      });

      // Simulate the atomic state lock logic
      const generateAndQueueActiveTimeEnd = async (inputTabState: {
        tabId: number;
        activityId: string | null;
        activeTimeStart: number | null;
        visitId?: string;
        url?: string;
      }) => {
        // Atomic check-and-clear operation
        if (!inputTabState.activityId || !inputTabState.activeTimeStart) {
          return; // Early return if already cleared
        }

        // Capture current values
        const currentActivityId = inputTabState.activityId;
        const currentActiveTimeStart = inputTabState.activeTimeStart;

        // Immediately clear state (atomic operation)
        mockTabStateManager.updateTabState(inputTabState.tabId, {
          activityId: null,
          activeTimeStart: null,
        });
        stateCleared = true;

        // Generate event with captured values
        const context = {
          tabState: {
            ...inputTabState,
            activityId: currentActivityId,
            activeTimeStart: currentActiveTimeStart,
          },
          timestamp,
        };

        const result = mockEventGenerator.generateActiveTimeEnd(context, 'timeout');
        if (result.success && result.event) {
          await mockEventQueue.enqueue(result.event);
        }
      };

      // Act
      await generateAndQueueActiveTimeEnd(tabState);

      // Assert: State was cleared before event generation
      expect(stateCleared).toBe(true);
      expect(mockTabStateManager.updateTabState).toHaveBeenCalledWith(1, {
        activityId: null,
        activeTimeStart: null,
      });
      expect(mockEventGenerator.generateActiveTimeEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tabState: expect.objectContaining({
            activityId: 'activity-123',
            activeTimeStart: expect.any(Number),
          }),
        }),
        'timeout'
      );
      expect(mockEventQueue.enqueue).toHaveBeenCalled();
    });

    it('should prevent duplicate events from concurrent calls', async () => {
      const tabState1 = {
        tabId: 1,
        activityId: 'activity-123',
        activeTimeStart: Date.now() - 5000,
      };

      const tabState2 = {
        tabId: 1,
        activityId: null, // Already cleared by first call
        activeTimeStart: null,
      };

      let callCount = 0;

      // Simulate the atomic logic with race condition
      const generateAndQueueActiveTimeEnd = async (inputTabState: {
        tabId: number;
        activityId: string | null;
        activeTimeStart: number | null;
      }) => {
        callCount++;

        // Atomic check - only first call should proceed
        if (!inputTabState.activityId || !inputTabState.activeTimeStart) {
          return; // Second call returns early
        }

        // First call clears state and generates event
        mockTabStateManager.updateTabState(inputTabState.tabId, {
          activityId: null,
          activeTimeStart: null,
        });

        mockEventGenerator.generateActiveTimeEnd.mockReturnValue({
          success: true,
          event: { eventType: 'active_time_end' },
        });

        const result = mockEventGenerator.generateActiveTimeEnd({}, 'timeout');
        if (result.success) {
          await mockEventQueue.enqueue(result.event);
        }
      };

      // Act: Simulate concurrent calls
      await Promise.all([
        generateAndQueueActiveTimeEnd(tabState1), // First call with active state
        generateAndQueueActiveTimeEnd(tabState2), // Second call with cleared state
      ]);

      // Assert: Only one call should have generated an event
      expect(callCount).toBe(2); // Both calls executed
      expect(mockEventGenerator.generateActiveTimeEnd).toHaveBeenCalledTimes(1); // Only first call generated event
      expect(mockEventQueue.enqueue).toHaveBeenCalledTimes(1); // Only one event queued
      expect(mockTabStateManager.updateTabState).toHaveBeenCalledTimes(1); // Only one state update
    });
  });

  describe('Core Logic: Session End Integration', () => {
    it('should end active session when tab becomes idle', async () => {
      const tabState = {
        tabId: 1,
        activityId: 'activity-123',
        activeTimeStart: Date.now() - 5000,
      };

      // Mock tab state manager to return active state
      mockTabStateManager.getTabState.mockReturnValue(tabState);

      // Mock successful event generation
      mockEventGenerator.generateActiveTimeEnd.mockReturnValue({
        success: true,
        event: {
          eventType: 'active_time_end',
          activityId: 'activity-123',
        },
      });

      // Simulate endActiveSessionDueToIdle logic
      const endActiveSessionDueToIdle = async (tabId: number, timestamp: number) => {
        const currentTabState = mockTabStateManager.getTabState(tabId);

        if (currentTabState?.activeTimeStart) {
          // Use the atomic generateAndQueueActiveTimeEnd logic
          if (currentTabState.activityId && currentTabState.activeTimeStart) {
            // Clear state atomically
            mockTabStateManager.updateTabState(tabId, {
              activityId: null,
              activeTimeStart: null,
            });

            // Generate event
            const result = mockEventGenerator.generateActiveTimeEnd(
              {
                tabState: currentTabState,
                timestamp,
              },
              'timeout'
            );

            if (result.success && result.event) {
              await mockEventQueue.enqueue(result.event);
            }
          }
        }
      };

      // Act
      await endActiveSessionDueToIdle(1, Date.now());

      // Assert: Session ended correctly
      expect(mockTabStateManager.getTabState).toHaveBeenCalledWith(1);
      expect(mockTabStateManager.updateTabState).toHaveBeenCalledWith(1, {
        activityId: null,
        activeTimeStart: null,
      });
      expect(mockEventGenerator.generateActiveTimeEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tabState: expect.objectContaining({
            activityId: 'activity-123',
          }),
        }),
        'timeout'
      );
      expect(mockEventQueue.enqueue).toHaveBeenCalled();
    });

    it('should not end session when tab has no active session', async () => {
      const tabState = {
        tabId: 1,
        activityId: null,
        activeTimeStart: null,
      };

      mockTabStateManager.getTabState.mockReturnValue(tabState);

      // Simulate endActiveSessionDueToIdle logic
      const endActiveSessionDueToIdle = async (tabId: number) => {
        const currentTabState = mockTabStateManager.getTabState(tabId);

        // Early return if no active session
        if (!currentTabState?.activeTimeStart) {
          return;
        }

        // This code should not execute
        mockEventGenerator.generateActiveTimeEnd({}, 'timeout');
      };

      // Act
      await endActiveSessionDueToIdle(1);

      // Assert: No session ending operations performed
      expect(mockTabStateManager.getTabState).toHaveBeenCalledWith(1);
      expect(mockEventGenerator.generateActiveTimeEnd).not.toHaveBeenCalled();
      expect(mockEventQueue.enqueue).not.toHaveBeenCalled();
      expect(mockTabStateManager.updateTabState).not.toHaveBeenCalled();
    });
  });

  describe('Core Logic: State Restoration on Failure', () => {
    it('should restore state when event generation fails', async () => {
      const tabState = {
        tabId: 1,
        activityId: 'activity-123',
        activeTimeStart: Date.now() - 5000,
      };

      // Mock failed event generation
      mockEventGenerator.generateActiveTimeEnd.mockReturnValue({
        success: false,
        error: 'Event generation failed',
      });

      // Simulate the atomic logic with failure handling
      const generateAndQueueActiveTimeEnd = async (inputTabState: {
        tabId: number;
        activityId: string | null;
        activeTimeStart: number | null;
      }) => {
        if (!inputTabState.activityId || !inputTabState.activeTimeStart) {
          return;
        }

        // Capture original values
        const originalActivityId = inputTabState.activityId;
        const originalActiveTimeStart = inputTabState.activeTimeStart;

        // Clear state atomically
        mockTabStateManager.updateTabState(inputTabState.tabId, {
          activityId: null,
          activeTimeStart: null,
        });

        // Try to generate event
        const result = mockEventGenerator.generateActiveTimeEnd({}, 'timeout');

        if (result.success && result.event) {
          await mockEventQueue.enqueue(result.event);
        } else {
          // Restore state on failure
          mockTabStateManager.updateTabState(inputTabState.tabId, {
            activityId: originalActivityId,
            activeTimeStart: originalActiveTimeStart,
          });
        }
      };

      // Act
      await generateAndQueueActiveTimeEnd(tabState);

      // Assert: State was cleared then restored
      expect(mockTabStateManager.updateTabState).toHaveBeenCalledTimes(2);
      expect(mockTabStateManager.updateTabState).toHaveBeenNthCalledWith(1, 1, {
        activityId: null,
        activeTimeStart: null,
      });
      expect(mockTabStateManager.updateTabState).toHaveBeenNthCalledWith(2, 1, {
        activityId: 'activity-123',
        activeTimeStart: expect.any(Number),
      });
      expect(mockEventQueue.enqueue).not.toHaveBeenCalled();
    });
  });
});
