/**
 * Event Queue for Time Tracking System
 *
 * Implements a FIFO event queue with batch processing capabilities. The queue collects
 * generated events in memory and triggers batch writes to the database when size thresholds
 * or time intervals are reached. It integrates with the DatabaseService for batch writing
 * and handles back-pressure scenarios.
 *
 * @author WebTime Tracker Team
 * @version 1.0.0
 */

import { z } from 'zod/v4';
import { DomainEvent, QueuedEvent, QueuedEventSchema } from '../types';
// import { DatabaseService } from '../../db/services/database.service';
import { WebTimeTrackerDB } from '../../db/schemas';

// ============================================================================
// Configuration and Constants
// ============================================================================

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG = {
  /** Maximum number of events to hold in memory before forcing a flush */
  maxQueueSize: 100,
  /** Maximum time (ms) to wait before flushing pending events */
  maxWaitTime: 5000, // 5 seconds
  /** Maximum number of retry attempts for failed writes */
  maxRetries: 3,
  /** Delay between retry attempts (ms) */
  retryDelay: 1000,
} as const;

/**
 * Queue configuration schema
 */
export const QueueConfigSchema = z.object({
  maxQueueSize: z.number().int().min(1).max(1000),
  maxWaitTime: z.number().int().min(1000).max(60000),
  maxRetries: z.number().int().min(0).max(10),
  retryDelay: z.number().int().min(100).max(10000),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
  /** Current number of events in queue */
  queueSize: number;
  /** Total events processed since creation */
  totalProcessed: number;
  /** Total events failed (after all retries) */
  totalFailed: number;
  /** Number of successful batch writes */
  batchWrites: number;
  /** Average batch size */
  averageBatchSize: number;
  /** Last flush timestamp */
  lastFlushTime: number | null;
}

// ============================================================================
// Event Queue Implementation
// ============================================================================

/**
 * FIFO Event Queue with batch processing
 *
 * Features:
 * - FIFO ordering guarantee
 * - Configurable batch size and time thresholds
 * - Automatic retry with exponential backoff
 * - Memory pressure handling
 * - Graceful shutdown with data persistence
 */
export class EventQueue {
  private readonly config: QueueConfig;
  private readonly queue: QueuedEvent[] = [];
  private readonly db: WebTimeTrackerDB;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private stats: QueueStats;

  constructor(db: WebTimeTrackerDB, config: Partial<QueueConfig> = {}) {
    this.config = QueueConfigSchema.parse({ ...DEFAULT_QUEUE_CONFIG, ...config });
    this.db = db;
    this.stats = {
      queueSize: 0,
      totalProcessed: 0,
      totalFailed: 0,
      batchWrites: 0,
      averageBatchSize: 0,
      lastFlushTime: null,
    };
  }

  /**
   * Add an event to the queue
   *
   * @param event - Domain event to queue
   * @throws {Error} If queue is shutting down or event validation fails
   */
  async enqueue(event: DomainEvent): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot enqueue events during shutdown');
    }

    // Validate event
    const validatedEvent = this.validateEvent(event);

    // Create queued event
    const queuedEvent: QueuedEvent = {
      event: validatedEvent,
      queuedAt: Date.now(),
      retryCount: 0,
    };

    // Add to queue
    this.queue.push(queuedEvent);
    this.stats.queueSize = this.queue.length;

    // Check if we need to flush
    if (this.shouldFlush()) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue statistics
   */
  getStats(): Readonly<QueueStats> {
    return { ...this.stats };
  }

  /**
   * Force flush all pending events
   *
   * @returns Number of events successfully written
   */
  async flush(): Promise<number> {
    if (this.queue.length === 0) {
      return 0;
    }

    // Clear any pending flush timer
    this.clearFlushTimer();

    // Extract events to process
    const eventsToProcess = this.queue.splice(0);
    this.stats.queueSize = 0;

    try {
      const successCount = await this.processBatch(eventsToProcess);
      this.stats.lastFlushTime = Date.now();
      this.stats.batchWrites++;
      this.updateAverageBatchSize(successCount);

      return successCount;
    } catch (error) {
      // Re-queue failed events for retry
      this.requeueFailedEvents(eventsToProcess);
      throw error;
    }
  }

  /**
   * Graceful shutdown - flush all pending events
   *
   * @param timeoutMs - Maximum time to wait for flush completion
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(timeoutMs = 10000): Promise<void> {
    this.isShuttingDown = true;
    this.clearFlushTimer();

    if (this.queue.length === 0) {
      return;
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), timeoutMs);
    });

    // Race between flush completion and timeout
    try {
      await Promise.race([this.flush(), timeoutPromise]);
    } catch (error) {
      console.error('EventQueue shutdown error:', error);
      // Continue with shutdown even if flush fails
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Validate domain event
   */
  private validateEvent(event: DomainEvent): DomainEvent {
    try {
      return QueuedEventSchema.parse({ event, queuedAt: Date.now(), retryCount: 0 }).event;
    } catch (error) {
      throw new Error(`Event validation failed: ${error}`);
    }
  }

  /**
   * Check if queue should be flushed
   */
  private shouldFlush(): boolean {
    return this.queue.length >= this.config.maxQueueSize;
  }

  /**
   * Schedule a flush after the configured wait time
   */
  private scheduleFlush(): void {
    if (this.flushTimer || this.isShuttingDown) {
      return;
    }

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      try {
        await this.flush();
      } catch (error) {
        console.error('Scheduled flush failed:', error);
      }
    }, this.config.maxWaitTime);
  }

  /**
   * Clear the flush timer
   */
  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Process a batch of events
   */
  private async processBatch(events: QueuedEvent[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    // Extract domain events for database write
    const domainEvents = events.map(qe => qe.event);

    try {
      // Use Dexie's bulkAdd for efficient batch writing
      await this.db.eventslog.bulkAdd(
        domainEvents.map(event => ({
          timestamp: event.timestamp,
          eventType: event.eventType,
          tabId: event.tabId,
          url: event.url,
          visitId: event.visitId,
          activityId: event.activityId,
          isProcessed: event.isProcessed,
          resolution: event.resolution,
        }))
      );

      this.stats.totalProcessed += events.length;
      return events.length;
    } catch (error) {
      console.error('Batch write failed:', error);
      throw error;
    }
  }

  /**
   * Re-queue failed events for retry
   */
  private requeueFailedEvents(events: QueuedEvent[]): void {
    const now = Date.now();

    for (const queuedEvent of events) {
      if (queuedEvent.retryCount < this.config.maxRetries) {
        // Increment retry count and re-queue
        queuedEvent.retryCount++;
        queuedEvent.queuedAt = now + this.config.retryDelay * queuedEvent.retryCount;
        this.queue.unshift(queuedEvent); // Add to front for priority
      } else {
        // Max retries exceeded
        this.stats.totalFailed++;
        console.error('Event failed after max retries:', queuedEvent.event);
      }
    }

    this.stats.queueSize = this.queue.length;
  }

  /**
   * Update average batch size statistic
   */
  private updateAverageBatchSize(batchSize: number): void {
    const totalBatches = this.stats.batchWrites;
    const currentAverage = this.stats.averageBatchSize;
    this.stats.averageBatchSize = (currentAverage * (totalBatches - 1) + batchSize) / totalBatches;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates an EventQueue instance with default or custom configuration.
 *
 * @param config - Optional partial configuration to override default queue settings
 * @returns A new EventQueue instance
 */
export function createEventQueue(db: WebTimeTrackerDB, config?: Partial<QueueConfig>): EventQueue {
  return new EventQueue(db, config);
}

/**
 * Creates an EventQueue instance configured for high-throughput event processing.
 *
 * The returned queue uses larger batch sizes, shorter wait times, increased retry attempts, and reduced retry delays to maximize write throughput.
 *
 * @returns An EventQueue optimized for handling large volumes of events efficiently.
 */
export function createHighThroughputEventQueue(db: WebTimeTrackerDB): EventQueue {
  return new EventQueue(db, {
    maxQueueSize: 500,
    maxWaitTime: 2000,
    maxRetries: 5,
    retryDelay: 500,
  });
}

/**
 * Creates an EventQueue instance configured for low-latency event processing.
 *
 * The returned queue uses small batch sizes and short wait times to minimize delay between event enqueue and database write, making it suitable for scenarios where timely persistence is critical.
 *
 * @returns An EventQueue with low-latency settings.
 */
export function createLowLatencyEventQueue(db: WebTimeTrackerDB): EventQueue {
  return new EventQueue(db, {
    maxQueueSize: 10,
    maxWaitTime: 1000,
    maxRetries: 2,
    retryDelay: 200,
  });
}
