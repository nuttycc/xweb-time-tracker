/**
 * Content Script for WebTime Tracker
 *
 * Detects user interactions on web pages and sends them to the background script
 * for time tracking purposes. Implements threshold-based detection and event throttling
 * to optimize performance and reduce noise.
 *
 */

import { defineContentScript } from '#imports';
import { defineExtensionMessaging } from '@webext-core/messaging';
import { throttle, debounce } from 'es-toolkit';
import {
  SCROLL_THRESHOLD_PIXELS,
  MOUSEMOVE_THRESHOLD_PIXELS,
  INACTIVE_TIMEOUT_DEFAULT,
  INACTIVE_TIMEOUT_MEDIA,
} from '../config/constants';
import type { InteractionMessage } from '../core/tracker/types';
import { createLogger } from '@/utils/logger';

// Define messaging protocol (must match background script)
interface TrackerProtocolMap {
  /** Content script sends interaction data to background script */
  'interaction-detected': (data: InteractionMessage) => Promise<void>;

  /** Content script sends idle notification to background script */
  'tab-is-idle': (data: { tabId: number; timestamp: number }) => Promise<void>;

  /** Background script sends page status updates to content script */
  'page-status-update': (data: { isTracking: boolean; tabId: number }) => Promise<void>;

  /** Content script requests current tracking status */
  'get-tracking-status': () => Promise<{ isTracking: boolean; tabId: number; isAudible: boolean }>;

  /** Background script notifies content script of focus changes */
  'focus-changed': (data: { isFocused: boolean; tabId: number }) => Promise<void>;

  /** Background script notifies content script of audible state changes */
  'audible-state-changed': (data: { tabId: number; isAudible: boolean }) => Promise<void>;
}

const { sendMessage, onMessage } = defineExtensionMessaging<TrackerProtocolMap>();

const logger = createLogger('Content');

export default defineContentScript({
  matches: ['<all_urls>'],

  main() {
    logger.info('WebTime Tracker content script loaded');

    // Initialize interaction detector
    const interactionDetector = new InteractionDetector();
    interactionDetector.initialize();
  },
});

/**
 * User Interaction Detector
 *
 * Detects and throttles user interactions, sending them to the background script
 * when they exceed configured thresholds.
 */
class InteractionDetector {
  private readonly logger = createLogger('InteractionDetector');
  private isInitialized = false;
  private isTracking = false;
  private tabId = 0;

  // Throttling configuration - 500ms as per requirements
  private readonly THROTTLE_INTERVAL = 500; // 500ms for interaction-detected messages

  // Accumulator state for threshold-based events
  private scrollAccumulator = 0;
  private mouseMoveAccumulator = 0;
  private lastScrollY = 0;
  private lastMouseX?: number;
  private lastMouseY?: number;

  // Idle detection state
  private isAudible = false;
  private debouncedSendIdleNotification: ReturnType<typeof debounce>;

  // Throttled functions using es-toolkit
  private throttledSendInteraction: ReturnType<typeof throttle>;

  // Event listeners (stored for cleanup)
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];

  constructor() {
    // Initialize throttled function for sending interactions
    this.throttledSendInteraction = throttle(
      this.sendInteractionInternal.bind(this),
      this.THROTTLE_INTERVAL,
      { edges: ['leading', 'trailing'] }
    );

    // Initialize debounced function for idle detection
    // Start with default timeout, will be updated based on audible state
    this.debouncedSendIdleNotification = debounce(
      this.sendIdleNotification.bind(this),
      INACTIVE_TIMEOUT_DEFAULT,
      { edges: ['trailing'] }
    );
  }

  /**
   * Initialize the interaction detector
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get initial tracking status
      const status = await sendMessage('get-tracking-status');
      this.isTracking = status.isTracking;
      this.tabId = status.tabId;
      this.isAudible = status.isAudible;

      // Update debounce timeout based on audible state
      this.updateIdleTimeout();

      // Set up event listeners
      this.setupEventListeners();

      // Set up message handlers
      this.setupMessageHandlers();

      this.isInitialized = true;
      this.logger.info('Interaction detector initialized', {
        isTracking: this.isTracking,
        tabId: this.tabId,
        isAudible: this.isAudible,
      });
    } catch (error) {
      this.logger.error('Failed to initialize interaction detector:', error);
    }
  }

  /**
   * Set up DOM event listeners for user interactions
   */
  private setupEventListeners(): void {
    // Scroll events
    this.addEventListener(window, 'scroll', this.handleScroll.bind(this), { passive: true });

    // Mouse events
    this.addEventListener(document, 'mousemove', this.handleMouseMove.bind(this), {
      passive: true,
    });
    this.addEventListener(document, 'mousedown', this.handleMouseDown.bind(this), {
      passive: true,
    });

    // Keyboard events
    this.addEventListener(document, 'keydown', this.handleKeyDown.bind(this), { passive: true });

    this.logger.debug('Event listeners set up');
  }

  /**
   * Set up message handlers for background script communication
   */
  private setupMessageHandlers(): void {
    // Handle page status updates
    onMessage('page-status-update', message => {
      const { data } = message;
      this.isTracking = data.isTracking;
      this.tabId = data.tabId;

      this.logger.info('Tracking status updated', {
        isTracking: this.isTracking,
        tabId: this.tabId,
      });
    });

    // Handle focus change notifications
    onMessage('focus-changed', message => {
      const { data } = message;

      if (data.tabId === this.tabId) {
        this.logger.debug('Focus changed', { isFocused: data.isFocused });

        // Reset accumulators when focus changes
        if (data.isFocused) {
          this.resetAccumulators();
        }
      }
    });

    // Handle audible state change notifications
    onMessage('audible-state-changed', message => {
      const { data } = message;

      if (data.tabId === this.tabId) {
        this.logger.debug('Audible state changed', {
          isAudible: data.isAudible,
          previousState: this.isAudible,
        });

        // Update audible state and timeout
        this.isAudible = data.isAudible;
        this.updateIdleTimeout();
      }
    });
  }

  /**
   * Handle scroll events
   */
  private handleScroll(): void {
    if (!this.isTracking) return;

    // Reset idle timer on any interaction
    this.resetIdleTimer();

    // Calculate scroll distance
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollDelta = Math.abs(scrollY - this.lastScrollY);
    this.lastScrollY = scrollY;

    // Accumulate scroll distance
    this.scrollAccumulator += scrollDelta;

    // Check if we should send a scroll interaction (threshold check)
    if (this.scrollAccumulator >= SCROLL_THRESHOLD_PIXELS) {
      // Use throttled function to send interaction
      this.throttledSendInteraction('scroll', {
        scrollDelta: this.scrollAccumulator,
      });

      // Reset accumulator after sending
      this.scrollAccumulator = 0;
    }
  }

  /**
   * Handle mouse move events
   */
  private handleMouseMove(event: Event): void {
    const mouseEvent = event as MouseEvent;
    if (!this.isTracking) return;

    // Reset idle timer on any interaction
    this.resetIdleTimer();

    // Calculate mouse movement distance
    if (this.lastMouseX !== undefined && this.lastMouseY !== undefined) {
      const deltaX = mouseEvent.clientX - this.lastMouseX;
      const deltaY = mouseEvent.clientY - this.lastMouseY;
      const movementDelta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Accumulate movement distance
      this.mouseMoveAccumulator += movementDelta;
    }

    this.lastMouseX = mouseEvent.clientX;
    this.lastMouseY = mouseEvent.clientY;

    // Check if we should send a mousemove interaction (threshold check)
    if (this.mouseMoveAccumulator >= MOUSEMOVE_THRESHOLD_PIXELS) {
      // Use throttled function to send interaction
      this.throttledSendInteraction('mousemove', {
        movementDelta: this.mouseMoveAccumulator,
      });

      // Reset accumulator after sending
      this.mouseMoveAccumulator = 0;
    }
  }

  /**
   * Handle mouse down events
   */
  private handleMouseDown(): void {
    if (!this.isTracking) return;

    // Reset idle timer on any interaction
    this.resetIdleTimer();

    // Use throttled function to send interaction
    this.throttledSendInteraction('mousedown');
  }

  /**
   * Handle key down events
   */
  private handleKeyDown(): void {
    if (!this.isTracking) return;

    // Reset idle timer on any interaction
    this.resetIdleTimer();

    // Use throttled function to send interaction
    this.throttledSendInteraction('keydown');
  }

  /**
   * Internal method to send interaction message to background script
   * This is the actual implementation that gets throttled
   */
  private async sendInteractionInternal(
    type: 'scroll' | 'mousemove' | 'keydown' | 'mousedown',
    data?: { scrollDelta?: number; movementDelta?: number }
  ): Promise<void> {
    try {
      const interaction: InteractionMessage = {
        type,
        timestamp: Date.now(),
        tabId: this.tabId,
        data,
      };

      await sendMessage('interaction-detected', interaction);

      this.logger.debug('Interaction sent', { type, tabId: this.tabId });
    } catch (error) {
      this.logger.error('Failed to send interaction:', error);
    }
  }

  /**
   * Send idle notification to background script
   * This is called by the debounced function when no interactions occur for the timeout period
   */
  private async sendIdleNotification(): Promise<void> {
    try {
      await sendMessage('tab-is-idle', {
        tabId: this.tabId,
        timestamp: Date.now(),
      });

      this.logger.debug('Idle notification sent', { tabId: this.tabId });
    } catch (error) {
      this.logger.error('Failed to send idle notification:', error);
    }
  }

  /**
   * Update idle timeout based on audible state
   * Recreates the debounced function with the appropriate timeout
   */
  private updateIdleTimeout(): void {
    // Cancel existing debounced function
    this.debouncedSendIdleNotification.cancel();

    // Choose timeout based on audible state
    const timeout = this.isAudible ? INACTIVE_TIMEOUT_MEDIA : INACTIVE_TIMEOUT_DEFAULT;

    // Create new debounced function with updated timeout
    this.debouncedSendIdleNotification = debounce(this.sendIdleNotification.bind(this), timeout, {
      edges: ['trailing'],
    });

    this.logger.debug('Updated idle timeout', {
      isAudible: this.isAudible,
      timeout: timeout / 1000 + 's',
    });
  }

  /**
   * Reset the idle timer by canceling and rescheduling the debounced function
   * This should be called on every user interaction
   */
  private resetIdleTimer(): void {
    // Cancel any pending idle notification
    this.debouncedSendIdleNotification.cancel();

    // Schedule a new idle notification
    this.debouncedSendIdleNotification();
  }

  /**
   * Add event listener and store for cleanup
   */
  private addEventListener(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    const eventListener = handler as EventListener;
    element.addEventListener(event, eventListener, options);
    this.eventListeners.push({ element, event, handler: eventListener });
  }

  /**
   * Reset interaction accumulators
   */
  private resetAccumulators(): void {
    this.scrollAccumulator = 0;
    this.mouseMoveAccumulator = 0;
    this.lastScrollY = 0;
    this.lastMouseX = undefined;
    this.lastMouseY = undefined;
  }

  /**
   * Cleanup event listeners and throttled/debounced functions
   */
  cleanup(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    // Cancel any pending throttled calls
    this.throttledSendInteraction.cancel();

    // Cancel any pending debounced calls
    this.debouncedSendIdleNotification.cancel();

    this.isInitialized = false;

    this.logger.info('Interaction detector cleaned up');
  }
}
