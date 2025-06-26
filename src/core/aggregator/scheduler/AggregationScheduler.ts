import {
  AGGREGATION_ALARM_NAME,
  AGGREGATION_LOCK_KEY,
  AGGREGATION_LOCK_TTL_MS,
  SCHEDULER_PERIOD_MINUTES_KEY,
  DEFAULT_AGGREGATION_INTERVAL_MINUTES,
} from '../utils/constants';
import type { AggregationEngine } from '../engine';
import type { DataPruner } from '../pruner';
import type { Logger } from '../utils/types';
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
  private logger: Logger;

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
    this.logger = options.logger ?? console;
    this.handleAlarm = this.handleAlarm.bind(this);
  }

  /**
   * Starts the scheduler.
   *
   * Creates a recurring alarm that will trigger the aggregation process.
   */
  public async start(): Promise<void> {
    const periodInMinutes = (await storage.getItem<number>(SCHEDULER_PERIOD_MINUTES_KEY)) ?? 60;
    browser.alarms.create(AGGREGATION_ALARM_NAME, {
      periodInMinutes,
    });

    if (!this.isListenerRegistered) {
      browser.alarms.onAlarm.addListener(this.handleAlarm);
      this.isListenerRegistered = true;
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
    const cleared = await browser.alarms.clear(AGGREGATION_ALARM_NAME);
    if (this.isListenerRegistered) {
      browser.alarms.onAlarm.removeListener(this.handleAlarm);
      this.isListenerRegistered = false;
    }
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
   * Runs the aggregation task, ensuring that only one instance runs at a time.
   */
  private async runTask(): Promise<void> {
    const lock = await storage.getItem<{ timestamp: number }>(AGGREGATION_LOCK_KEY);
    if (lock && Date.now() - lock.timestamp < AGGREGATION_LOCK_TTL_MS) {
      this.logger.log('Aggregation task is already running. Skipping.');
      return;
    }

    await storage.setItem(AGGREGATION_LOCK_KEY, { timestamp: Date.now() });
    const startTime = Date.now();
    this.logger.log('Starting scheduled aggregation...');
    try {
      const result = await this.aggregationEngine.run();
      if (result.success) {
        this.logger.log(
          `Aggregation finished successfully. Processed ${result.processedEvents} events.`
        );
        await this.dataPruner.run();
      } else {
        this.logger.error('Aggregation failed:', result.error);
      }
    } catch (error) {
      this.logger.error('Error during scheduled aggregation:', error);
    } finally {
      await storage.removeItem(AGGREGATION_LOCK_KEY);
      const duration = Date.now() - startTime;
      this.logger.log(`Aggregation task finished in ${duration}ms.`);
    }
  }
}
