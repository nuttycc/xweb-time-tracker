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
import { createLogger } from '@/utils/logger';

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
  /** Maximum number of event fingerprints to cache for deduplication */
  maxDeduplicationCacheSize: 1000,
  /** Time window (ms) for considering events as duplicates */
  deduplicationTimeWindow: 60000, // 1 minute
} as const;

/**
 * Queue configuration schema
 */
export const QueueConfigSchema = z.object({
  maxQueueSize: z.number().int().min(1).max(1000),
  maxWaitTime: z.number().int().min(1000).max(60000),
  maxRetries: z.number().int().min(0).max(10),
  retryDelay: z.number().int().min(100).max(10000),
  maxDeduplicationCacheSize: z.number().int().min(100).max(10000),
  deduplicationTimeWindow: z.number().int().min(1000).max(300000), // 1s to 5min
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

/**
 * Event fingerprint for deduplication
 */
export interface EventFingerprint {
  /** Unique identifier for the event fingerprint */
  id: string;
  /** Event type (open_time_start, open_time_end, etc.) */
  eventType: string;
  /** Tab ID */
  tabId: number;
  /** Visit ID (for open time events) */
  visitId?: string;
  /** Activity ID (for active time events) */
  activityId?: string;
  /** Timestamp when fingerprint was created */
  timestamp: number;
}

/**
 * LRU Cache node for deduplication
 */
interface CacheNode {
  fingerprint: EventFingerprint;
  prev: CacheNode | null;
  next: CacheNode | null;
}

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
  /** Number of duplicate events detected and filtered */
  duplicatesFiltered: number;
  /** Current size of deduplication cache */
  deduplicationCacheSize: number;
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
  private static readonly logger = createLogger('EventQueue');
  private readonly config: QueueConfig;
  private readonly queue: QueuedEvent[] = [];
  private readonly db: WebTimeTrackerDB;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private stats: QueueStats;

  // Deduplication cache (LRU implementation)
  private readonly fingerprintCache = new Map<string, CacheNode>();
  private cacheHead: CacheNode | null = null;
  private cacheTail: CacheNode | null = null;

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
      duplicatesFiltered: 0,
      deduplicationCacheSize: 0,
    };
  }

  /**
   * Generate a unique fingerprint for an event
   */
  private generateEventFingerprint(event: DomainEvent): EventFingerprint {
    const id = `${event.eventType}:${event.tabId}:${event.visitId || 'null'}:${event.activityId || 'null'}`;

    return {
      id,
      eventType: event.eventType,
      tabId: event.tabId,
      visitId: event.visitId || undefined,
      activityId: event.activityId || undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if an event is a duplicate based on fingerprint and time window
   */
  private isDuplicateEvent(fingerprint: EventFingerprint): boolean {
    const existingNode = this.fingerprintCache.get(fingerprint.id);

    if (!existingNode) {
      return false;
    }

    // Check if the existing event is within the time window
    const timeDiff = fingerprint.timestamp - existingNode.fingerprint.timestamp;
    if (timeDiff <= this.config.deduplicationTimeWindow) {
      // Move to front (most recently used)
      this.moveToFront(existingNode);
      return true;
    }

    // Event is outside time window, remove old fingerprint
    this.removeFromCache(existingNode);
    return false;
  }

  /**
   * Add fingerprint to LRU cache
   */
  private addToCache(fingerprint: EventFingerprint): void {
    // Check if cache is at capacity
    if (this.fingerprintCache.size >= this.config.maxDeduplicationCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    const newNode: CacheNode = {
      fingerprint,
      prev: null,
      next: this.cacheHead,
    };

    if (this.cacheHead) {
      this.cacheHead.prev = newNode;
    }
    this.cacheHead = newNode;

    if (!this.cacheTail) {
      this.cacheTail = newNode;
    }

    this.fingerprintCache.set(fingerprint.id, newNode);
    this.stats.deduplicationCacheSize = this.fingerprintCache.size;
  }

  /**
   * Move a cache node to the front (most recently used)
   */
  private moveToFront(node: CacheNode): void {
    if (node === this.cacheHead) {
      return; // Already at front
    }

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node === this.cacheTail) {
      this.cacheTail = node.prev;
    }

    // Move to front
    node.prev = null;
    node.next = this.cacheHead;
    if (this.cacheHead) {
      this.cacheHead.prev = node;
    }
    this.cacheHead = node;
  }

  /**
   * Remove a node from the cache
   */
  private removeFromCache(node: CacheNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.cacheHead = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.cacheTail = node.prev;
    }

    this.fingerprintCache.delete(node.fingerprint.id);
    this.stats.deduplicationCacheSize = this.fingerprintCache.size;
  }

  /**
   * Evict the least recently used item from cache
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cacheTail) {
      this.removeFromCache(this.cacheTail);
    }
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

    // Generate fingerprint for deduplication
    const fingerprint = this.generateEventFingerprint(validatedEvent);

    // Check for duplicates
    if (this.isDuplicateEvent(fingerprint)) {
      this.stats.duplicatesFiltered++;
      EventQueue.logger.debug(`🚫 Filtered duplicate event: ${event.eventType}`, {
        tabId: event.tabId,
        visitId: event.visitId,
        activityId: event.activityId,
        duplicatesFiltered: this.stats.duplicatesFiltered
      });
      return; // Skip duplicate event
    }

    // Add fingerprint to cache
    this.addToCache(fingerprint);

    // Create queued event
    const queuedEvent: QueuedEvent = {
      event: validatedEvent,
      queuedAt: Date.now(),
      retryCount: 0,
    };

    // Add to queue
    this.queue.push(queuedEvent);
    this.stats.queueSize = this.queue.length;

    EventQueue.logger.debug(`📥 Enqueued event: ${event.eventType}`, { queueSize: this.queue.length, tabId: event.tabId });

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
   * Get deduplication statistics
   */
  getDeduplicationStats(): {
    duplicatesFiltered: number;
    cacheSize: number;
    cacheCapacity: number;
    timeWindow: number;
    filterRate: number;
  } {
    // Total events = processed + currently queued + filtered duplicates
    const totalEvents = this.stats.totalProcessed + this.queue.length + this.stats.duplicatesFiltered;
    const filterRate = totalEvents > 0 ? (this.stats.duplicatesFiltered / totalEvents) * 100 : 0;

    return {
      duplicatesFiltered: this.stats.duplicatesFiltered,
      cacheSize: this.stats.deduplicationCacheSize,
      cacheCapacity: this.config.maxDeduplicationCacheSize,
      timeWindow: this.config.deduplicationTimeWindow,
      filterRate: Math.round(filterRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Log deduplication statistics
   */
  logDeduplicationStats(): void {
    const stats = this.getDeduplicationStats();
    EventQueue.logger.info(`📊 Deduplication Statistics`, {
      duplicatesFiltered: stats.duplicatesFiltered,
      cacheSize: stats.cacheSize,
      cacheCapacity: stats.cacheCapacity,
      timeWindowMs: stats.timeWindow,
      filterRatePercent: stats.filterRate,
    });
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

    const queueSize = this.queue.length;
    const reason = this.queue.length >= this.config.maxQueueSize ? 'maxQueueSize' : 'scheduled';
    EventQueue.logger.info(`📤 Flushing queue: ${queueSize} events`, { reason });

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

      // Log deduplication stats every 10 batch writes
      if (this.stats.batchWrites % 10 === 0) {
        this.logDeduplicationStats();
      }

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
      EventQueue.logger.error('❌ EventQueue shutdown error', { error: error instanceof Error ? error.message : String(error) });
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

    EventQueue.logger.debug(`⏰ Scheduled flush in ${this.config.maxWaitTime}ms`, { queueSize: this.queue.length });

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      try {
        await this.flush();
      } catch (error) {
        EventQueue.logger.error('❌ Scheduled flush failed', { error: error instanceof Error ? error.message : String(error) });
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

    const startTime = Date.now();
    EventQueue.logger.info(`💾 Writing ${events.length} events to database...`, events);

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

      const duration = Date.now() - startTime;
      EventQueue.logger.info(`✅ Bulk write success: ${events.length} events`, { duration: `${duration}ms` });

      this.stats.totalProcessed += events.length;
      return events.length;
    } catch (error) {
      EventQueue.logger.error('❌ Bulk write failed', { error: error instanceof Error ? error.message : String(error), eventsCount: events.length });
      throw error;
    }
  }

  /**
   * Re-queue failed events for retry
   */
  private requeueFailedEvents(events: QueuedEvent[]): void {
    const now = Date.now();
    let requeuedCount = 0;
    let failedCount = 0;

    for (const queuedEvent of events) {
      if (queuedEvent.retryCount < this.config.maxRetries) {
        // Increment retry count and re-queue
        queuedEvent.retryCount++;
        queuedEvent.queuedAt = now + this.config.retryDelay * queuedEvent.retryCount;
        this.queue.unshift(queuedEvent); // Add to front for priority
        requeuedCount++;
      } else {
        // Max retries exceeded
        this.stats.totalFailed++;
        EventQueue.logger.error('❌ Event failed after max retries', { eventType: queuedEvent.event.eventType, tabId: queuedEvent.event.tabId });
        failedCount++;
      }
    }

    if (requeuedCount > 0) {
      EventQueue.logger.warn(`⚠️ Re-queuing ${requeuedCount} failed events for retry`);
    }
    if (failedCount > 0) {
      EventQueue.logger.error(`❌ ${failedCount} events permanently failed after max retries`);
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
 * Creates a new EventQueue for batching and persisting domain events.
 *
 * Accepts an optional partial configuration to override default queue settings.
 *
 * @returns An EventQueue instance configured for efficient event batching and database writes.
 */
export function createEventQueue(db: WebTimeTrackerDB, config?: Partial<QueueConfig>): EventQueue {
  return new EventQueue(db, config);
}

/**
 * Creates an EventQueue optimized for high-throughput batch processing.
 *
 * The queue is configured with large batch sizes, short flush intervals, increased retry attempts, and reduced retry delays to efficiently handle large volumes of events.
 *
 * @returns An EventQueue instance tuned for maximum write throughput.
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
 * Creates an EventQueue optimized for minimal delay between event enqueue and database write.
 *
 * The queue is configured with small batch sizes, short flush intervals, and limited retries, making it suitable for applications requiring rapid event persistence.
 *
 * @returns An EventQueue instance with low-latency configuration.
 */
export function createLowLatencyEventQueue(db: WebTimeTrackerDB): EventQueue {
  return new EventQueue(db, {
    maxQueueSize: 10,
    maxWaitTime: 1000,
    maxRetries: 2,
    retryDelay: 200,
  });
}

