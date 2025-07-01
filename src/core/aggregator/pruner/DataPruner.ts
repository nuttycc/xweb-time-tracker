import { DEFAULT_PRUNER_RETENTION_DAYS, PRUNER_RETENTION_DAYS_KEY } from '../utils/constants';
import type { EventsLogRepository } from '../../db/repositories/eventslog.repository';
import type { EventsLogRecord } from '../../db/schemas/eventslog.schema';
import { createEmojiLogger, LogCategory, type EmojiLogger } from '@/utils/logger-emoji';
import { storage } from '#imports';

/**
 * Cleans up old, processed event logs from the database.
 */
export class DataPruner {
  private readonly logger: EmojiLogger;

  /**
   * @param eventsLogRepo - Repository for accessing event log data.
   */
  constructor(private readonly eventsLogRepo: EventsLogRepository) {
    this.logger = createEmojiLogger('DataPruner');
  }

  /**
   * Runs the data pruning process.
   *
   * Deletes processed events that are older than the retention period.
   */
  public async run(): Promise<void> {
    this.logger.logWithEmoji(LogCategory.START, 'info', 'data pruning process');
    
    try {
      const retentionDays = await storage.getItem<number>(PRUNER_RETENTION_DAYS_KEY);
      const effectiveRetentionDays = retentionDays ?? DEFAULT_PRUNER_RETENTION_DAYS;
      const retentionTimestamp = Date.now() - effectiveRetentionDays * 24 * 60 * 60 * 1000;
      
      this.logger.logWithEmoji(LogCategory.DB, 'debug', 'fetching old processed events', { 
        retentionDays: effectiveRetentionDays,
        cutoffTimestamp: retentionTimestamp 
      });
      
      const oldEvents = await this.eventsLogRepo.getProcessedEventsOlderThan(retentionTimestamp);

      if (oldEvents.length > 0) {
        const eventIds = oldEvents.map((event: EventsLogRecord) => event.id!);
        
        this.logger.logWithEmoji(LogCategory.DB, 'info', 'deleting old events', { count: eventIds.length });
        await this.eventsLogRepo.deleteEventsByIds(eventIds);
        
        this.logger.logWithEmoji(LogCategory.SUCCESS, 'info', 'pruning completed', { prunedEvents: eventIds.length });
      } else {
        this.logger.logWithEmoji(LogCategory.SKIP, 'info', 'no old events to prune');
      }
      
      this.logger.logWithEmoji(LogCategory.END, 'info', 'data pruning process');
    } catch (error) {
      this.logger.logWithEmoji(LogCategory.ERROR, 'error', 'error during data pruning', { error });
    }
  }
}
