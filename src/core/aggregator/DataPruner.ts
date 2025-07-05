import { DEFAULT_PRUNER_RETENTION_DAYS, PRUNER_RETENTION_DAYS_KEY } from './constants';
import type { EventsLogRepository } from '@/core/db/repositories/eventslog.repository';
import type { EventsLogRecord } from '@/core/db/schemas/eventslog.schema';
import { createLogger } from '@/utils/logger';
import { storage } from '#imports';

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
   * Deletes processed events that are older than the retention period.
   */
  public async run(): Promise<void> {
    DataPruner.logger.info('Start data pruning task');

    try {
      const retentionDays = await storage.getItem<number>(PRUNER_RETENTION_DAYS_KEY);
      const effectiveRetentionDays = retentionDays ?? DEFAULT_PRUNER_RETENTION_DAYS;
      const retentionTimestamp = Date.now() - effectiveRetentionDays * 24 * 60 * 60 * 1000;

      const oldEvents = await this.eventsLogRepo.getProcessedEventsOlderThan(retentionTimestamp);

      DataPruner.logger.debug('Get old processed events with retention days', {
        retentionDays: effectiveRetentionDays,
        cutoffTimestamp: retentionTimestamp,
        oldEventsCount: oldEvents.length,
      });

      if (oldEvents.length > 0) {
        const eventIds = oldEvents.map((event: EventsLogRecord) => event.id!);

        DataPruner.logger.info('Delete old events', {
          count: eventIds.length,
        });
        await this.eventsLogRepo.deleteEventsByIds(eventIds);

        DataPruner.logger.info('Complete data pruning task', { prunedEvents: eventIds.length });
      } else {
        DataPruner.logger.info('No old events to prune, complete data pruning task');
      }
    } catch (error) {
      DataPruner.logger.error('Fail data pruning task', { error });
    }
  }
}
