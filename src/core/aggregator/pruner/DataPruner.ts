import { DEFAULT_PRUNER_RETENTION_DAYS, PRUNER_RETENTION_DAYS_KEY } from '../utils/constants';
import type { EventsLogRepository } from '../../db/repositories/eventslog.repository';
import type { EventsLogRecord } from '../../db/schemas/eventslog.schema';
import { storage } from '#imports';

/**
 * Cleans up old, processed event logs from the database.
 */
export class DataPruner {
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
    try {
      const retentionDays = await storage.getItem<number>(PRUNER_RETENTION_DAYS_KEY);
      const retentionTimestamp =
        Date.now() - (retentionDays ?? DEFAULT_PRUNER_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
      const oldEvents = await this.eventsLogRepo.getProcessedEventsOlderThan(retentionTimestamp);

      if (oldEvents.length > 0) {
        const eventIds = oldEvents
          .filter((event: EventsLogRecord) => event.id != null)
          .map((event: EventsLogRecord) => event.id!);

        if (eventIds.length > 0) {
          await this.eventsLogRepo.deleteEventsByIds(eventIds);
          console.log(`Pruned ${eventIds.length} old events.`);
        } else {
          console.warn('No valid event IDs found for pruning.');
        }
      }
    } catch (error) {
      console.error('Error during data pruning:', error);
    }
  }
}
