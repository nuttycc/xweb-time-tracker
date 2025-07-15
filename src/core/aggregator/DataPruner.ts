import { configManager } from '@/config/manager';
import type { EventsLogRepository } from '@/core/db/repositories/eventslog.repository';
import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';
import type { RetentionPolicyConfig } from '@/config/constants';
import { createLogger } from '@/utils/logger';

/**
 * Cleans up old, processed event logs from the database.
 */
export class DataPruner {
  private static readonly logger = createLogger('🧹 DataPruner');

  /**
   * @param eventsLogRepo - Repository for accessing event log data.
   */
  constructor(private readonly eventsLogRepo: EventsLogRepository) {}

  /**
   * Runs the data pruning process.
   *
   * Deletes processed events that are older than the retention period
   * based on the configured retention policy.
   */
  public async run(): Promise<void> {
    DataPruner.logger.info('Start data pruning task');

    try {
      await configManager.initialize();
      const config = configManager.getConfig();
      const retentionPolicy = config.retentionPolicy;

      const retentionDays = this.calculateRetentionDays(retentionPolicy);

      // Skip pruning for permanent retention policy
      if (retentionDays === null) {
        DataPruner.logger.info('Permanent retention policy active, skipping data pruning');
        return;
      }

      const retentionTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const oldEvents = await this.eventsLogRepo.getProcessedEventsOlderThan(retentionTimestamp);

      DataPruner.logger.debug('Get old processed events with retention policy', {
        policy: retentionPolicy.policy,
        retentionDays,
        cutoffTimestamp: retentionTimestamp,
        oldEventsCount: oldEvents.length,
      });

      if (oldEvents.length > 0) {
        const eventIds = oldEvents.map((event: EventsLogRecord) => event.id!);

        DataPruner.logger.info('Delete old events', {
          count: eventIds.length,
          policy: retentionPolicy.policy,
        });
        await this.eventsLogRepo.deleteEventsByIds(eventIds);

        DataPruner.logger.info('Complete data pruning task', {
          prunedEvents: eventIds.length,
          policy: retentionPolicy.policy,
        });
      } else {
        DataPruner.logger.info('No old events to prune, complete data pruning task');
      }
    } catch (error) {
      DataPruner.logger.error('Fail data pruning task', { error });
    }
  }

  /**
   * Calculates the retention period in days based on the retention policy.
   *
   * @param retentionPolicy - The retention policy configuration
   * @returns The number of days to retain data, or null for permanent retention
   */
  private calculateRetentionDays(retentionPolicy: RetentionPolicyConfig): number | null {
    switch (retentionPolicy.policy) {
      case 'immediate':
        return 1; // Keep for 1 day to allow for processing
      case 'short':
        return retentionPolicy.shortDays;
      case 'long':
        return retentionPolicy.longDays;
      case 'permanent':
        return null; // Never delete
      default:
        DataPruner.logger.warn('Unknown retention policy, using default short retention', {
          policy: retentionPolicy.policy,
        });
        return retentionPolicy.shortDays;
    }
  }
}
