import {
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
  AGGREGATION_LOCK_TTL_MS,
  SCHEDULER_PERIOD_MINUTES_KEY,
  DEFAULT_AGGREGATION_INTERVAL_MINUTES,
} from '../utils/constants';
import type { AggregationEngine } from '../engine';
import type { DataPruner } from '../pruner';
import { createLogger, type Logger } from '@/utils/logger';
import { browser, Browser } from 'wxt/browser';
import { storage } from '#imports';

export interface SchedulerOptions {
  logger?: Logger;
}

/**
 * Manages the scheduling of aggregation tasks using the browser.alarms API.
 */
export class AggregationScheduler {
  private isListenerRegistered: boolean = false;
  private static readonly logger = createLogger('⏰ AggregationScheduler');

  /**
   * @param aggregationEngine
   * @param dataPruner
   * @param options
   */
  constructor(
    private readonly aggregationEngine: AggregationEngine,
    private readonly dataPruner: DataPruner,
    private readonly options: SchedulerOptions = {}
  ) {
    this.handleAlarm = this.handleAlarm.bind(this);
  }

  public async start(): Promise<void> {
    AggregationScheduler.logger.info('Start aggregation scheduler');
    let periodInMinutes =
      (await storage.getItem<number>(SCHEDULER_PERIOD_MINUTES_KEY)) ??
      DEFAULT_AGGREGATION_INTERVAL_MINUTES;

    // In development mode, use a shorter interval for faster testing
    // Note: Chrome alarms API minimum is 1 minute
    if (import.meta.env.DEV) {
      periodInMinutes = Math.min(periodInMinutes, 100);
    }

    AggregationScheduler.logger.info('Create aggregation alarm with period', {
      periodInMinutes,
      isDev: import.meta.env.DEV,
    });

    browser.alarms.create(AGGREGATION_ALARM_NAME, {
      periodInMinutes,
    });

    if (!this.isListenerRegistered) {
      browser.alarms.onAlarm.addListener(this.handleAlarm);
      this.isListenerRegistered = true;
    }
  }

  private handleAlarm(alarm: Browser.alarms.Alarm): void {
    if (alarm.name === AGGREGATION_ALARM_NAME) {
      this.runTask();
    }
  }

  public async stop(): Promise<boolean> {

    const cleared = await browser.alarms.clear(AGGREGATION_ALARM_NAME);
    if (this.isListenerRegistered) {
      AggregationScheduler.logger.debug('Remove alarm listener');
      browser.alarms.onAlarm.removeListener(this.handleAlarm);
      this.isListenerRegistered = false;
    }

    AggregationScheduler.logger.info('Stop aggregation scheduler', {
      alarmCleared: cleared,
    });

    return cleared;
  }

  /**
   * Resets the scheduler.
   *
   * Stops and then immediately restarts the scheduler.
   */
  public async reset(): Promise<void> {
    AggregationScheduler.logger.info('Reset aggregation scheduler');
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
    AggregationScheduler.logger.info('Execute manual aggregation');
    await this.runTask();
  }

  /**
   * Runs the aggregation task, ensuring that only one instance runs at a time.
   */
  private async runTask(): Promise<void> {
    const lock = await storage.getItem<{ timestamp: number }>(AGGREGATION_LOCK_KEY);
    if (lock && Date.now() - lock.timestamp < AGGREGATION_LOCK_TTL_MS) {
      AggregationScheduler.logger.warn('Skip aggregation task (already running)');
      return;
    }
    AggregationScheduler.logger.info('Run scheduled aggregation task');
    await storage.setItem(AGGREGATION_LOCK_KEY, { timestamp: Date.now() });
    const startTime = Date.now();
    try {
      const result = await this.aggregationEngine.run();
      if (result.success) {
        AggregationScheduler.logger.info('Complete aggregation task');
        await this.dataPruner.run();
      } else {
        AggregationScheduler.logger.error('Fail aggregation task', {
          error: result.error,
        });
      }
    } catch (error) {
      AggregationScheduler.logger.error('Fail scheduled aggregation task', {
        error,
      });
    } finally {
      await storage.removeItem(AGGREGATION_LOCK_KEY);
      const duration = Date.now() - startTime;
      AggregationScheduler.logger.info('Finish aggregation task', { duration: `${duration}ms` });
    }
  }
}
