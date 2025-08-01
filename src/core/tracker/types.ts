/**
 * Core Types and Interfaces for Time Tracking System
 *
 * This module defines core TypeScript interfaces and types for the time tracking system
 * using zod v4 schemas. Includes TabState interface for tracking individual tab states,
 * InteractionMessage for content script communication, DomainEvent union types for all
 * event types, and FocusContext for managing the single-focus principle.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { z } from 'zod/v4';
import { EventTypeSchema, ResolutionTypeSchema } from '@/core/db/models/eventslog.model';

// ============================================================================
// Tab State Management
// ============================================================================

/**
 * Schema for individual tab state tracking
 * Maintains the state of each browser tab for time tracking purposes
 */
export const TabStateSchema = z.object({
  /** Complete URL of the tab */
  url: z.url(),

  /** Unique visit identifier (UUID) bound to Open Time lifecycle */
  visitId: z.uuid(),

  /** Unique activity interval identifier (UUID) bound to Active Time lifecycle */
  activityId: z.uuid().nullable(),

  /** Whether the tab is currently playing audio */
  isAudible: z.boolean(),

  /** Timestamp of the last user interaction (Unix timestamp in milliseconds) */
  lastInteractionTimestamp: z.number().int().min(0),

  /** Timestamp when Open Time tracking started (Unix timestamp in milliseconds) */
  openTimeStart: z.number().int().min(0),

  /** Timestamp when Active Time tracking started (Unix timestamp in milliseconds) */
  activeTimeStart: z.number().int().min(0).nullable(),

  /** Whether this tab is currently the focused tab */
  isFocused: z.boolean(),

  /** Browser tab ID (unique identifier for the tab) */
  tabId: z.number().int().nonnegative(),

  /** Browser window ID that contains this tab */
  windowId: z.number().int().nonnegative(),

  /** Whether the current session has already generated an end event */
  sessionEnded: z.boolean(),
});

export type TabState = z.infer<typeof TabStateSchema>;

// ============================================================================
// Content Script Communication
// ============================================================================

/**
 * Schema for interaction messages from content script to background script
 * Used for type-safe messaging between different extension contexts
 */
export const InteractionMessageSchema = z.object({
  /** Type of user interaction detected */
  type: z.enum(['scroll', 'mousemove', 'keydown', 'mousedown']),

  /** Timestamp when the interaction occurred (Unix timestamp in milliseconds) */
  timestamp: z.number().int().min(0),

  /** Tab ID where the interaction occurred */
  tabId: z.number().int().nonnegative(),

  /** Additional interaction data (e.g., scroll distance, mouse movement) */
  data: z
    .object({
      /** For scroll events: pixels scrolled */
      scrollDelta: z.number().optional(),

      /** For mousemove events: pixels moved */
      movementDelta: z.number().optional(),
    })
    .optional(),
});

export type InteractionMessage = z.infer<typeof InteractionMessageSchema>;

/**
 * Schema for idle notification messages from content script to background script
 */
export const IdleNotificationMessageSchema = z.object({
  /** Tab ID where idle state was detected */
  tabId: z.number().int().nonnegative(),

  /** Timestamp when idle state was detected (Unix timestamp in milliseconds) */
  timestamp: z.number().int().min(0),
});

export type IdleNotificationMessage = z.infer<typeof IdleNotificationMessageSchema>;

/**
 * Schema for audible state change messages from background script to content script
 */
export const AudibleStateChangeMessageSchema = z.object({
  /** Tab ID where audible state changed */
  tabId: z.number().int().nonnegative(),

  /** New audible state */
  isAudible: z.boolean(),
});

export type AudibleStateChangeMessage = z.infer<typeof AudibleStateChangeMessageSchema>;

/**
 * Schema for tracking status response messages
 */
export const TrackingStatusResponseSchema = z.object({
  /** Whether tracking is currently active */
  isTracking: z.boolean(),

  /** Tab ID */
  tabId: z.number().int().nonnegative(),

  /** Whether the tab is currently audible */
  isAudible: z.boolean(),
});

export type TrackingStatusResponse = z.infer<typeof TrackingStatusResponseSchema>;

/**
 * Schema for messages sent from background script to content script
 */
export const BackgroundMessageSchema = z.object({
  /** Message type */
  type: z.enum(['page-loaded', 'focus-changed', 'tracking-status', 'audible-state-changed']),

  /** Message payload */
  payload: z.unknown().optional(),
});

export type BackgroundMessage = z.infer<typeof BackgroundMessageSchema>;

// ============================================================================
// Domain Events
// ============================================================================

/**
 * Schema for events generated by the time tracking engine
 * These events are stored in the eventsLog table
 */
export const TrackingEventSchema = z.object({
  /** Event occurrence timestamp (Unix timestamp in milliseconds) */
  timestamp: z.number().int().min(1000000000000),

  /** Event type enumeration */
  eventType: EventTypeSchema,

  /** Associated browser tab ID */
  tabId: z.number().int().nonnegative(),

  /** Complete URL (path and key parameters) */
  url: z.url(),

  /** Unique visit identifier (UUID) bound to Open Time lifecycle */
  visitId: z.uuid(),

  /** Unique activity interval identifier (UUID) bound to Active Time lifecycle */
  activityId: z.uuid().nullable(),

  /** Whether processed by aggregator (0 = false, 1 = true) */
  isProcessed: z.union([z.literal(0), z.literal(1)]),

  /** Optional special event source marker */
  resolution: ResolutionTypeSchema.optional(),
});

export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

// ============================================================================
// Focus Management
// ============================================================================

/**
 * Schema for focus context management
 * Used to implement the single-focus principle
 */
export const FocusContextSchema = z.object({
  /** Currently focused tab ID */
  focusedTabId: z.number().int().nonnegative().nullable(),

  /** Currently focused window ID */
  focusedWindowId: z.number().int().nonnegative().nullable(),

  /** Timestamp when focus changed (Unix timestamp in milliseconds) */
  lastFocusChange: z.number().int().min(0),
});

export type FocusContext = z.infer<typeof FocusContextSchema>;

// ============================================================================
// Event Queue Management
// ============================================================================

/**
 * Schema for queued events before database write
 */
export const QueuedEventSchema = z.object({
  /** The domain event to be written */
  event: TrackingEventSchema,

  /** Timestamp when event was queued (Unix timestamp in milliseconds) */
  queuedAt: z.number().int().min(0),

  /** Number of retry attempts */
  retryCount: z.number().int().min(0).default(0),
});

export type QueuedEvent = z.infer<typeof QueuedEventSchema>;

// ============================================================================
// Checkpoint Management
// ============================================================================

/**
 * Schema for checkpoint event data
 */
export const CheckpointDataSchema = z.object({
  /** Type of checkpoint */
  checkpointType: z.enum(['active_time', 'open_time']),

  /** Duration since last checkpoint or session start (milliseconds) */
  duration: z.number().int().min(0),

  /** Whether this is a periodic checkpoint or session end */
  isPeriodic: z.boolean(),
});

export type CheckpointData = z.infer<typeof CheckpointDataSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validation helper functions
 */
export const ValidationHelpers = {
  /**
   * Validates a tab state object
   */
  validateTabState: (data: unknown): TabState => {
    return TabStateSchema.parse(data);
  },

  /**
   * Validates an interaction message
   */
  validateInteractionMessage: (data: unknown): InteractionMessage => {
    return InteractionMessageSchema.parse(data);
  },

  /**
   * Validates a tracking event
   */
  validateTrackingEvent: (data: unknown): TrackingEvent => {
    return TrackingEventSchema.parse(data);
  },

  /**
   * Validates focus context
   */
  validateFocusContext: (data: unknown): FocusContext => {
    return FocusContextSchema.parse(data);
  },
};
