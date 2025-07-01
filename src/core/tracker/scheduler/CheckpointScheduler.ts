/**
 * Checkpoint Scheduler for Time Tracking System
 *
 * Creates a checkpoint scheduling system using chrome.alarms API. This scheduler
 * periodically checks all active sessions (both Open Time and Active Time) and
 * generates checkpoint events when thresholds are exceeded. It integrates with
 * the TabStateManager to identify long-running sessions and uses the EventGenerator
 * to create checkpoint events. The scheduler handles alarm persistence across
 * service worker restarts.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

// import { z } from 'zod/v4';
import { browser } from '#imports';
import { TabStateManager } from '../state/TabStateManager';
import { EventGenerator } from '../events/EventGenerator';
import { EventQueue } from '../queue/EventQueue';
import { TabState, CheckpointData } from '../types';
import {
  CHECKPOINT_INTERVAL,
  CHECKPOINT_ACTIVE_TIME_THRESHOLD,
  CHECKPOINT_OPEN_TIME_THRESHOLD,
} from '../../../config/constants';

// All types can be accessed via WXT's Browser namespace:
import { type Browser } from 'wxt/browser';

// ============================================================================
// Configuration and Types
// ============================================================================

/**
 * Checkpoint scheduler configuration
 */
export interface CheckpointSchedulerConfig {
  /** Alarm name for the checkpoint scheduler */
  alarmName: string;
  /** Interval in minutes between checkpoint checks */
  intervalMinutes: number;
  /** Active time threshold in hours */
  activeTimeThresholdHours: number;
  /** Open time threshold in hours */
  openTimeThresholdHours: number;
  /** Whether to enable debug logging */
  enableDebugLogging: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: CheckpointSchedulerConfig = {
  alarmName: 'webtime-checkpoint-scheduler',
  intervalMinutes: CHECKPOINT_INTERVAL,
  activeTimeThresholdHours: CHECKPOINT_ACTIVE_TIME_THRESHOLD,
  openTimeThresholdHours: CHECKPOINT_OPEN_TIME_THRESHOLD,
  enableDebugLogging: false,
};

/**
 * Checkpoint evaluation result
 */
export interface CheckpointEvaluation {
  /** Tab ID being evaluated */
  tabId: number;
  /** Whether a checkpoint is needed */
  needsCheckpoint: boolean;
  /** Type of checkpoint needed */
  checkpointType: 'active_time' | 'open_time' | null;
  /** Duration since last checkpoint or session start */
  duration: number;
  /** Current tab state */
  tabState: TabState;
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  /** Total number of checkpoint checks performed */
  totalChecks: number;
  /** Total number of checkpoints generated */
  totalCheckpoints: number;
  /** Last check timestamp */
  lastCheckTime: number | null;
  /** Number of active sessions currently being tracked */
  activeSessions: number;
  /** Scheduler start time */
  startTime: number;
}

// ============================================================================
// Checkpoint Scheduler Implementation
// ============================================================================

/**
 * Checkpoint Scheduler using Chrome Alarms API
 *
 * Features:
 * - Periodic session evaluation using chrome.alarms
 * - Automatic checkpoint generation for long-running sessions
 * - Integration with TabStateManager and EventGenerator
 * - Persistent scheduling across service worker restarts
 * - Comprehensive logging and statistics
 */
export class CheckpointScheduler {
  private readonly config: CheckpointSchedulerConfig;
  private readonly tabStateManager: TabStateManager;
  private readonly eventGenerator: EventGenerator;
  private readonly eventQueue: EventQueue;
  private isInitialized = false;
  private stats: SchedulerStats;

  constructor(
    tabStateManager: TabStateManager,
    eventGenerator: EventGenerator,
    eventQueue: EventQueue,
    config: Partial<CheckpointSchedulerConfig> = {}
  ) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.tabStateManager = tabStateManager;
    this.eventGenerator = eventGenerator;
    this.eventQueue = eventQueue;
    this.stats = {
      totalChecks: 0,
      totalCheckpoints: 0,
      lastCheckTime: null,
      activeSessions: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Initialize the checkpoint scheduler
   * Sets up the alarm and event listeners
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.log('Scheduler already initialized');
      return;
    }

    try {
      // Check if alarm already exists to avoid duplicates
      const existingAlarm = await browser.alarms.get(this.config.alarmName);

      if (!existingAlarm) {
        // Create the periodic alarm
        await browser.alarms.create(this.config.alarmName, {
          delayInMinutes: this.config.intervalMinutes,
          periodInMinutes: this.config.intervalMinutes,
        });
        this.log(`Checkpoint alarm created with ${this.config.intervalMinutes}min interval`);
      } else {
        this.log('Checkpoint alarm already exists, reusing existing alarm');
      }

      // Set up alarm listener
      browser.alarms.onAlarm.addListener(this.handleAlarm.bind(this));

      this.isInitialized = true;
      this.log('Checkpoint scheduler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize checkpoint scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop the checkpoint scheduler
   * Removes the alarm and cleans up listeners
   */
  async stop(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Clear the alarm
      await browser.alarms.clear(this.config.alarmName);

      // Note: We can't remove specific listeners in Chrome extensions
      // The listener will be cleaned up when the service worker restarts

      this.isInitialized = false;
      this.log('Checkpoint scheduler stopped');
    } catch (error) {
      console.error('Failed to stop checkpoint scheduler:', error);
      throw error;
    }
  }

  /**
   * Manually trigger a checkpoint check
   * Useful for testing or immediate evaluation
   */
  async triggerCheck(): Promise<CheckpointEvaluation[]> {
    this.log('Manual checkpoint check triggered');
    return this.performCheckpointCheck();
  }

  /**
   * Get scheduler statistics
   */
  getStats(): Readonly<SchedulerStats> {
    return { ...this.stats };
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.isInitialized;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle alarm events
   */
  private async handleAlarm(alarm: Browser.alarms.Alarm): Promise<void> {
    if (alarm.name !== this.config.alarmName) {
      return;
    }

    this.log('Checkpoint alarm triggered');

    try {
      await this.performCheckpointCheck();
    } catch (error) {
      console.error('Checkpoint check failed:', error);
    }
  }

  /**
   * Perform the actual checkpoint check
   */
  private async performCheckpointCheck(): Promise<CheckpointEvaluation[]> {
    const startTime = Date.now();
    this.stats.totalChecks++;
    this.stats.lastCheckTime = startTime;

    try {
      // Get all active tab states
      const allTabStates = this.tabStateManager.getAllTabStates();
      this.stats.activeSessions = allTabStates.size;

      if (allTabStates.size === 0) {
        this.log('No active sessions to check');
        return [];
      }

      const evaluations: CheckpointEvaluation[] = [];

      // Evaluate each tab for checkpoint needs
      for (const [tabId, tabState] of allTabStates) {
        const evaluation = this.evaluateTabForCheckpoint(tabId, tabState, startTime);
        evaluations.push(evaluation);

        if (evaluation.needsCheckpoint) {
          await this.generateCheckpoint(evaluation);
        }
      }

      const checkpointsGenerated = evaluations.filter(e => e.needsCheckpoint).length;
      this.log(`Checkpoint check completed: ${checkpointsGenerated} checkpoints generated`);

      return evaluations;
    } catch (error) {
      console.error('Error during checkpoint check:', error);
      throw error;
    }
  }

  /**
   * Evaluate a single tab for checkpoint needs
   */
  private evaluateTabForCheckpoint(
    tabId: number,
    tabState: TabState,
    currentTime: number
  ): CheckpointEvaluation {
    const activeTimeDuration = tabState.activeTimeStart
      ? currentTime - tabState.activeTimeStart
      : 0;
    const openTimeDuration = currentTime - tabState.openTimeStart;

    // Convert thresholds from hours to milliseconds
    const activeThresholdMs = this.config.activeTimeThresholdHours * 60 * 60 * 1000;
    const openThresholdMs = this.config.openTimeThresholdHours * 60 * 60 * 1000;

    // Check active time threshold first (higher priority)
    if (tabState.activeTimeStart && activeTimeDuration >= activeThresholdMs) {
      return {
        tabId,
        needsCheckpoint: true,
        checkpointType: 'active_time',
        duration: activeTimeDuration,
        tabState,
      };
    }

    // Check open time threshold
    if (openTimeDuration >= openThresholdMs) {
      return {
        tabId,
        needsCheckpoint: true,
        checkpointType: 'open_time',
        duration: openTimeDuration,
        tabState,
      };
    }

    // No checkpoint needed
    return {
      tabId,
      needsCheckpoint: false,
      checkpointType: null,
      duration: Math.max(activeTimeDuration, openTimeDuration),
      tabState,
    };
  }

  /**
   * Generate a checkpoint event
   */
  private async generateCheckpoint(evaluation: CheckpointEvaluation): Promise<void> {
    if (!evaluation.needsCheckpoint || !evaluation.checkpointType) {
      return;
    }

    try {
      const checkpointData: CheckpointData = {
        checkpointType: evaluation.checkpointType,
        duration: evaluation.duration,
        isPeriodic: true,
      };

      const context = {
        tabState: evaluation.tabState,
        timestamp: Date.now(),
      };

      const result = this.eventGenerator.generateCheckpoint(context, checkpointData);

      if (result.success && result.event) {
        await this.eventQueue.enqueue(result.event);
        this.stats.totalCheckpoints++;

        this.log(
          `Checkpoint generated for tab ${evaluation.tabId}: ` +
            `${evaluation.checkpointType} (${Math.round(evaluation.duration / 1000)}s)`
        );
      } else {
        console.error('Failed to generate checkpoint:', result.error);
      }
    } catch (error) {
      console.error('Error generating checkpoint:', error);
    }
  }

  /**
   * Log debug messages if enabled
   */
  private log(message: string): void {
    if (this.config.enableDebugLogging) {
      console.log(`[CheckpointScheduler] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Instantiates a CheckpointScheduler using the specified managers and optional configuration.
 *
 * @returns A new CheckpointScheduler instance.
 */
export function createCheckpointScheduler(
  tabStateManager: TabStateManager,
  eventGenerator: EventGenerator,
  eventQueue: EventQueue,
  config?: Partial<CheckpointSchedulerConfig>
): CheckpointScheduler {
  return new CheckpointScheduler(tabStateManager, eventGenerator, eventQueue, config);
}

/**
 * Creates a CheckpointScheduler instance with debug logging enabled.
 *
 * The returned scheduler will output detailed debug information during operation.
 *
 * @returns A CheckpointScheduler configured to log debug messages.
 */
export function createDebugCheckpointScheduler(
  tabStateManager: TabStateManager,
  eventGenerator: EventGenerator,
  eventQueue: EventQueue
): CheckpointScheduler {
  return new CheckpointScheduler(tabStateManager, eventGenerator, eventQueue, {
    enableDebugLogging: true,
  });
}
