import type { AggregationScheduler } from '../scheduler';

/**
 * Main service for the aggregation module.
 *
 * Initializes and manages the aggregation engine, scheduler, and pruner.
 */
export class AggregationService {
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
      console.log('Aggregation service started successfully.');
    } catch (error) {
      console.error('Failed to start aggregation service:', error);
      throw error;
    }
  }

  /**
   * Stops the aggregation service.
   */
  public async stop(): Promise<void> {
    try {
      await this.aggregationScheduler.stop();
      console.log('Aggregation service stopped successfully.');
    } catch (error) {
      console.error('Failed to stop aggregation service:', error);
      throw error;
    }
  }
}
