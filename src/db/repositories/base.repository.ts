/**
 * Base Repository Class
 *
 * This file provides a generic base repository class that implements common CRUD operations
 * for Dexie.js tables with full TypeScript type safety and error handling.
 */

import type { IndexableType, EntityTable, IDType } from 'dexie';
import type { WebTimeTrackerDB } from '../schemas';

/**
 * Base entity interface for entities with primary keys
 */
export interface BaseEntity extends Record<string, unknown> {
  // No specific id requirement - let concrete implementations define their primary key
  [key: string]: unknown;
}

/**
 * Insert type for entities - makes specified primary key fields optional for auto-increment scenarios
 *
 * @template T - The entity type
 * @template PK - The primary key field(s) to make optional (defaults to never for non-auto-increment tables)
 *
 * For auto-increment tables: InsertType<EntityType, 'id'> makes id optional
 * For manual key tables: InsertType<EntityType> keeps all fields as-is
 */
export type InsertType<T, PK extends keyof T = never> = [PK] extends [never]
  ? T
  : Omit<T, PK> & { [K in PK]?: T[K] };

/**
 * Repository operation options.
 * @property {number} timeout - milliseconds
 * @property {boolean} retryOnFailure
 * @property {number} maxRetries
 */
export interface RepositoryOptions {
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Repository error types
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class ValidationError extends RepositoryError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'validation');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(id: IndexableType) {
    super(`Entity with id ${id} not found`, 'get');
    this.name = 'NotFoundError';
  }
}

/**
 * Generic Base Repository Class
 *
 * Provides common CRUD operations with type safety, error handling, and validation.
 * Designed to work with Dexie.js EntityTable with flexible primary key types.
 *
 * @template T - The entity type
 * @template PK - The primary key field name (string literal type)
 */
export abstract class BaseRepository<T, PK extends keyof T> {
  protected readonly table: EntityTable<T, PK>;
  protected readonly db: WebTimeTrackerDB;
  protected readonly tableName: string;

  constructor(db: WebTimeTrackerDB, table: EntityTable<T, PK>, tableName: string) {
    this.db = db;
    this.table = table;
    this.tableName = tableName;
  }

  /**
   * Add a new entity to the database
   *
   * @param entity - The entity to add (without auto-generated fields)
   * @param options - Repository operation options
   * @returns Promise resolving to the generated primary key
   */
  async create(entity: InsertType<T, PK>, options: RepositoryOptions = {}): Promise<IDType<T, PK>> {
    try {
      await this.validateForCreate(entity);

      const result = await this.executeWithRetry(
        async () => await this.table.add(entity as T),
        'create',
        options
      );

      return result as IDType<T, PK>;
    } catch (error) {
      throw this.handleError(error, 'create');
    }
  }

  /**
   * Get an entity by its primary key
   *
   * @param id - The primary key value
   * @param options - Repository operation options
   * @returns Promise resolving to the entity or undefined if not found
   */
  async findById(id: IDType<T, PK>, options: RepositoryOptions = {}): Promise<T | undefined> {
    try {
      const result = await this.executeWithRetry(
        async () => await this.table.get(id),
        'findById',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'findById');
    }
  }

  /**
   * Get an entity by its primary key, throwing an error if not found
   *
   * @param id - The primary key value
   * @param options - Repository operation options
   * @returns Promise resolving to the entity
   * @throws NotFoundError if entity is not found
   */
  async getById(id: IDType<T, PK>, options: RepositoryOptions = {}): Promise<T> {
    const entity = await this.findById(id, options);
    if (!entity) {
      throw new NotFoundError(id as IndexableType);
    }
    return entity;
  }

  /**
   * Update an entity by its primary key
   *
   * @param id - The primary key value
   * @param changes - Partial entity with fields to update
   * @param options - Repository operation options
   * @returns Promise resolving to the number of updated records
   */
  async update(
    id: IDType<T, PK>,
    changes: Partial<T>,
    options: RepositoryOptions = {}
  ): Promise<number> {
    try {
      await this.validateForUpdate(id, changes);

      const result = await this.executeWithRetry(
        // Type assertion needed due to complex Dexie type system
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => await this.table.update(id, changes as any),
        'update',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'update');
    }
  }

  /**
   * Add or update an entity (upsert operation)
   *
   * @param entity - The entity to add or update
   * @param options - Repository operation options
   * @returns Promise resolving to the primary key
   */
  async upsert(entity: InsertType<T, PK>, options: RepositoryOptions = {}): Promise<IDType<T, PK>> {
    try {
      await this.validateForUpsert(entity);

      const result = await this.executeWithRetry(
        async () => await this.table.put(entity as T),
        'upsert',
        options
      );

      return result as IDType<T, PK>;
    } catch (error) {
      throw this.handleError(error, 'upsert');
    }
  }

  /**
   * Delete an entity by its primary key
   *
   * @param id - The primary key value
   * @param options - Repository operation options
   * @returns Promise resolving when deletion is complete
   */
  async delete(id: IDType<T, PK>, options: RepositoryOptions = {}): Promise<void> {
    try {
      await this.executeWithRetry(async () => await this.table.delete(id), 'delete', options);
    } catch (error) {
      throw this.handleError(error, 'delete');
    }
  }

  /**
   * Get all entities from the table
   *
   * @param options - Repository operation options
   * @returns Promise resolving to array of all entities
   */
  async findAll(options: RepositoryOptions = {}): Promise<T[]> {
    try {
      const result = await this.executeWithRetry(
        async () => await this.table.toArray(),
        'findAll',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'findAll');
    }
  }

  /**
   * Count total number of entities in the table
   *
   * @param options - Repository operation options
   * @returns Promise resolving to the count
   */
  async count(options: RepositoryOptions = {}): Promise<number> {
    try {
      const result = await this.executeWithRetry(
        async () => await this.table.count(),
        'count',
        options
      );

      return result;
    } catch (error) {
      throw this.handleError(error, 'count');
    }
  }

  /**
   * Clear all entities from the table
   *
   * @param options - Repository operation options
   * @returns Promise resolving when clearing is complete
   */
  async clear(options: RepositoryOptions = {}): Promise<void> {
    try {
      await this.executeWithRetry(async () => await this.table.clear(), 'clear', options);
    } catch (error) {
      throw this.handleError(error, 'clear');
    }
  }

  /**
   * Execute operation with retry logic
   */
  protected async executeWithRetry<TResult>(
    operation: () => Promise<TResult>,
    operationName: string,
    options: RepositoryOptions
  ): Promise<TResult> {
    const { timeout = 10000, retryOnFailure = true, maxRetries = 2 } = options;

    let lastError: Error;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        if (timeout > 0) {
          return await Promise.race([
            operation(),
            this.createTimeoutPromise<TResult>(timeout, operationName),
          ]);
        }

        return await operation();
      } catch (error) {
        lastError = error as Error;
        attempts++;

        if (!retryOnFailure || attempts > maxRetries) {
          throw error;
        }

        console.warn(
          `${this.tableName} repository ${operationName} failed (attempt ${attempts}/${maxRetries + 1}), retrying...`,
          error
        );

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    throw lastError!;
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   */
  protected createTimeoutPromise<TResult>(timeoutMs: number, operation: string): Promise<TResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new RepositoryError(
            `${this.tableName} repository ${operation} timed out after ${timeoutMs}ms`,
            operation
          )
        );
      }, timeoutMs);
    });
  }

  /**
   * Handle and transform errors into repository-specific errors
   */
  protected handleError(error: unknown, operation: string): RepositoryError {
    if (error instanceof RepositoryError) {
      return error;
    }

    const originalError = error as Error;
    const message = `${this.tableName} repository ${operation} failed: ${originalError.message}`;

    return new RepositoryError(message, operation, originalError);
  }

  // Abstract validation methods to be implemented by concrete repositories
  protected abstract validateForCreate(entity: InsertType<T, PK>): Promise<void>;
  protected abstract validateForUpdate(id: IDType<T, PK>, changes: Partial<T>): Promise<void>;
  protected abstract validateForUpsert(entity: InsertType<T, PK>): Promise<void>;
}
