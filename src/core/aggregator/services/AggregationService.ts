import type { AggregationScheduler } from '../scheduler';
import { createEmojiLogger, LogCategory } from '@/utils/logger-emoji';

/**
 * Main service for the aggregation module.
 *
 * Initializes and manages the aggregation engine, scheduler, and pruner.
 */
export class AggregationService {
  private static readonly logger = createEmojiLogger('AggregationService');

  /**
   * @param aggregationScheduler - The scheduler to manage.
   */
  constructor(private readonly aggregationScheduler: AggregationScheduler) {}

  /**
   * Starts the aggregation service.
   */
  public async start(): Promise<void> {
    try {
      await this.aggregationScheduler.start();
      AggregationService.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'aggregation service started successfully');
    } catch (error) {
      AggregationService.logger.logWithEmoji(LogCategory.ERROR, 'error', 'failed to start aggregation service', { error });
      throw error;
    }
  }

  /**
   * Stops the aggregation service.
   */
  public async stop(): Promise<void> {
    try {
      await this.aggregationScheduler.stop();
      AggregationService.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'aggregation service stopped successfully');
    } catch (error) {
      AggregationService.logger.logWithEmoji(LogCategory.ERROR, 'error', 'failed to stop aggregation service', { error });
      throw error;
    }
  }
}
