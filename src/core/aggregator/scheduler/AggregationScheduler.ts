import {
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
  AGGREGATION_LOCK_TTL_MS,
  SCHEDULER_PERIOD_MINUTES_KEY,
  DEFAULT_AGGREGATION_INTERVAL_MINUTES,
} from '../utils/constants';
import type { AggregationEngine } from '../engine';
import type { DataPruner } from '../pruner';
import { createEmojiLogger, LogCategory, type EmojiLogger } from '@/utils/logger-emoji';
import { browser, Browser } from 'wxt/browser';
import { storage } from '#imports';

export interface SchedulerOptions {
  logger?: EmojiLogger;
}

/**
 * Manages the scheduling of aggregation tasks using the browser.alarms API.
 */
export class AggregationScheduler {
  private isListenerRegistered: boolean = false;
  private logger: EmojiLogger;

  /**
   * @param aggregationEngine - The engine to run when the alarm fires.
   * @param dataPruner - The pruner to run after aggregation.
   * @param options - Configuration for the scheduler.
   */
  constructor(
    private readonly aggregationEngine: AggregationEngine,
    private readonly dataPruner: DataPruner,
    options: SchedulerOptions = {}
  ) {
    this.logger = options.logger ?? createEmojiLogger('AggregationScheduler');
    this.handleAlarm = this.handleAlarm.bind(this);
  }

  /**
   * Starts the scheduler.
   *
   * Creates a recurring alarm that will trigger the aggregation process.
   */
  public async start(): Promise<void> {
    this.logger.logWithEmoji(LogCategory.START, 'info', 'aggregation scheduler');
    
    let periodInMinutes = 
      (await storage.getItem<number>(SCHEDULER_PERIOD_MINUTES_KEY)) ??
      DEFAULT_AGGREGATION_INTERVAL_MINUTES;
    
    // In development mode, use a shorter interval for faster testing
    // Note: Chrome alarms API minimum is 1 minute
    if (import.meta.env.DEV) {
      periodInMinutes = Math.min(periodInMinutes, 1);
      this.logger.logWithEmoji(LogCategory.SCHEDULE, 'debug', 'development mode: using 1-minute interval');
    }
    
    this.logger.logWithEmoji(LogCategory.SCHEDULE, 'info', 'creating alarm', { 
      periodInMinutes,
      isDev: import.meta.env.DEV 
    });
    
    browser.alarms.create(AGGREGATION_ALARM_NAME, {
      periodInMinutes,
    });

    if (!this.isListenerRegistered) {
      browser.alarms.onAlarm.addListener(this.handleAlarm);
      this.isListenerRegistered = true;
      this.logger.logWithEmoji(LogCategory.SUCCESS, 'debug', 'alarm listener registered');
    }
  }

  /**
   * Handles the alarm event.
   * @param alarm - The alarm that fired.
   */
  private handleAlarm(alarm: Browser.alarms.Alarm): void {
    if (alarm.name === AGGREGATION_ALARM_NAME) {
      this.runTask();
    }
  }

  /**
   * Stops the scheduler.
   *
   * Clears the aggregation alarm.
   */
  public async stop(): Promise<boolean> {
    this.logger.logWithEmoji(LogCategory.END, 'info', 'stopping aggregation scheduler');
    
    const cleared = await browser.alarms.clear(AGGREGATION_ALARM_NAME);
    if (this.isListenerRegistered) {
      browser.alarms.onAlarm.removeListener(this.handleAlarm);
      this.isListenerRegistered = false;
      this.logger.logWithEmoji(LogCategory.SUCCESS, 'debug', 'alarm listener removed');
    }
    
    this.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'scheduler stopped', { alarmCleared: cleared });
    return cleared;
  }

  /**
   * Resets the scheduler.
   *
   * Stops and then immediately restarts the scheduler.
   */
  public async reset(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Manually triggers the aggregation task immediately.
   * Useful for development and debugging purposes.
   *
   * @returns Promise that resolves when the task completes
   */
  public async runNow(): Promise<void> {
    this.logger.logWithEmoji(LogCategory.START, 'info', 'manual aggregation trigger');
    await this.runTask();
  }

  /**
   * Runs the aggregation task, ensuring that only one instance runs at a time.
   */
  private async runTask(): Promise<void> {
    const lock = await storage.getItem<{ timestamp: number }>(AGGREGATION_LOCK_KEY);
    if (lock && Date.now() - lock.timestamp < AGGREGATION_LOCK_TTL_MS) {
      this.logger.logWithEmoji(LogCategory.SKIP, 'warn', 'aggregation task already running');
      return;
    }

    await storage.setItem(AGGREGATION_LOCK_KEY, { timestamp: Date.now() });
    const startTime = Date.now();
    this.logger.logWithEmoji(LogCategory.START, 'info', 'scheduled aggregation task');
    
    try {
      const result = await this.aggregationEngine.run();
      if (result.success) {
        this.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'aggregation completed', { processedEvents: result.processedEvents });
        await this.dataPruner.run();
      } else {
        this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'aggregation failed', { error: result.error });
      }
    } catch (error) {
      this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'error during scheduled aggregation', { error });
    } finally {
      await storage.removeItem(AGGREGATION_LOCK_KEY);
      const duration = Date.now() - startTime;
      this.logger.logWithEmoji(LogCategory.END, 'info', 'aggregation task finished', { duration: `${duration}ms` });
    }
  }
}
