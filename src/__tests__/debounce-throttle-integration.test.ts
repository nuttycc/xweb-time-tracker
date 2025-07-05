import { describe, it, expect, beforeEach, vi, afterEach, type MockedFunction } from 'vitest';
import { throttle, debounce } from 'es-toolkit';

// Mock constants
const SCROLL_THRESHOLD_PIXELS = 20;
const INACTIVE_TIMEOUT_DEFAULT = 5000;
const INACTIVE_TIMEOUT_MEDIA = 300000;

/**
 * Integration tests for the debounce-throttle mechanism
 * Tests the core logic of interaction detection and idle management
 */
describe('Debounce-Throttle Integration', () => {
  let mockSendMessage: MockedFunction<(type: string, data: unknown) => Promise<void>>;
  let mockThrottledSend: ReturnType<typeof throttle>;
  let mockDebouncedIdle: ReturnType<typeof debounce>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSendMessage = vi.fn().mockResolvedValue(undefined);

    // Create real throttle and debounce functions for integration testing
    mockThrottledSend = throttle(mockSendMessage, 500, { edges: ['leading', 'trailing'] });
    mockDebouncedIdle = debounce(
      () => mockSendMessage('tab-is-idle', { timestamp: Date.now() }),
      INACTIVE_TIMEOUT_DEFAULT,
      { edges: ['trailing'] }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    mockThrottledSend.cancel();
    mockDebouncedIdle.cancel();
  });

  describe('Core Logic: Interaction Detection with Throttling', () => {
    it('should accumulate scroll delta and send throttled interaction when threshold reached', () => {
      // Simulate InteractionDetector scroll handling logic
      let scrollAccumulator = 0;
      let lastScrollY = 0;

      const handleScroll = (scrollY: number) => {
        // Reset idle timer on interaction
        mockDebouncedIdle.cancel();
        mockDebouncedIdle();

        // Accumulate scroll distance
        const scrollDelta = Math.abs(scrollY - lastScrollY);
        lastScrollY = scrollY;
        scrollAccumulator += scrollDelta;

        // Send interaction if threshold reached
        if (scrollAccumulator >= SCROLL_THRESHOLD_PIXELS) {
          mockThrottledSend('interaction-detected', {
            type: 'scroll',
            scrollDelta: scrollAccumulator,
          });
          scrollAccumulator = 0;
        }
      };

      // Act: Simulate scroll events
      handleScroll(10); // Delta: 10, accumulator: 10
      handleScroll(25); // Delta: 15, accumulator: 25 -> triggers send

      // Assert: Interaction sent immediately (leading edge)
      expect(mockSendMessage).toHaveBeenCalledWith('interaction-detected', {
        type: 'scroll',
        scrollDelta: 25,
      });

      // Verify idle timer was reset
      vi.advanceTimersByTime(INACTIVE_TIMEOUT_DEFAULT - 100);
      expect(mockSendMessage).not.toHaveBeenCalledWith('tab-is-idle', expect.any(Object));
    });

    it('should send throttled interaction for direct events and reset idle timer', () => {
      const handleKeyDown = () => {
        // Reset idle timer on interaction
        mockDebouncedIdle.cancel();
        mockDebouncedIdle();

        // Send throttled interaction
        mockThrottledSend('interaction-detected', { type: 'keydown' });
      };

      // Act: Simulate keydown events
      handleKeyDown();
      handleKeyDown(); // Should be throttled

      // Assert: Only first call sent immediately
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith('interaction-detected', { type: 'keydown' });

      // Fast-forward to trigger trailing edge
      vi.advanceTimersByTime(500);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Core Logic: Idle Detection with Debouncing', () => {
    it('should send tab-is-idle message when no interactions occur within timeout', () => {
      const simulateInteraction = () => {
        mockDebouncedIdle.cancel();
        mockDebouncedIdle();
      };

      // Act: Simulate interaction then go idle
      simulateInteraction();

      // Fast-forward to trigger idle timeout
      vi.advanceTimersByTime(INACTIVE_TIMEOUT_DEFAULT);

      // Assert: Idle message sent
      expect(mockSendMessage).toHaveBeenCalledWith('tab-is-idle', {
        timestamp: expect.any(Number),
      });
    });

    it('should reset idle timer when new interactions occur before timeout', () => {
      const simulateInteraction = () => {
        mockDebouncedIdle.cancel();
        mockDebouncedIdle();
      };

      // Act: Simulate interactions that keep resetting the timer
      simulateInteraction();
      vi.advanceTimersByTime(2000);

      simulateInteraction(); // Reset timer
      vi.advanceTimersByTime(2000);

      simulateInteraction(); // Reset timer again
      vi.advanceTimersByTime(2000);

      // Assert: Should not be idle yet
      expect(mockSendMessage).not.toHaveBeenCalledWith('tab-is-idle', expect.any(Object));

      // Complete the timeout
      vi.advanceTimersByTime(3000);
      expect(mockSendMessage).toHaveBeenCalledWith('tab-is-idle', {
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Core Logic: Dynamic Timeout Management', () => {
    it('should recreate debounced function with new timeout when audible state changes', () => {
      let isAudible = false;
      let currentDebouncedIdle = mockDebouncedIdle;

      const updateIdleTimeout = () => {
        // Cancel existing debounced function
        currentDebouncedIdle.cancel();

        // Choose timeout based on audible state
        const timeout = isAudible ? INACTIVE_TIMEOUT_MEDIA : INACTIVE_TIMEOUT_DEFAULT;

        // Create new debounced function
        currentDebouncedIdle = debounce(
          () => mockSendMessage('tab-is-idle', { timestamp: Date.now() }),
          timeout,
          { edges: ['trailing'] }
        );
      };

      const simulateInteraction = () => {
        currentDebouncedIdle.cancel();
        currentDebouncedIdle();
      };

      // Act: Start with default timeout
      simulateInteraction();

      // Change to audible state
      isAudible = true;
      updateIdleTimeout();
      simulateInteraction();

      // Assert: Should not timeout with old timeout value
      vi.advanceTimersByTime(INACTIVE_TIMEOUT_DEFAULT);
      expect(mockSendMessage).not.toHaveBeenCalledWith('tab-is-idle', expect.any(Object));

      // Should timeout with new timeout value
      vi.advanceTimersByTime(INACTIVE_TIMEOUT_MEDIA - INACTIVE_TIMEOUT_DEFAULT);
      expect(mockSendMessage).toHaveBeenCalledWith('tab-is-idle', {
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Core Logic: Throttle and Debounce Coordination', () => {
    it('should coordinate throttled interactions with debounced idle detection', () => {
      let scrollAccumulator = 0;
      let lastScrollY = 0;

      const handleScrollWithIdleReset = (scrollY: number) => {
        // Reset idle timer first
        mockDebouncedIdle.cancel();
        mockDebouncedIdle();

        // Handle scroll accumulation and throttling
        const scrollDelta = Math.abs(scrollY - lastScrollY);
        lastScrollY = scrollY;
        scrollAccumulator += scrollDelta;

        if (scrollAccumulator >= SCROLL_THRESHOLD_PIXELS) {
          mockThrottledSend('interaction-detected', {
            type: 'scroll',
            scrollDelta: scrollAccumulator,
          });
          scrollAccumulator = 0;
        }
      };

      // Act: Simulate rapid scroll interactions
      handleScrollWithIdleReset(25); // Triggers interaction send
      handleScrollWithIdleReset(50); // Triggers another interaction send

      // Assert: Interactions sent with throttling
      expect(mockSendMessage).toHaveBeenCalledWith(
        'interaction-detected',
        expect.objectContaining({
          type: 'scroll',
        })
      );

      // Fast-forward throttle interval to get trailing calls
      vi.advanceTimersByTime(500);

      // Continue without interactions to trigger idle
      vi.advanceTimersByTime(INACTIVE_TIMEOUT_DEFAULT);

      // Assert: Idle detection triggered after interactions stopped
      expect(mockSendMessage).toHaveBeenCalledWith('tab-is-idle', {
        timestamp: expect.any(Number),
      });
    });
  });
});
