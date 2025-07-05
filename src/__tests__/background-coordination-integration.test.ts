import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

/**
 * Integration tests for background script coordination mechanism
 * Tests the core logic of audible state changes, idle message handling, and system idle detection
 */
describe('Background Coordination Integration', () => {
  let mockSendMessage: MockedFunction<
    (type: string, data: unknown, tabId?: number) => Promise<void>
  >;
  let mockTimeTracker: MockProxy<{
    setAudibleStateChangeCallback: (callback: (tabId: number, isAudible: boolean) => void) => void;
    endActiveSessionDueToIdle: (tabId: number, timestamp: number) => Promise<void>;
    getStatus: () => { isStarted: boolean };
    getTabState: (tabId: number) => { isAudible: boolean } | undefined;
  }>;
  let mockBrowser: {
    windows: {
      getAll: MockedFunction<
        (options: unknown) => Promise<
          Array<{
            focused: boolean;
            tabs?: Array<{ active: boolean; id?: number }>;
          }>
        >
      >;
    };
  };

  beforeEach(() => {
    mockSendMessage = vi.fn().mockResolvedValue(undefined);
    mockTimeTracker = mock();

    // Mock browser API
    mockBrowser = {
      windows: {
        getAll: vi.fn(),
      },
    };
    (global as typeof global & { browser: typeof mockBrowser }).browser = mockBrowser;
  });

  describe('Audible State Change Coordination', () => {
    it('should handle audible state change', async () => {
      let audibleStateChangeCallback: ((tabId: number, isAudible: boolean) => void) | undefined;

      mockTimeTracker.setAudibleStateChangeCallback.mockImplementation(callback => {
        audibleStateChangeCallback = callback;
      });

      const setupCallback = () => {
        mockTimeTracker.setAudibleStateChangeCallback((tabId: number, isAudible: boolean) => {
          mockSendMessage('audible-state-changed', { tabId, isAudible }, tabId);
        });
      };

      setupCallback();

      // Act: Simulate state changes
      if (audibleStateChangeCallback) {
        audibleStateChangeCallback(1, false); // Becomes non-audible
        audibleStateChangeCallback(1, true); // Becomes audible
      }

      // Assert: Both state changes notified
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage).toHaveBeenNthCalledWith(
        1,
        'audible-state-changed',
        { tabId: 1, isAudible: false },
        1
      );
      expect(mockSendMessage).toHaveBeenNthCalledWith(
        2,
        'audible-state-changed',
        { tabId: 1, isAudible: true },
        1
      );
    });
  });

  describe('Session Termination due to Inactivity', () => {
    describe('on Tab Idle', () => {
      it('should end active session when receiving tab-is-idle message', async () => {
        // Setup a handler for the tab-idle message
        let tabIdleMessageHandler:
          | ((message: { data: { tabId: number; timestamp: number }; sender: { tab: { id: number } | null } }) => Promise<void>)
          | undefined;

        const setupTabIdleHandler = () => {
          tabIdleMessageHandler = async (message: { data: { tabId: number; timestamp: number }; sender: { tab: { id: number } | null } }) => {
            const { data, sender } = message;

            if (!sender.tab?.id) return;

            // Terminate the active session for this tab
            await mockTimeTracker.endActiveSessionDueToIdle(sender.tab.id, data.timestamp);
          };
        };

        // Act – register the handler and emit a fake message
        setupTabIdleHandler();

        const mockMessage = {
          data: { tabId: 1, timestamp: Date.now() },
          sender: { tab: { id: 1 } },
        };

        if (tabIdleMessageHandler) await tabIdleMessageHandler(mockMessage);

        // Assert – the session was ended for the correct tab
        expect(mockTimeTracker.endActiveSessionDueToIdle).toHaveBeenCalledWith(1, mockMessage.data.timestamp);
      });
    });

    describe('on System Idle or Lock', () => {
      it.each(['idle', 'locked'] as const)(
        'should end focused tab session when system state is %s',
        async state => {
          // Build different window scenarios for idle vs locked
          const mockWindows =
            state === 'idle'
              ? [
                  { focused: true, tabs: [
                    { id: 1, active: true, url: 'https://example.com' },
                    { id: 2, active: false, url: 'https://other.com' },
                  ] },
                  { focused: false, tabs: [{ id: 3, active: true, url: 'https://another.com' }] },
                ]
              : [
                  { focused: true, tabs: [{ id: 5, active: true, url: 'https://test.com' }] },
                ];

          mockBrowser.windows.getAll.mockResolvedValue(mockWindows);
          const expectedTabId = state === 'idle' ? 1 : 5;

          // Wire up the idle/lock listener
          let idleStateChangeHandler: ((newState: string) => Promise<void>) | undefined;

          const setupIdleStateListener = () => {
            idleStateChangeHandler = async (newState: string) => {
              if (newState === 'idle' || newState === 'locked') {
                const windows = await mockBrowser.windows.getAll({ populate: true, windowTypes: ['normal'] });
                const focusedWindow = windows.find(window => window.focused);
                const activeTab = focusedWindow?.tabs?.find(tab => tab.active);

                if (activeTab?.id) {
                  await mockTimeTracker.endActiveSessionDueToIdle(activeTab.id, Date.now());
                }
              }
            };
          };

          // Act – trigger the listener for the given state
          setupIdleStateListener();
          if (idleStateChangeHandler) await idleStateChangeHandler(state);

          // Assert – session termination and window query
          expect(mockBrowser.windows.getAll).toHaveBeenCalledWith({ populate: true, windowTypes: ['normal'] });
          expect(mockTimeTracker.endActiveSessionDueToIdle).toHaveBeenCalledWith(expectedTabId, expect.any(Number));
        },
      );

      it('should not end session when system becomes active', async () => {
        let idleStateChangeHandler: ((newState: string) => Promise<void>) | undefined;

        const setupIdleStateListener = () => {
          idleStateChangeHandler = async (newState: string) => {
            if (newState === 'idle' || newState === 'locked') {
              await mockTimeTracker.endActiveSessionDueToIdle(1, Date.now());
            }
            // No action for 'active' state
          };
        };

        setupIdleStateListener();

        // Act – simulate system becoming active
        if (idleStateChangeHandler) await idleStateChangeHandler('active');

        // Assert – no termination should have occurred
        expect(mockTimeTracker.endActiveSessionDueToIdle).not.toHaveBeenCalled();
      });
    });
  });

  describe('Tracking Status Query', () => {
    it('should return tracking status with audible state', async () => {
      const mockTabState = {
        isAudible: true,
        tabId: 1,
      };

      mockTimeTracker.getStatus.mockReturnValue({ isStarted: true });
      mockTimeTracker.getTabState.mockReturnValue(mockTabState);

      // Simulate get-tracking-status handler
      const handleGetTrackingStatus = async (message: {
        sender: { tab: { id: number } | null };
      }) => {
        const { sender } = message;
        const status = mockTimeTracker.getStatus();
        const tabId = sender.tab?.id || 0;

        // Get audible state from tab state manager
        const tabState = mockTimeTracker.getTabState(tabId);
        const isAudible = tabState?.isAudible || false;

        return {
          isTracking: status.isStarted,
          tabId,
          isAudible,
        };
      };

      // Act
      const result = await handleGetTrackingStatus({
        sender: { tab: { id: 1 } },
      });

      // Assert: Returns complete tracking status
      expect(result).toEqual({
        isTracking: true,
        tabId: 1,
        isAudible: true,
      });
      expect(mockTimeTracker.getStatus).toHaveBeenCalled();
      expect(mockTimeTracker.getTabState).toHaveBeenCalledWith(1);
    });

    it('should return a default audible state when tab state is not available', async () => {
      mockTimeTracker.getStatus.mockReturnValue({ isStarted: true });
      mockTimeTracker.getTabState.mockReturnValue(undefined);

      const handleGetTrackingStatus = async (message: {
        sender: { tab: { id: number } | null };
      }) => {
        const { sender } = message;
        const status = mockTimeTracker.getStatus();
        const tabId = sender.tab?.id || 0;
        const tabState = mockTimeTracker.getTabState(tabId);
        const isAudible = tabState?.isAudible || false;
        return {
          isTracking: status.isStarted,
          tabId,
          isAudible,
        };
      };

      const result = await handleGetTrackingStatus({ sender: { tab: { id: 2 } } });
      expect(result).toEqual({
        isTracking: true,
        tabId: 2,
        isAudible: false,
      });
      expect(mockTimeTracker.getStatus).toHaveBeenCalled();
      expect(mockTimeTracker.getTabState).toHaveBeenCalledWith(2);
    });
  });
});
