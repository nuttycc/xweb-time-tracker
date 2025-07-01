/**
 * Database Connection Manager
 *
 * This file implements the database connection management layer for Dexie,
 * providing health checks, error handling, and connection lifecycle management.
 */

import { retry } from 'es-toolkit/function';
import { WebTimeTrackerDB, DATABASE_NAME, DATABASE_VERSION } from '../schemas';

/**
 * Database factory interface for dependency injection
 */
export interface DatabaseFactory {
  create(): WebTimeTrackerDB;
}

/**
 * Default database factory implementation
 */
export class DefaultDatabaseFactory implements DatabaseFactory {
  create(): WebTimeTrackerDB {
    return new WebTimeTrackerDB();
  }
}

/**
 * Mock database factory for testing
 */
export class MockDatabaseFactory implements DatabaseFactory {
  constructor(private mockDb: WebTimeTrackerDB) {}

  create(): WebTimeTrackerDB {
    return this.mockDb;
  }
}

/**
 * Database connection states
 */
export enum ConnectionState {
  CLOSED = 'closed',
  OPENING = 'opening',
  OPEN = 'open',
  FAILED = 'failed',
  BLOCKED = 'blocked',
}

/**
 * Database health check result
 */
export interface HealthCheckResult {
  isHealthy: boolean;
  state: ConnectionState;
  version: number | null;
  lastError: Error | null;
  lastChecked: number; // Unix timestamp in milliseconds
}

/**
 * Connection manager options
 */
export interface ConnectionManagerOptions {
  autoOpen?: boolean;
  maxRetryAttempts?: number;
  retryDelay?: number; // milliseconds
}

/**
 * Database Connection Manager Class
 *
 * Manages the lifecycle of the Dexie database connection with health monitoring,
 * error handling, and automatic recovery capabilities.
 */
export class DatabaseConnectionManager {
  private db: WebTimeTrackerDB;
  private state: ConnectionState = ConnectionState.CLOSED;
  private lastError: Error | null = null;
  private readonly options: Required<ConnectionManagerOptions>;

  constructor(
    options: ConnectionManagerOptions = {},
    private dbFactory: DatabaseFactory = new DefaultDatabaseFactory()
  ) {
    this.options = {
      autoOpen: true,
      maxRetryAttempts: 3,
      retryDelay: 1000, // 1 second
      ...options,
    };

    this.db = this.dbFactory.create();
    this.setupEventHandlers();
  }

  /**
   * Setup Dexie event handlers for connection management
   */
  private setupEventHandlers(): void {
    // Handle database ready event (for initial open or sticky subscribers)
    this.db.on('ready', () => {
      // Only set state if not already OPEN (avoid redundant state changes)
      if (this.state !== ConnectionState.OPEN) {
        this.state = ConnectionState.OPEN;
        this.lastError = null;
      }
    });

    // Handle version change event (another connection wants to upgrade/delete)
    this.db.on('versionchange', () => {
      console.warn('Database version change detected. Closing connection to allow upgrade.');
      this.close();
    });

    // Handle blocked event (upgrade/delete blocked by other connections)
    this.db.on('blocked', () => {
      this.state = ConnectionState.BLOCKED;
      console.warn('Database operation blocked by other connections.');
    });

    // Handle database close event
    this.db.on('close', () => {
      this.state = ConnectionState.CLOSED;
    });
  }

  /**
   * Open database connection with exponential backoff retry
   *
   * @returns Promise that resolves when database is successfully opened
   */
  async open(): Promise<void> {
    if (this.state === ConnectionState.OPEN) {
      return; // Already open
    }

    if (this.state === ConnectionState.OPENING) {
      // Wait for current opening attempt to complete
      return this.waitForOpen();
    }

    this.state = ConnectionState.OPENING;

    try {
      // Handle special case: maxRetryAttempts = 0 means "try once, no retries"
      // es-toolkit retry with retries: 0 doesn't execute the function at all
      if (this.options.maxRetryAttempts === 0) {
        await this.attemptDatabaseOpen();
      } else {
        // Use es-toolkit retry with exponential backoff
        await retry(() => this.attemptDatabaseOpen(), {
          retries: this.options.maxRetryAttempts,
          delay: attempts => this.calculateRetryDelay(attempts),
        });
      }
    } catch (error) {
      this.handleFinalFailure(error as Error);
      throw error;
    }
  }

  /**
   * Attempt to open the database connection
   *
   * @private
   */
  private async attemptDatabaseOpen(): Promise<void> {
    await this.db.open();
    this.handleOpenSuccess();
  }

  /**
   * Handle successful database open
   *
   * @private
   */
  private handleOpenSuccess(): void {
    // Manually set state to OPEN after successful open
    // Note: ready event might not fire again for existing subscribers
    this.state = ConnectionState.OPEN;
    this.lastError = null;
  }

  /**
   * Handle final failure after all retry attempts
   *
   * @private
   * @param error - The final error
   */
  private handleFinalFailure(error: Error): void {
    this.state = ConnectionState.FAILED;
    this.lastError = error;
  }

  /**
   * Calculate retry delay using exponential backoff
   *
   * @private
   * @param attempts - Number of retry attempts made
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(attempts: number): number {
    // Exponential backoff: baseDelay * 2^attempts with max cap of 10 seconds
    const exponentialDelay = this.options.retryDelay * Math.pow(2, attempts);
    return Math.min(exponentialDelay, 10000);
  }

  /**
   * Wait for database to open (used when already opening)
   */
  private async waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkState = () => {
        if (this.state === ConnectionState.OPEN) {
          resolve();
        } else if (this.state === ConnectionState.FAILED) {
          reject(this.lastError);
        } else {
          setTimeout(checkState, 100);
        }
      };
      checkState();
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    this.state = ConnectionState.CLOSED;
  }

  /**
   * Get database instance
   * Automatically opens connection if autoOpen is enabled
   */
  async getDatabase(): Promise<WebTimeTrackerDB> {
    if (this.options.autoOpen && this.state !== ConnectionState.OPEN) {
      await this.open();
    }

    if (this.state !== ConnectionState.OPEN) {
      throw new Error('Database is not open. Call open() first or enable autoOpen.');
    }

    return this.db;
  }

  /**
   * Perform health check on database connection
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      isHealthy: false,
      state: this.state,
      version: null,
      lastError: this.lastError,
      lastChecked: Date.now(),
    };

    try {
      if (this.state === ConnectionState.OPEN) {
        // Check if database is actually accessible
        result.version = this.db.verno;

        // Perform a simple read operation to verify connectivity
        await this.db.transaction('r', [], () => {
          // Empty transaction just to test database accessibility
        });

        result.isHealthy = true;
      }
    } catch (error) {
      result.lastError = error as Error;
      this.lastError = error as Error;
      this.state = ConnectionState.FAILED;
    }

    return result;
  }



  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Check if database is currently open and healthy
   */
  isHealthy(): boolean {
    return this.state === ConnectionState.OPEN && this.lastError === null;
  }

  /**
   * Get database information
   */
  getDatabaseInfo(): { name: string; version: number; state: ConnectionState } {
    return {
      name: DATABASE_NAME,
      version: DATABASE_VERSION,
      state: this.state,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.close();
  }
}

/**
 * Singleton instance of the database connection manager
 * Uses default factory in production
 */
export const connectionManager = new DatabaseConnectionManager();

/**
 * Factory function for creating test instances
 */
export function createTestConnectionManager(
  options: ConnectionManagerOptions = {},
  dbFactory?: DatabaseFactory
): DatabaseConnectionManager {
  return new DatabaseConnectionManager(options, dbFactory);
}
