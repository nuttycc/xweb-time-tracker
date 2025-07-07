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
 */

// import { z } from 'zod/v4';
import { browser } from '#imports';
import { TabStateManager } from '@/core/tracker/utils/TabStateManager';
import { EventGenerator } from '@/core/tracker/utils/EventGenerator';
import { EventQueue } from '@/core/tracker/utils/EventQueue';
import { TabState, CheckpointData } from '@/core/tracker/types';
import { DEFAULT_CONFIG, type CheckpointConfig } from '@/config/constants';

// All types can be accessed via WXT's Browser namespace:
import { type Browser } from 'wxt/browser';
import { createLogger } from '@/utils/logger';

// ============================================================================
// Configuration and Types
// ============================================================================

/**
 * Checkpoint scheduler configuration
 */
export interface CheckpointSchedulerConfig {
  /** Alarm name for the checkpoint scheduler */
  alarmName: string;
  /** Interval in milliseconds between checkpoint checks */
  interval: number;
  /** Active time threshold in milliseconds */
  activeTimeThreshold: number;
  /** Open time threshold in milliseconds */
  openTimeThreshold: number;
  /** Whether to enable debug logging */
  enableDebugLogging: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: CheckpointSchedulerConfig = {
  alarmName: 'webtime-checkpoint-scheduler',
  interval: DEFAULT_CONFIG.checkpoint.interval,
  activeTimeThreshold: DEFAULT_CONFIG.checkpoint.activeTimeThreshold,
  openTimeThreshold: DEFAULT_CONFIG.checkpoint.openTimeThreshold,
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
  private static readonly logger = createLogger('🔄 CheckpointScheduler');
  private static readonly ALARM_NAME = 'webtime-checkpoint-scheduler';
  private readonly checkpointConfig: CheckpointConfig;
  private readonly enableDebugLogging: boolean;
  private readonly tabStateManager: TabStateManager;
  private readonly eventGenerator: EventGenerator;
  private readonly eventQueue: EventQueue;
  private isInitialized = false;
  private stats: SchedulerStats;

  constructor(
    tabStateManager: TabStateManager,
    eventGenerator: EventGenerator,
    eventQueue: EventQueue,
    config: CheckpointConfig,
    enableDebugLogging = false,
  ) {
    this.checkpointConfig = config;
    this.enableDebugLogging = enableDebugLogging;
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
      CheckpointScheduler.logger.info('Scheduler already initialized');
      return;
    }

    try {
      // Check if alarm already exists to avoid duplicates
      const existingAlarm = await browser.alarms.get(CheckpointScheduler.ALARM_NAME);

      if (!existingAlarm) {
        // Create the periodic alarm
        await browser.alarms.create(CheckpointScheduler.ALARM_NAME, {
          delayInMinutes: this.checkpointConfig.interval / 60000,
          periodInMinutes: this.checkpointConfig.interval / 60000,
        });
        CheckpointScheduler.logger.debug(
          `Checkpoint alarm created with ${this.checkpointConfig.interval / 60000} min interval`,
        );
      } else {
        CheckpointScheduler.logger.debug('Checkpoint alarm already exists, reusing existing alarm');
      }

      // Set up alarm listener
      browser.alarms.onAlarm.addListener(this.handleAlarm.bind(this));

      this.isInitialized = true;
      CheckpointScheduler.logger.info('Checkpoint scheduler initialized successfully');
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
      await browser.alarms.clear(CheckpointScheduler.ALARM_NAME);

      // Note: We can't remove specific listeners in Chrome extensions
      // The listener will be cleaned up when the service worker restarts

      this.isInitialized = false;
      CheckpointScheduler.logger.info('Checkpoint scheduler stopped');
    } catch (error) {
      CheckpointScheduler.logger.error('Failed to stop checkpoint scheduler:', error);
      throw error;
    }
  }

  /**
   * Manually trigger a checkpoint check
   * Useful for testing or immediate evaluation
   */
  async triggerCheck(): Promise<CheckpointEvaluation[]> {
    CheckpointScheduler.logger.info('Manual checkpoint check triggered');
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
    if (alarm.name !== CheckpointScheduler.ALARM_NAME) {
      return;
    }

    CheckpointScheduler.logger.info('Checkpoint alarm triggered');

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
        CheckpointScheduler.logger.info('No active sessions to check');
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

      const checkpointsGenerated = evaluations.filter(e => e.needsCheckpoint);
      CheckpointScheduler.logger.debug('Checkpoint check completed', {checkpointsGenerated});
      
      return evaluations;
    } catch (error) {
      CheckpointScheduler.logger.error('Error during checkpoint check:', error);
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

    const activeThreshold = this.checkpointConfig.activeTimeThreshold;
    const openThreshold = this.checkpointConfig.openTimeThreshold;

    if (tabState.activeTimeStart && activeTimeDuration >= activeThreshold) {
      return {
        tabId,
        needsCheckpoint: true,
        checkpointType: 'active_time',
        duration: activeTimeDuration,
        tabState,
      };
    }
    if (openTimeDuration >= openThreshold) {
      return {
        tabId,
        needsCheckpoint: true,
        checkpointType: 'open_time',
        duration: openTimeDuration,
        tabState,
      };
    }
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
        CheckpointScheduler.logger.error('Failed to generate checkpoint:', result.error);
      }
    } catch (error) {
      CheckpointScheduler.logger.error('Error generating checkpoint:', error);
    }
  }

  /**
   * Log debug messages if enabled
   */
  private log(message: string): void {
    if (this.enableDebugLogging) {
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
  config: CheckpointConfig,
  enableDebugLogging: boolean,
): CheckpointScheduler {
  return new CheckpointScheduler(
    tabStateManager,
    eventGenerator,
    eventQueue,
    config,
    enableDebugLogging,
  );
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
  eventQueue: EventQueue,
): CheckpointScheduler {
  return new CheckpointScheduler(
    tabStateManager,
    eventGenerator,
    eventQueue,
    DEFAULT_CONFIG.checkpoint,
    true,
  );
}
