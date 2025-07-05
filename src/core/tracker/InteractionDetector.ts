/**
 * Interaction Detector Messaging System
 *
 * Creates a messaging interface for communication between content scripts and background script.
 * This defines the message schema for user interactions (scroll, mousemove, keydown, mousedown)
 * and provides type-safe messaging using @webext-core/messaging. The detector validates
 * interaction thresholds before sending messages to the background script.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { defineExtensionMessaging } from '@webext-core/messaging';
import {
  InteractionMessage,
  InteractionMessageSchema,
  BackgroundMessage,
  BackgroundMessageSchema,
} from '@/core/tracker/types';
import { SCROLL_THRESHOLD_PIXELS, MOUSEMOVE_THRESHOLD_PIXELS } from '@/config/constants';
import { createLogger } from '@/utils/logger';

// ============================================================================
// Message Protocol Definition
// ============================================================================

/**
 * Protocol map for type-safe messaging between content and background scripts
 */
interface TrackerProtocolMap {
  /** Content script sends interaction data to background script */
  'interaction-detected': (data: InteractionMessage) => Promise<void>;

  /** Background script sends page status updates to content script */
  'page-status-update': (data: BackgroundMessage) => Promise<void>;

  /** Content script requests current tracking status */
  'get-tracking-status': () => Promise<{ isTracking: boolean; tabId: number }>;

  /** Background script notifies content script of focus changes */
  'focus-changed': (data: { isFocused: boolean; tabId: number }) => Promise<void>;
}

/**
 * Create the messaging interface
 */
export const { sendMessage, onMessage } = defineExtensionMessaging<TrackerProtocolMap>();

// ============================================================================
// Interaction Detection Logic
// ============================================================================

/**
 * Interaction detector class for content scripts
 * Handles user interaction detection and threshold validation
 */
export class InteractionDetector {
  private static readonly logger = createLogger('InteractionDetector');
  private lastScrollPosition = { x: 0, y: 0 };
  private lastMousePosition = { x: 0, y: 0 };
  private isEnabled = true;
  private tabId: number | null = null;

  /** Throttle timers for different interaction types */
  private throttleTimers = {
    scroll: null as NodeJS.Timeout | null,
    mousemove: null as NodeJS.Timeout | null,
    keydown: null as NodeJS.Timeout | null,
    mousedown: null as NodeJS.Timeout | null,
  };

  /** Throttle delays in milliseconds */
  private readonly throttleDelays = {
    scroll: 100,
    mousemove: 50,
    keydown: 200,
    mousedown: 100,
  };

  constructor(tabId?: number) {
    this.tabId = tabId || null;
  }

  /**
   * Initialize the interaction detector
   * Sets up event listeners for all interaction types
   */
  initialize(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      InteractionDetector.logger.warn('Not running in browser environment');
      return;
    }

    // Get tab ID if not provided
    if (this.tabId === null) {
      this.requestTabId();
    }

    this.setupEventListeners();
    InteractionDetector.logger.info('InteractionDetector initialized');
  }

  /**
   * Clean up event listeners and timers
   */
  destroy(): void {
    this.removeEventListeners();
    this.clearAllThrottleTimers();
    InteractionDetector.logger.info('InteractionDetector destroyed');
  }

  /**
   * Enable or disable interaction detection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  // ============================================================================
  // Event Listener Setup
  // ============================================================================

  private setupEventListeners(): void {
    // Scroll events
    document.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

    // Mouse events
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), { passive: true });
    document.addEventListener('mousedown', this.handleMouseDown.bind(this), { passive: true });

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this), { passive: true });
  }

  private removeEventListeners(): void {
    document.removeEventListener('scroll', this.handleScroll.bind(this));
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  // ============================================================================
  // Interaction Handlers
  // ============================================================================

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Event parameter required by addEventListener signature but not used in implementation
  private handleScroll(_event: Event): void {
    if (!this.isEnabled || this.throttleTimers.scroll) return;

    const currentPosition = {
      x: window.scrollX,
      y: window.scrollY,
    };

    const scrollDelta = Math.sqrt(
      Math.pow(currentPosition.x - this.lastScrollPosition.x, 2) +
        Math.pow(currentPosition.y - this.lastScrollPosition.y, 2)
    );

    // Check if scroll distance meets threshold
    if (scrollDelta >= SCROLL_THRESHOLD_PIXELS) {
      this.sendInteractionMessage('scroll', { scrollDelta });
      this.lastScrollPosition = currentPosition;
    }

    // Set throttle timer
    this.throttleTimers.scroll = setTimeout(() => {
      this.throttleTimers.scroll = null;
    }, this.throttleDelays.scroll);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isEnabled || this.throttleTimers.mousemove) return;

    const currentPosition = {
      x: event.clientX,
      y: event.clientY,
    };

    const movementDelta = Math.sqrt(
      Math.pow(currentPosition.x - this.lastMousePosition.x, 2) +
        Math.pow(currentPosition.y - this.lastMousePosition.y, 2)
    );

    // Check if mouse movement meets threshold
    if (movementDelta >= MOUSEMOVE_THRESHOLD_PIXELS) {
      this.sendInteractionMessage('mousemove', { movementDelta });
      this.lastMousePosition = currentPosition;
    }

    // Set throttle timer
    this.throttleTimers.mousemove = setTimeout(() => {
      this.throttleTimers.mousemove = null;
    }, this.throttleDelays.mousemove);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- MouseEvent parameter required by addEventListener signature but not used in implementation
  private handleMouseDown(_event: MouseEvent): void {
    if (!this.isEnabled || this.throttleTimers.mousedown) return;

    this.sendInteractionMessage('mousedown');

    // Set throttle timer
    this.throttleTimers.mousedown = setTimeout(() => {
      this.throttleTimers.mousedown = null;
    }, this.throttleDelays.mousedown);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled || this.throttleTimers.keydown) return;

    // Ignore modifier keys alone
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return;
    }

    this.sendInteractionMessage('keydown');

    // Set throttle timer
    this.throttleTimers.keydown = setTimeout(() => {
      this.throttleTimers.keydown = null;
    }, this.throttleDelays.keydown);
  }

  // ============================================================================
  // Message Sending
  // ============================================================================

  private async sendInteractionMessage(
    type: InteractionMessage['type'],
    data?: { scrollDelta?: number; movementDelta?: number }
  ): Promise<void> {
    if (this.tabId === null) {
      InteractionDetector.logger.warn('Tab ID not available, cannot send message');
      return;
    }

    try {
      const message: InteractionMessage = {
        type,
        timestamp: Date.now(),
        tabId: this.tabId,
        data,
      };

      // Validate message before sending
      InteractionMessageSchema.parse(message);

      // Send to background script
      await sendMessage('interaction-detected', message);
    } catch (error) {
      InteractionDetector.logger.error('Error sending interaction message:', error);
    }
  }

  private async requestTabId(): Promise<void> {
    try {
      const response = await sendMessage('get-tracking-status', undefined);
      this.tabId = response.tabId;
    } catch (error) {
      InteractionDetector.logger.error('Error getting tab ID:', error);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private clearAllThrottleTimers(): void {
    Object.values(this.throttleTimers).forEach(timer => {
      if (timer) {
        clearTimeout(timer);
      }
    });

    // Reset all timers
    this.throttleTimers = {
      scroll: null,
      mousemove: null,
      keydown: null,
      mousedown: null,
    };
  }

  /**
   * Get current detector status
   */
  getStatus(): {
    isEnabled: boolean;
    tabId: number | null;
    hasActiveThrottles: boolean;
  } {
    const hasActiveThrottles = Object.values(this.throttleTimers).some(timer => timer !== null);

    return {
      isEnabled: this.isEnabled,
      tabId: this.tabId,
      hasActiveThrottles,
    };
  }
}

// ============================================================================
// Background Script Message Handler
// ============================================================================

/**
 * Background script message handler for interaction detection
 */
export class InteractionMessageHandler {
  private static readonly logger = createLogger('InteractionMessageHandler');
  private onInteractionCallback: ((message: InteractionMessage) => void) | null = null;

  /**
   * Initialize the message handler in background script
   */
  initialize(): void {
    // Listen for interaction messages from content scripts
    onMessage('interaction-detected', async message => {
      try {
        // Validate incoming message
        InteractionMessageSchema.parse(message.data);

        // Call registered callback
        if (this.onInteractionCallback) {
          this.onInteractionCallback(message.data);
        }
      } catch (error) {
        InteractionMessageHandler.logger.error('Invalid interaction message:', error);
      }
    });

    // Handle tracking status requests
    onMessage('get-tracking-status', async message => {
      return {
        isTracking: true, // This would come from actual tracking state
        tabId: message.sender?.tab?.id || -1,
      };
    });

    InteractionMessageHandler.logger.info('InteractionMessageHandler initialized');
  }

  /**
   * Set callback for handling interaction messages
   */
  onInteraction(callback: (message: InteractionMessage) => void): void {
    this.onInteractionCallback = callback;
  }

  /**
   * Send focus change notification to content script
   */
  async notifyFocusChange(tabId: number, isFocused: boolean): Promise<void> {
    try {
      await sendMessage('focus-changed', { isFocused, tabId }, { tabId });
    } catch (error) {
      InteractionMessageHandler.logger.error('Error sending focus change:', error);
    }
  }

  /**
   * Send page status update to content script
   */
  async sendPageStatusUpdate(tabId: number, message: BackgroundMessage): Promise<void> {
    try {
      // Validate message
      BackgroundMessageSchema.parse(message);

      await sendMessage('page-status-update', message, { tabId });
    } catch (error) {
      InteractionMessageHandler.logger.error('Error sending page status update:', error);
    }
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validation helpers for message handling
 */
export const MessageValidation = {
  /**
   * Validates an interaction message
   */
  validateInteractionMessage: (data: unknown): InteractionMessage => {
    return InteractionMessageSchema.parse(data);
  },

  /**
   * Validates a background message
   */
  validateBackgroundMessage: (data: unknown): BackgroundMessage => {
    return BackgroundMessageSchema.parse(data);
  },

  /**
   * Checks if interaction meets threshold requirements
   */
  meetsThreshold: (
    type: InteractionMessage['type'],
    data?: { scrollDelta?: number; movementDelta?: number }
  ): boolean => {
    switch (type) {
      case 'scroll':
        return (data?.scrollDelta || 0) >= SCROLL_THRESHOLD_PIXELS;
      case 'mousemove':
        return (data?.movementDelta || 0) >= MOUSEMOVE_THRESHOLD_PIXELS;
      case 'keydown':
      case 'mousedown':
        return true; // These always meet threshold if triggered
      default:
        return false;
    }
  },
};
