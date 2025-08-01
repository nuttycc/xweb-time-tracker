/**
 * Event Generator for Time Tracking System
 *
 * Creates the event generation engine that converts browser events and state changes
 * into domain events. This class generates open_time_start, open_time_end, active_time_start,
 * active_time_end, and checkpoint events based on user interactions and state transitions.
 * It integrates with the URL normalizer and applies business rules for event creation.
 */


import { z } from 'zod/v4';
import { TrackingEvent, TrackingEventSchema, TabState, TabStateSchema, CheckpointData } from '@/core/tracker/types';
import { URLProcessor, createDefaultURLProcessor } from '@/core/tracker/utils/URLProcessor';
import { ResolutionType } from '@/core/db/models/eventslog.model';
import { DEFAULT_CONFIG } from '@/config/constants';
import { createLogger } from '@/utils/logger';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Event generation context for tracking session state
 */
export interface EventGenerationContext {
  /** Current tab state */
  tabState: TabState;
  /** Timestamp when event is generated */
  timestamp: number;
  /** Optional resolution type for special events */
  resolution?: ResolutionType;
}

/**
 * Event generation options
 */
export interface EventGenerationOptions {
  /** Custom URL processor instance */
  urlProcessor?: URLProcessor;
  /** Whether to validate generated events */
  validateEvents?: boolean;
  /** Custom timeout values */
  timeouts?: {
    inactiveDefault?: number;
    inactiveMedia?: number;
  };
}

/**
 * Schema for event generation context
 */
export const EventGenerationContextSchema = z.object({
  tabState: TabStateSchema,
  timestamp: z.number().int().min(1000000000000),
  resolution: z.enum(['crash_recovery']).optional(),
});

/**
 * Event generation result
 */
export interface EventGenerationResult {
  /** Generated event (if any) */
  event?: TrackingEvent;
  /** Whether event was generated successfully */
  success: boolean;
  /** Error message if generation failed */
  error?: string;
  /** Additional metadata */
  metadata?: {
    /** Whether URL was filtered out */
    urlFiltered?: boolean;
    /** Reason for not generating event */
    skipReason?: string;
  };
}

// ============================================================================
// Event Generator Class
// ============================================================================

/**
 * Event Generator Class
 *
 * Responsible for generating all types of domain events based on browser
 * interactions and state changes. Applies business rules and URL filtering.
 */
export class EventGenerator {
  private urlProcessor: URLProcessor;
  private options: EventGenerationOptions;
  private static readonly logger = createLogger('🔄 EventGenerator');
  
  constructor(options: EventGenerationOptions = {}) {
    this.options = {
      validateEvents: true,
      timeouts: {
        inactiveDefault: DEFAULT_CONFIG.timeTracking.inactiveTimeoutDefault,
        inactiveMedia: DEFAULT_CONFIG.timeTracking.inactiveTimeoutMedia,
      },
      ...options,
    };

    this.urlProcessor = options.urlProcessor || createDefaultURLProcessor();
  }

  // ============================================================================
  // Open Time Event Generation
  // ============================================================================

  /**
   * Generates an open_time_start event when user navigates to a new URL
   *
   * @param tabId - Browser tab ID
   * @param url - URL being navigated to
   * @param timestamp - Event timestamp
   * @param windowId - Browser window ID
   * @param resolution - Optional resolution type
   * @returns Event generation result
   */
  generateOpenTimeStart(
    tabId: number,
    url: string,
    timestamp: number,
    windowId: number,
    resolution?: ResolutionType
  ): EventGenerationResult {
    try {

      if(tabId === undefined || tabId < 0) {
        return {
          success: false,
          error: 'Invalid tabId',
          metadata: {
            skipReason: 'Invalid tabId',
          },
        };
      }

      // Validate and process URL
      const urlResult = this.urlProcessor.processUrl(url);
      if (!urlResult.isValid) {
        return {
          success: false,
          metadata: {
            urlFiltered: true,
            skipReason: urlResult.reason,
          },
        };
      }

      // Generate new visit ID
      const visitId = crypto.randomUUID();

      // Create domain event
      const event: TrackingEvent = {
        timestamp,
        eventType: 'open_time_start',
        tabId,
        url: urlResult.normalizedUrl!,
        visitId,
        activityId: null,
        isProcessed: 0,
        resolution,
      };

      // Validate if required
      if (this.options.validateEvents) {
        TrackingEventSchema.parse(event);
      }

      return {
        event,
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generates an open_time_end event when tab is closed or navigated away
   *
   * @param context - Event generation context
   * @returns Event generation result
   */
  generateOpenTimeEnd(context: EventGenerationContext): EventGenerationResult {
    try {
      // Validate context
      if (this.options.validateEvents) {
        EventGenerationContextSchema.parse(context);
      }

      const { tabState, timestamp, resolution } = context;

      // Create domain event
      const event: TrackingEvent = {
        timestamp,
        eventType: 'open_time_end',
        tabId: tabState.tabId,
        url: tabState.url,
        visitId: tabState.visitId,
        activityId: tabState.activityId,
        isProcessed: 0,
        resolution,
      };

      // Validate if required
      if (this.options.validateEvents) {
        TrackingEventSchema.parse(event);
      }

      return {
        event,
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Active Time Event Generation
  // ============================================================================

  /**
   * Generates an active_time_start event when user interaction is detected
   *
   * @param context - Event generation context
   * @returns Event generation result
   */
  generateActiveTimeStart(context: EventGenerationContext): EventGenerationResult {
    try {
      // Validate context
      if (this.options.validateEvents) {
        EventGenerationContextSchema.parse(context);
      }

      const { tabState, timestamp, resolution } = context;

      // Validate URL
      const urlResult = this.urlProcessor.processUrl(tabState.url);
      if (!urlResult.isValid) {
        return {
          success: false,
          metadata: {
            urlFiltered: true,
            skipReason: urlResult.reason,
          },
        };
      }

      // Generate new activity ID
      const activityId = crypto.randomUUID();

      // Create domain event
      const event: TrackingEvent = {
        timestamp,
        eventType: 'active_time_start',
        tabId: tabState.tabId,
        url: urlResult.normalizedUrl!,
        visitId: tabState.visitId,
        activityId,
        isProcessed: 0,
        resolution,
      };

      // Validate if required
      if (this.options.validateEvents) {
        TrackingEventSchema.parse(event);
      }

      return {
        event,
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generates an active_time_end event when activity stops
   *
   * @param context - Event generation context
   * @param reason - Reason for ending active time
   * @returns Event generation result
   */
  generateActiveTimeEnd(
    context: EventGenerationContext,
    reason: 'timeout' | 'focus_lost' | 'tab_closed' | 'navigation' = 'timeout'
  ): EventGenerationResult {
    try {
      // Validate context
      if (this.options.validateEvents) {
        EventGenerationContextSchema.parse(context);
      }

      const { tabState, timestamp, resolution } = context;

      // Must have an active activity ID
      if (!tabState.activityId) {
        return {
          success: false,
          error: 'Cannot end active time without active activity ID',
        };
      }

      // Create domain event
      const event: TrackingEvent = {
        timestamp,
        eventType: 'active_time_end',
        tabId: tabState.tabId,
        url: tabState.url,
        visitId: tabState.visitId,
        activityId: tabState.activityId,
        isProcessed: 0,
        resolution,
      };

      // Validate if required
      if (this.options.validateEvents) {
        TrackingEventSchema.parse(event);
      }

      return {
        event,
        success: true,
        metadata: {
          skipReason: `Active time ended due to: ${reason}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Checkpoint Event Generation
  // ============================================================================

  /**
   * Generates a checkpoint event for long-running sessions
   *
   * @param context - Event generation context
   * @param checkpointData - Checkpoint-specific data
   * @returns Event generation result
   */
  generateCheckpoint(
    context: EventGenerationContext,
    checkpointData: CheckpointData
  ): EventGenerationResult {
    try {
      // Validate context
      if (this.options.validateEvents) {
        EventGenerationContextSchema.parse(context);
      }

      const { tabState, timestamp, resolution } = context;

      // Create domain event
      const event: TrackingEvent = {
        timestamp,
        eventType: 'checkpoint',
        tabId: tabState.tabId,
        url: tabState.url,
        visitId: tabState.visitId,
        activityId: checkpointData.checkpointType === 'active_time' ? tabState.activityId : null,
        isProcessed: 0,
        resolution,
      };

      // Validate if required
      if (this.options.validateEvents) {
        TrackingEventSchema.parse(event);
      }

      return {
        event,
        success: true,
        metadata: {
          skipReason: `Checkpoint for ${checkpointData.checkpointType} after ${checkpointData.duration}ms`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Checks if a tab should trigger an active time timeout
   *
   * @param tabState - Current tab state
   * @param currentTimestamp - Current timestamp
   * @returns True if timeout should be triggered
   */
  shouldTriggerActiveTimeTimeout(tabState: TabState, currentTimestamp: number): boolean {
    if (!tabState.activeTimeStart || !tabState.activityId) {
      return false;
    }
    const timeoutThreshold = tabState.isAudible
      ? this.options.timeouts?.inactiveMedia ?? DEFAULT_CONFIG.timeTracking.inactiveTimeoutMedia
      : this.options.timeouts?.inactiveDefault ??
        DEFAULT_CONFIG.timeTracking.inactiveTimeoutDefault;
    const timeSinceLastInteraction = currentTimestamp - tabState.lastInteractionTimestamp;
    return timeSinceLastInteraction >= timeoutThreshold;
  }

  /**
   * Checks if a session should generate a checkpoint
   *
   * @param tabState - Current tab state
   * @param currentTimestamp - Current timestamp
   * @param checkpointType - Type of checkpoint to check
   * @returns True if checkpoint should be generated
   */
  shouldGenerateCheckpoint(
    tabState: TabState,
    currentTimestamp: number,
    checkpointType: 'active_time' | 'open_time'
  ): boolean {
    if (checkpointType === 'active_time') {
      if (!tabState.activeTimeStart || !tabState.activityId) {
        return false;
      }
      const activeTimeDuration = currentTimestamp - tabState.activeTimeStart;
      return activeTimeDuration >= DEFAULT_CONFIG.checkpoint.activeTimeThreshold;
    } else {
      const openTimeDuration = currentTimestamp - tabState.openTimeStart;
      return openTimeDuration >= DEFAULT_CONFIG.checkpoint.openTimeThreshold;
    }
  }

  /**
   * Updates the URL processor configuration
   *
   * @param newProcessor - New URL processor instance
   */
  updateURLProcessor(newProcessor: URLProcessor): void {
    this.urlProcessor = newProcessor;
  }

  /**
   * Gets the current configuration
   *
   * @returns Current event generation options
   */
  getOptions(): EventGenerationOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new EventGenerator instance with optional configuration overrides.
 *
 * @returns An EventGenerator configured with the specified options.
 */
export function createEventGenerator(options: EventGenerationOptions = {}): EventGenerator {
  return new EventGenerator(options);
}

/**
 * Creates an EventGenerator that uses the specified URL processor and additional configuration options.
 *
 * The custom URL processor will be used for all URL normalization and filtering performed by the EventGenerator.
 *
 * @returns An EventGenerator instance configured with the given URL processor and options.
 */
export function createEventGeneratorWithURLProcessor(
  urlProcessor: URLProcessor,
  options: Omit<EventGenerationOptions, 'urlProcessor'> = {}
): EventGenerator {
  return new EventGenerator({
    ...options,
    urlProcessor,
  });
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Event generator validation helpers
 */
export const EventGeneratorValidation = {
  /**
   * Validates event generation context
   */
  validateContext: (context: unknown): EventGenerationContext => {
    return EventGenerationContextSchema.parse(context);
  },

  /**
   * Validates event generation options
   */
  validateOptions: (options: unknown): EventGenerationOptions => {
    const schema = z.object({
      urlProcessor: z.any().optional(),
      validateEvents: z.boolean().optional(),
      timeouts: z
        .object({
          inactiveDefault: z.number().int().min(1000).optional(),
          inactiveMedia: z.number().int().min(1000).optional(),
        })
        .optional(),
    });
    return schema.parse(options);
  },

  /**
   * Validates a domain event
   */
  validateTrackingEvent: (event: unknown): TrackingEvent => {
    return TrackingEventSchema.parse(event);
  },
};
