/**
 * Database Service Interface
 * 
 * This file provides a high-level service interface for database operations,
 * abstracting away the connection management complexity from business logic.
 */

import type { Transaction } from 'dexie';
import { connectionManager, type HealthCheckResult } from './manager';
import type { WebTimeTrackerDB } from '../schemas';

/**
 * Database operation options
 */
export interface DatabaseOperationOptions {
  timeout?: number; // milliseconds
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (db: WebTimeTrackerDB, transaction: Transaction) => Promise<T>;

/**
 * Database Service Class
 * 
 * Provides a high-level interface for database operations with automatic
 * connection management, error handling, and retry logic.
 */
export class DatabaseService {
  /**
   * Execute a database operation with automatic connection management
   * 
   * @param operation - Function that performs the database operation
   * @param options - Operation options
   * @returns Promise with operation result
   */
  async execute<T>(
    operation: (db: WebTimeTrackerDB) => Promise<T>,
    options: DatabaseOperationOptions = {}
  ): Promise<T> {
    const {
      timeout = 10000,
      retryOnFailure = true,
      maxRetries = 2
    } = options;

    let lastError: Error;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        const db = await connectionManager.getDatabase();
        
        // Set up timeout if specified
        if (timeout > 0) {
          return await Promise.race([
            operation(db),
            this.createTimeoutPromise<T>(timeout)
          ]);
        }
        
        return await operation(db);
        
      } catch (error) {
        lastError = error as Error;
        attempts++;
        
        if (!retryOnFailure || attempts > maxRetries) {
          throw error;
        }
        
        console.warn(`Database operation failed (attempt ${attempts}/${maxRetries + 1}), retrying...`, error);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute a database transaction with automatic connection management
   * 
   * @param mode - Transaction mode ('r', 'rw', or 'readwrite')
   * @param tables - Array of table names to include in transaction
   * @param callback - Transaction callback function
   * @param options - Operation options
   * @returns Promise with transaction result
   */
  async transaction<T>(
    mode: 'r' | 'rw' | 'readwrite',
    tables: string[],
    callback: TransactionCallback<T>,
    options: DatabaseOperationOptions = {}
  ): Promise<T> {
    return this.execute(async (db) => {
      return db.transaction(mode, tables, async (transaction) => {
        return callback(db, transaction);
      });
    }, options);
  }

  /**
   * Execute a read-only transaction
   * 
   * @param tables - Array of table names to include in transaction
   * @param callback - Transaction callback function
   * @param options - Operation options
   * @returns Promise with transaction result
   */
  async readTransaction<T>(
    tables: string[],
    callback: TransactionCallback<T>,
    options: DatabaseOperationOptions = {}
  ): Promise<T> {
    return this.transaction('r', tables, callback, options);
  }

  /**
   * Execute a read-write transaction
   * 
   * @param tables - Array of table names to include in transaction
   * @param callback - Transaction callback function
   * @param options - Operation options
   * @returns Promise with transaction result
   */
  async writeTransaction<T>(
    tables: string[],
    callback: TransactionCallback<T>,
    options: DatabaseOperationOptions = {}
  ): Promise<T> {
    return this.transaction('rw', tables, callback, options);
  }

  /**
   * Get database health status
   * 
   * @returns Promise with health check result
   */
  async getHealthStatus(): Promise<HealthCheckResult> {
    return connectionManager.performHealthCheck();
  }

  /**
   * Check if database is ready for operations
   * 
   * @returns Promise that resolves to true if database is healthy
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.getHealthStatus();
      return health.isHealthy;
    } catch {
      return false;
    }
  }

  /**
   * Get database information
   * 
   * @returns Database information object
   */
  getDatabaseInfo() {
    return connectionManager.getDatabaseInfo();
  }

  /**
   * Force database connection open
   * 
   * @returns Promise that resolves when database is open
   */
  async connect(): Promise<void> {
    return connectionManager.open();
  }

  /**
   * Close database connection
   */
  disconnect(): void {
    connectionManager.close();
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   */
  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    connectionManager.destroy();
  }
}

/**
 * Singleton instance of the database service
 */
export const databaseService = new DatabaseService();
