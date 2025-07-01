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
import { SCROLL_THRESHOLD_PIXELS, MOUSEMOVE_THRESHOLD_PIXELS } from '../config/constants';
import type { InteractionMessage } from '../core/tracker/types';
import { createLogger } from '@/utils/logger';

// Define messaging protocol (must match background script)
interface TrackerProtocolMap {
  /** Content script sends interaction data to background script */
  'interaction-detected': (data: InteractionMessage) => Promise<void>;

  /** Background script sends page status updates to content script */
  'page-status-update': (data: { isTracking: boolean; tabId: number }) => Promise<void>;

  /** Content script requests current tracking status */
  'get-tracking-status': () => Promise<{ isTracking: boolean; tabId: number }>;

  /** Background script notifies content script of focus changes */
  'focus-changed': (data: { isFocused: boolean; tabId: number }) => Promise<void>;
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

  // Throttling state
  private lastScrollTime = 0;
  private lastMouseMoveTime = 0;
  private lastInteractionTime = 0;
  private scrollAccumulator = 0;
  private mouseMoveAccumulator = 0;

  // Throttling configuration
  private readonly THROTTLE_INTERVAL = 1000; // 1 second
  private readonly INTERACTION_COOLDOWN = 500; // 0.5 seconds between interactions

  // Event listeners (stored for cleanup)
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];

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

      // Set up event listeners
      this.setupEventListeners();

      // Set up message handlers
      this.setupMessageHandlers();

      this.isInitialized = true;
      this.logger.info('Interaction detector initialized', {
        isTracking: this.isTracking,
        tabId: this.tabId,
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
  }

  /**
   * Handle scroll events
   */
  private handleScroll(): void {
    if (!this.isTracking) return;

    const now = Date.now();

    // Calculate scroll distance
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollDelta = Math.abs(scrollY - (this.lastScrollY || scrollY));
    this.lastScrollY = scrollY;

    // Accumulate scroll distance
    this.scrollAccumulator += scrollDelta;

    // Check if we should send a scroll interaction
    if (
      this.scrollAccumulator >= SCROLL_THRESHOLD_PIXELS &&
      now - this.lastScrollTime >= this.THROTTLE_INTERVAL
    ) {
      this.sendInteraction('scroll', {
        scrollDelta: this.scrollAccumulator,
      });

      this.scrollAccumulator = 0;
      this.lastScrollTime = now;
    }
  }

  private lastScrollY = 0;

  /**
   * Handle mouse move events
   */
  private handleMouseMove(event: Event): void {
    const mouseEvent = event as MouseEvent;
    if (!this.isTracking) return;

    const now = Date.now();

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

    // Check if we should send a mousemove interaction
    if (
      this.mouseMoveAccumulator >= MOUSEMOVE_THRESHOLD_PIXELS &&
      now - this.lastMouseMoveTime >= this.THROTTLE_INTERVAL
    ) {
      this.sendInteraction('mousemove', {
        movementDelta: this.mouseMoveAccumulator,
      });

      this.mouseMoveAccumulator = 0;
      this.lastMouseMoveTime = now;
    }
  }

  private lastMouseX?: number;
  private lastMouseY?: number;

  /**
   * Handle mouse down events
   */
  private handleMouseDown(): void {
    if (!this.isTracking) return;

    const now = Date.now();

    // Throttle mouse down events
    if (now - this.lastInteractionTime >= this.INTERACTION_COOLDOWN) {
      this.sendInteraction('mousedown');
      this.lastInteractionTime = now;
    }
  }

  /**
   * Handle key down events
   */
  private handleKeyDown(): void {
    if (!this.isTracking) return;

    const now = Date.now();

    // Throttle key down events
    if (now - this.lastInteractionTime >= this.INTERACTION_COOLDOWN) {
      this.sendInteraction('keydown');
      this.lastInteractionTime = now;
    }
  }

  /**
   * Send interaction message to background script
   */
  private async sendInteraction(
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
    this.lastScrollTime = 0;
    this.lastMouseMoveTime = 0;
    this.lastInteractionTime = 0;
  }

  /**
   * Cleanup event listeners
   */
  cleanup(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
    this.isInitialized = false;

    this.logger.info('Interaction detector cleaned up');
  }
}
