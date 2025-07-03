import type { AggregationScheduler } from '../scheduler';
import { createLogger } from '@/utils/logger';

/**
 * Main service for the aggregation module.
 *
 * Initializes and manages the aggregation engine, scheduler, and pruner.
 */
export class AggregationService {
  private static readonly logger = createLogger('AggregationService');

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
      AggregationService.logger.info('Aggregation service started successfully');
    } catch (error) {
      AggregationService.logger.error('Failed to start aggregation service', { error });
      throw error;
    }
  }

  /**
   * Stops the aggregation service.
   */
  public async stop(): Promise<void> {
    try {
      await this.aggregationScheduler.stop();
      AggregationService.logger.info('Aggregation service stopped successfully');
    } catch (error) {
      AggregationService.logger.error('Failed to stop aggregation service', { error });
      throw error;
    }
  }
}
