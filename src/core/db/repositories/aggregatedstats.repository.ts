/**
 * AggregatedStats Repository Implementation
 *
 * This file implements the repository pattern for the aggregatedstats table,
 * providing type-safe CRUD operations, upsert logic, and domain-specific query methods.
 */

import {
  BaseRepository,
  ValidationError,
  type RepositoryOptions,
  type InsertType,
} from './base.repository';
import type { IDType } from 'dexie';
import type { WebTimeTrackerDB } from '../schemas';
import type { AggregatedStatsRecord } from '../schemas/aggregatedstats.schema';
import { generateAggregatedStatsKey, getUtcDateString } from '../schemas/aggregatedstats.schema';
import { AggregatedStatsValidation } from '../models/aggregatedstats.model';
import { createLogger } from '@/utils/logger';

/**
 * Query options for AggregatedStats operations
 *
 * @property {number} [limit] - Limits the number of results returned.
 * @property {number} [offset] - Skips a specified number of results.
 * @property {"date" | "last_updated" | "total_open_time" | "total_active_time"} [orderBy] - The field to order the results by.
 * @property {"asc" | "desc"} [orderDirection] - The direction of sorting, ascending or descending.
 */
export interface AggregatedStatsQueryOptions extends RepositoryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'date' | 'last_updated' | 'total_open_time' | 'total_active_time';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Time aggregation data for upsert operations
 *
 * @property {string} date - The date in YYYY-MM-DD format for the aggregation.
 * @property {string} url - The complete URL of the tracked resource. Must be a valid URL.
 * @property {string} hostname - The hostname of the tracked resource. Cannot be empty.
 * @property {string} parentDomain - The parent domain of the tracked resource. Cannot be empty.
 * @property {number} openTimeToAdd - The open time to add (in milliseconds). Must be a non-negative integer.
 * @property {number} activeTimeToAdd - The active time to add (in milliseconds). Must be a non-negative integer.
 */
export interface TimeAggregationData {
  date: string;
  url: string;
  hostname: string;
  parentDomain: string;
  openTimeToAdd: number;
  activeTimeToAdd: number;
}

/**
 * AggregatedStats Repository Class
 *
 * Provides data access operations for the aggregatedstats table with type safety,
 * validation, upsert logic for time aggregation, and domain-specific query methods.
 * Note: This repository works with string primary keys (composite format: "YYYY-MM-DD:url")
 */
export class AggregatedStatsRepository extends BaseRepository<AggregatedStatsRecord, 'key'> {
  private static readonly logger = createLogger('💾 AggregatedStatsRepository');

  constructor(db: WebTimeTrackerDB) {
    // Direct use of EntityTable without type assertion
    super(db, db.aggregatedstats, 'aggregatedstats');
  }

  /**
   * Insert or update aggregated stats
   * This is the primary method for aggregating time data
   *
   * @param data - Time aggregation data
   * @param options - Repository operation options
   * @returns Promise resolving to the primary key
   */
  async upsertTimeAggregation(
    data: TimeAggregationData,
    options: RepositoryOptions = {}
  ): Promise<string> {
    const startTime = performance.now();

    AggregatedStatsRepository.logger.debug('Upseting aggregation data', {
      data,
      options,
    });

    try {
      // Validate input data first (before generating key to ensure fast failure)
      this.validateTimeAggregationData(data);

      const key = generateAggregatedStatsKey(data.date, data.url);

      const result = await this.executeWithRetry(
        async () => {
          return this.db.transaction('rw', 'aggregatedstats', async () => {
            // Try to get existing record
            const existing = await this.table.get(key);

            if (existing) {
              // Update existing record by adding time values
              AggregatedStatsRepository.logger.info('Update existing aggregated stats record', {
                key,
              });

              const updatedRecord: Partial<AggregatedStatsRecord> = {
                // BUGFIX: The incoming data is in milliseconds, as is the stored value.
                // Remove the incorrect conversion to seconds.
                total_open_time: existing.total_open_time + data.openTimeToAdd,
                total_active_time: existing.total_active_time + data.activeTimeToAdd,
                // last_updated will be automatically set by the updating hook
              };

              await this.table.update(key, updatedRecord);

              AggregatedStatsRepository.logger.info(
                'Successfully updated existing aggregated stats record',
                { key, updatedRecord }
              );

              return key;
            } else {
              // Create new record
              AggregatedStatsRepository.logger.info('Create new aggregated stats record');

              const newRecord: AggregatedStatsRecord = {
                key,
                date: data.date,
                url: data.url,
                hostname: data.hostname,
                parentDomain: data.parentDomain,
                total_open_time: data.openTimeToAdd,
                total_active_time: data.activeTimeToAdd,
                last_updated: Date.now(), // Set current timestamp
              };

              // Validate the new record before adding
              await this.validateForCreate(newRecord);
              await this.table.add(newRecord);

              AggregatedStatsRepository.logger.info(
                'Successfully created new aggregated stats record',
                { key, newRecord }
              );

              return key;
            }
          });
        },
        'upsertTimeAggregation',
        options
      );

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Completed upsert time aggregation', {
        key,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Failed upsert time aggregation', {
        data,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw this.handleError(error, 'upsertTimeAggregation');
    }
  }

  /**
   * Get aggregated stats by date range
   *
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @param options - Query options
   * @returns Promise resolving to array of aggregated stats
   */
  async getStatsByDateRange(
    startDate: string,
    endDate: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    const startTime = performance.now();
    const { limit, offset = 0, orderBy = 'date', orderDirection = 'asc' } = options;

    AggregatedStatsRepository.logger.debug('Start stats query by date range', {
      startDate,
      endDate,
      limit,
      offset,
      orderBy,
      orderDirection,
    });

    try {
      const result = await this.executeWithRetry(
        async () => {
          AggregatedStatsRepository.logger.debug('Execute date range query', {
            startDate,
            endDate,
            orderBy,
            orderDirection,
          });

          let collection = this.table.where('date').between(startDate, endDate, true, true);

          // Apply ordering
          if (orderBy === 'date') {
            collection = orderDirection === 'desc' ? collection.reverse() : collection;

            AggregatedStatsRepository.logger.debug('Use database-level sorting for date field', {
              orderDirection,
            });
          } else {
            // For other fields, we need to sort after retrieval
            AggregatedStatsRepository.logger.debug('Use memory sorting for non-indexed field', {
              orderBy,
              orderDirection,
            });

            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            AggregatedStatsRepository.logger.debug('Apply memory sorting and pagination', {
              recordCount: results.length,
              sortedCount: sorted.length,
              offset,
              limit,
            });

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination for date-ordered results
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          AggregatedStatsRepository.logger.debug('Apply database-level pagination', {
            offset,
            limit,
          });

          return collection.toArray();
        },
        'getStatsByDateRange',
        options
      );

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Completed date range query', {
        startDate,
        endDate,
        resultCount: result.length,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Failed date range query', {
        startDate,
        endDate,
        options,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw this.handleError(error, 'getStatsByDateRange');
    }
  }

  /**
   * Get aggregated stats by hostname
   *
   * @param hostname - The hostname to filter by
   * @param options - Query options
   * @returns Promise resolving to array of aggregated stats
   */
  async getStatsByHostname(
    hostname: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    const startTime = performance.now();
    const { limit, offset = 0, orderBy = 'date', orderDirection = 'asc' } = options;

    AggregatedStatsRepository.logger.debug('Starting stats query by hostname', {
      hostname,
      limit,
      offset,
      orderBy,
      orderDirection,
    });

    try {
      const result = await this.executeWithRetry(
        async () => {
          AggregatedStatsRepository.logger.debug('Executing hostname query', {
            hostname,
            orderBy,
            orderDirection,
          });

          let collection = this.table.where('hostname').equals(hostname);

          // Apply ordering
          if (orderBy === 'date') {
            collection = orderDirection === 'desc' ? collection.reverse() : collection;

            AggregatedStatsRepository.logger.debug('Using database-level sorting for date field', {
              hostname,
              orderDirection,
            });
          } else {
            // For other fields, we need to sort after retrieval
            AggregatedStatsRepository.logger.debug('Using memory sorting for non-indexed field', {
              hostname,
              orderBy,
              orderDirection,
            });

            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            AggregatedStatsRepository.logger.debug(
              'Applied memory sorting and pagination for hostname query',
              { hostname, recordCount: results.length, sortedCount: sorted.length, offset, limit }
            );

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          AggregatedStatsRepository.logger.debug(
            'Applied database-level pagination for hostname query',
            { hostname, offset, limit }
          );

          return collection.toArray();
        },
        'getStatsByHostname',
        options
      );

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Hostname query completed successfully', {
        hostname,
        resultCount: result.length,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Hostname query failed', {
        hostname,
        options,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw this.handleError(error, 'getStatsByHostname');
    }
  }

  /**
   * Get aggregated stats by parent domain
   *
   * @param parentDomain - The parent domain to filter by
   * @param options - Query options
   * @returns Promise resolving to array of aggregated stats
   */
  async getStatsByParentDomain(
    parentDomain: string,
    options: AggregatedStatsQueryOptions = {}
  ): Promise<AggregatedStatsRecord[]> {
    const startTime = performance.now();
    const { limit, offset = 0, orderBy = 'date', orderDirection = 'asc' } = options;

    AggregatedStatsRepository.logger.debug('Starting stats query by parent domain', {
      parentDomain,
      limit,
      offset,
      orderBy,
      orderDirection,
    });

    try {
      const result = await this.executeWithRetry(
        async () => {
          AggregatedStatsRepository.logger.debug('Executing parent domain query', {
            parentDomain,
            orderBy,
            orderDirection,
          });

          let collection = this.table.where('parentDomain').equals(parentDomain);

          // Apply ordering
          if (orderBy === 'date') {
            collection = orderDirection === 'desc' ? collection.reverse() : collection;

            AggregatedStatsRepository.logger.debug('Using database-level sorting for date field', {
              parentDomain,
              orderDirection,
            });
          } else {
            // For other fields, we need to sort after retrieval
            AggregatedStatsRepository.logger.debug('Using memory sorting for non-indexed field', {
              parentDomain,
              orderBy,
              orderDirection,
            });

            const results = await collection.toArray();
            const sorted = this.sortRecords(results, orderBy, orderDirection);

            AggregatedStatsRepository.logger.debug(
              'Applied memory sorting and pagination for parent domain query',
              {
                parentDomain,
                recordCount: results.length,
                sortedCount: sorted.length,
                offset,
                limit,
              }
            );

            // Apply pagination manually for sorted results
            const start = offset;
            const end = limit ? start + limit : undefined;
            return sorted.slice(start, end);
          }

          // Apply pagination
          if (offset > 0) {
            collection = collection.offset(offset);
          }
          if (limit && limit > 0) {
            collection = collection.limit(limit);
          }

          AggregatedStatsRepository.logger.debug(
            'Applied database-level pagination for parent domain query',
            { parentDomain, offset, limit }
          );

          return collection.toArray();
        },
        'getStatsByParentDomain',
        options
      );

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Parent domain query completed successfully', {
        parentDomain,
        resultCount: result.length,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Parent domain query failed', {
        parentDomain,
        options,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw this.handleError(error, 'getStatsByParentDomain');
    }
  }

  /**
   * Get stats for a specific date and URL
   *
   * @param date - Date in YYYY-MM-DD format
   * @param url - Complete URL
   * @param options - Repository operation options
   * @returns Promise resolving to the stats record or undefined
   */
  async getStatsByDateAndUrl(
    date: string,
    url: string,
    options: RepositoryOptions = {}
  ): Promise<AggregatedStatsRecord | undefined> {
    const startTime = performance.now();
    const key = generateAggregatedStatsKey(date, url);

    AggregatedStatsRepository.logger.debug('Starting stats query by date and URL', {
      date,
      url,
      key,
    });

    try {
      const result = await this.findById(key, options);

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Date and URL query completed successfully', {
        date,
        url,
        key,
        found: result !== undefined,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Date and URL query failed', {
        date,
        url,
        key,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw error;
    }
  }

  /**
   * Get total time statistics for a date range
   *
   * @param startDate - Start date in YYYY-MM-DD format (inclusive)
   * @param endDate - End date in YYYY-MM-DD format (inclusive)
   * @param options - Repository operation options
   * @returns Promise resolving to aggregated totals
   */
  async getTotalTimeByDateRange(
    startDate: string,
    endDate: string,
    options: RepositoryOptions = {}
  ): Promise<{ totalOpenTime: number; totalActiveTime: number; recordCount: number }> {
    const startTime = performance.now();

    AggregatedStatsRepository.logger.debug('Starting total time calculation by date range', {
      startDate,
      endDate,
    });

    try {
      const result = await this.executeWithRetry(
        async () => {
          AggregatedStatsRepository.logger.debug('Fetching stats for total time calculation', {
            startDate,
            endDate,
          });

          const stats = await this.table
            .where('date')
            .between(startDate, endDate, true, true)
            .toArray();

          AggregatedStatsRepository.logger.debug('Processing stats for total time calculation', {
            recordCount: stats.length,
            startDate,
            endDate,
          });

          const totals = stats.reduce(
            (
              acc: { totalOpenTime: number; totalActiveTime: number; recordCount: number },
              stat: AggregatedStatsRecord
            ) => ({
              totalOpenTime: acc.totalOpenTime + stat.total_open_time,
              totalActiveTime: acc.totalActiveTime + stat.total_active_time,
              recordCount: acc.recordCount + 1,
            }),
            { totalOpenTime: 0, totalActiveTime: 0, recordCount: 0 }
          );

          AggregatedStatsRepository.logger.debug('Completed total time calculation', {
            totals,
            processedRecords: stats.length,
          });

          return totals;
        },
        'getTotalTimeByDateRange',
        options
      );

      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.info('Total time calculation completed successfully', {
        startDate,
        endDate,
        result,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      AggregatedStatsRepository.logger.error('Total time calculation failed', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error),
        executionTime: `${executionTime.toFixed(2)}ms`,
      });
      throw this.handleError(error, 'getTotalTimeByDateRange');
    }
  }

  /**
   * Generate a primary key for aggregated stats
   *
   * @param date - Date in YYYY-MM-DD format
   * @param url - Complete URL
   * @returns Primary key in format "YYYY-MM-DD:url"
   */
  static generateKey(date: string, url: string): string {
    return generateAggregatedStatsKey(date, url);
  }

  /**
   * Get current UTC date string
   *
   * @param timestamp - Optional timestamp (defaults to current time)
   * @returns UTC date in YYYY-MM-DD format
   */
  static getCurrentUtcDate(timestamp?: number): string {
    return getUtcDateString(timestamp);
  }

  // Validation methods implementation
  private validateTimeAggregationData(data: TimeAggregationData): void {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new ValidationError('Date must be in YYYY-MM-DD format');
    }

    // Validate URL
    try {
      new URL(data.url);
    } catch {
      throw new ValidationError('URL must be a valid URL');
    }

    // Validate hostname
    if (!data.hostname || data.hostname.trim().length === 0) {
      throw new ValidationError('Hostname cannot be empty');
    }

    // Validate parent domain
    if (!data.parentDomain || data.parentDomain.trim().length === 0) {
      throw new ValidationError('Parent domain cannot be empty');
    }

    // Validate time values
    if (data.openTimeToAdd < 0 || !Number.isInteger(data.openTimeToAdd)) {
      throw new ValidationError('Open time to add must be a non-negative integer');
    }

    if (data.activeTimeToAdd < 0 || !Number.isInteger(data.activeTimeToAdd)) {
      throw new ValidationError('Active time to add must be a non-negative integer');
    }
  }

  protected async validateForCreate(entity: InsertType<AggregatedStatsRecord>): Promise<void> {
    try {
      AggregatedStatsValidation.validateCreate(entity);
    } catch (error) {
      throw new ValidationError(
        `Invalid aggregated stats data for creation: ${(error as Error).message}`
      );
    }
  }

  protected async validateForUpdate(
    key: IDType<AggregatedStatsRecord, 'key'>,
    changes: Partial<AggregatedStatsRecord>
  ): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new ValidationError('Aggregated stats key must be a non-empty string');
    }

    if (!/^\d{4}-\d{2}-\d{2}:.+$/.test(key)) {
      throw new ValidationError('Key must be in format YYYY-MM-DD:url');
    }

    // Validate partial update data
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Update changes cannot be empty');
    }

    // Validate specific fields if they are being updated
    if (
      changes.total_open_time !== undefined &&
      (changes.total_open_time < 0 || !Number.isInteger(changes.total_open_time))
    ) {
      throw new ValidationError('Total open time must be a non-negative integer');
    }

    if (
      changes.total_active_time !== undefined &&
      (changes.total_active_time < 0 || !Number.isInteger(changes.total_active_time))
    ) {
      throw new ValidationError('Total active time must be a non-negative integer');
    }

    if (changes.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(changes.date)) {
      throw new ValidationError('Date must be in YYYY-MM-DD format');
    }

    if (changes.url !== undefined) {
      try {
        new URL(changes.url);
      } catch {
        throw new ValidationError('URL must be a valid URL');
      }
    }

    if (changes.hostname !== undefined && changes.hostname.trim().length === 0) {
      throw new ValidationError('Hostname cannot be empty');
    }

    if (changes.parentDomain !== undefined && changes.parentDomain.trim().length === 0) {
      throw new ValidationError('Parent domain cannot be empty');
    }
  }

  protected async validateForUpsert(entity: InsertType<AggregatedStatsRecord>): Promise<void> {
    // For upsert, use the same validation as create
    await this.validateForCreate(entity);
  }
}
