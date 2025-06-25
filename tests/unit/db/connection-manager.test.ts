/**
 * Database Connection Manager Unit Tests
 *
 * Tests for database connection management, health checks, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DatabaseConnectionManager,
  ConnectionState,
  type ConnectionManagerOptions,
  type DatabaseFactory,
  MockDatabaseFactory,
} from '@/core/db/connection/manager';
import type { WebTimeTrackerDB } from '@/core/db/schemas';

// Test helper functions for creating mocks
function createMockDatabase(overrides: Partial<WebTimeTrackerDB> = {}): WebTimeTrackerDB {
  return {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    on: vi.fn(),
    isOpen: vi.fn().mockReturnValue(true),
    verno: 1,
    transaction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WebTimeTrackerDB;
}

function createMockFactory(mockDb?: WebTimeTrackerDB): DatabaseFactory {
  const db = mockDb || createMockDatabase();
  return new MockDatabaseFactory(db);
}

describe('DatabaseConnectionManager', () => {
  let manager: DatabaseConnectionManager;

  beforeEach(() => {
    // Create a new manager instance for each test
    manager = new DatabaseConnectionManager({
      autoOpen: false, // Disable auto-open for controlled testing
      healthCheckInterval: 100, // Short interval for testing
      maxRetryAttempts: 2,
      retryDelay: 50,
    });
  });

  afterEach(async () => {
    // Clean up after each test
    if (manager) {
      manager.destroy();
    }
    // Restore all mocks to prevent test pollution
    vi.restoreAllMocks();
  });

  describe('Constructor and Initial State', () => {
    it('should initialize with correct default state', () => {
      expect(manager.getState()).toBe(ConnectionState.CLOSED);
      expect(manager.getLastError()).toBeNull();
      expect(manager.isHealthy()).toBe(false);
    });

    it('should accept custom options', () => {
      const options: ConnectionManagerOptions = {
        autoOpen: true,
        healthCheckInterval: 5000,
        maxRetryAttempts: 5,
        retryDelay: 2000,
      };

      const customManager = new DatabaseConnectionManager(options);
      expect(customManager.getState()).toBe(ConnectionState.CLOSED);

      customManager.destroy();
    });

    it('should provide correct database info', () => {
      const info = manager.getDatabaseInfo();
      expect(info.name).toBe('WebTimeTracker');
      expect(info.version).toBe(1);
      expect(info.state).toBe(ConnectionState.CLOSED);
    });
  });

  describe('Connection Management', () => {
    it('should open database successfully', async () => {
      expect(manager.getState()).toBe(ConnectionState.CLOSED);

      await manager.open();

      expect(manager.getState()).toBe(ConnectionState.OPEN);
      expect(manager.isHealthy()).toBe(true);
      expect(manager.getLastError()).toBeNull();
    });

    it('should not open database twice', async () => {
      await manager.open();
      expect(manager.getState()).toBe(ConnectionState.OPEN);

      // Second open should not change state
      await manager.open();
      expect(manager.getState()).toBe(ConnectionState.OPEN);
    });

    it('should close database successfully', async () => {
      await manager.open();
      expect(manager.getState()).toBe(ConnectionState.OPEN);

      manager.close();
      expect(manager.getState()).toBe(ConnectionState.CLOSED);
      expect(manager.isHealthy()).toBe(false);
    });

    it('should get database instance when open', async () => {
      await manager.open();

      const db = await manager.getDatabase();
      expect(db).toBeDefined();
      expect(db.isOpen()).toBe(true);
    });

    it('should throw error when getting database while closed', async () => {
      expect(manager.getState()).toBe(ConnectionState.CLOSED);

      await expect(manager.getDatabase()).rejects.toThrow(
        'Database is not open. Call open() first or enable autoOpen.'
      );
    });
  });

  describe('Auto-Open Functionality', () => {
    it('should auto-open database when autoOpen is enabled', async () => {
      const autoOpenManager = new DatabaseConnectionManager({
        autoOpen: true,
      });

      expect(autoOpenManager.getState()).toBe(ConnectionState.CLOSED);

      const db = await autoOpenManager.getDatabase();
      expect(db).toBeDefined();
      expect(autoOpenManager.getState()).toBe(ConnectionState.OPEN);

      autoOpenManager.destroy();
    });
  });

  describe('Health Check', () => {
    it('should perform health check on open database', async () => {
      await manager.open();

      const health = await manager.performHealthCheck();

      // In fake-indexeddb environment, we mainly check the structure
      expect(health.state).toBe(ConnectionState.OPEN);
      expect(health.version).toBe(1);
      expect(health.lastChecked).toBeValidTimestamp();
      // Note: isHealthy might be false in fake-indexeddb due to transaction limitations
    });

    it('should report unhealthy state for closed database', async () => {
      expect(manager.getState()).toBe(ConnectionState.CLOSED);

      const health = await manager.performHealthCheck();

      expect(health.isHealthy).toBe(false);
      expect(health.state).toBe(ConnectionState.CLOSED);
      expect(health.version).toBeNull();
      expect(health.lastChecked).toBeValidTimestamp();
    });
  });

  describe('Error Handling', () => {
    it('should handle database open errors gracefully', async () => {
      // Create a mock database that throws error on open
      const errorMockDb = createMockDatabase({
        open: vi.fn().mockRejectedValue(new Error('Database open failed')),
      });
      const errorMockFactory = createMockFactory(errorMockDb);

      const invalidManager = new DatabaseConnectionManager(
        {
          maxRetryAttempts: 0, // Disable retries for this test
        },
        errorMockFactory
      );

      await expect(invalidManager.open()).rejects.toThrow('Database open failed');
      expect(invalidManager.getState()).toBe(ConnectionState.FAILED);
      expect(invalidManager.getLastError()).toBeInstanceOf(Error);
      expect(invalidManager.getLastError()?.message).toBe('Database open failed');

      invalidManager.destroy();
    });

    it('should retry failed connections', async () => {
      let attemptCount = 0;
      const retryMockDb = createMockDatabase({
        open: vi.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve();
        }),
      });
      const retryMockFactory = createMockFactory(retryMockDb);

      const retryManager = new DatabaseConnectionManager(
        {
          maxRetryAttempts: 2,
          retryDelay: 10,
        },
        retryMockFactory
      );

      await retryManager.open();

      expect(attemptCount).toBe(2); // retries=2 means 2 total calls
      expect(retryManager.getState()).toBe(ConnectionState.OPEN);

      retryManager.destroy();
    });

    it('should use exponential backoff for retry delays', async () => {
      let attemptCount = 0;

      const retryMockDb = createMockDatabase({
        open: vi.fn().mockImplementation(() => {
          attemptCount++;

          if (attemptCount < 2) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve();
        }),
      });
      const retryMockFactory = createMockFactory(retryMockDb);

      const retryManager = new DatabaseConnectionManager(
        {
          maxRetryAttempts: 2,
          retryDelay: 50, // Smaller base delay for faster test
        },
        retryMockFactory
      );

      const startTime = Date.now();
      await retryManager.open();
      const endTime = Date.now();

      expect(attemptCount).toBe(2); // retries=2 means 2 total calls
      expect(retryManager.getState()).toBe(ConnectionState.OPEN);

      // Verify exponential backoff timing
      // First call fails, then delay ~50ms (50 * 2^0)
      // Second call succeeds
      // Total time should be at least 50ms but allow some tolerance
      const totalTime = endTime - startTime;
      expect(totalTime).toBeGreaterThan(40); // Allow some tolerance for test execution

      retryManager.destroy();
    });

    // Note: calculateRetryDelay private method is already tested through integration tests
    // that verify the actual exponential backoff behavior during retry attempts.
    // Testing private methods directly is discouraged by Vitest best practices.
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on destroy', async () => {
      await manager.open();
      expect(manager.getState()).toBe(ConnectionState.OPEN);

      manager.destroy();
      expect(manager.getState()).toBe(ConnectionState.CLOSED);
    });

    it('should stop health checks on destroy', async () => {
      const healthCheckManager = new DatabaseConnectionManager({
        healthCheckInterval: 50,
      });

      await healthCheckManager.open();

      // Let health check run for a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      healthCheckManager.destroy();
      expect(healthCheckManager.getState()).toBe(ConnectionState.CLOSED);
    });
  });
});
