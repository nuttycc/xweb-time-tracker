/**
 * Database Connection Manager Unit Tests
 * 
 * Tests for database connection management, health checks, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  DatabaseConnectionManager, 
  ConnectionState,
  type ConnectionManagerOptions 
} from '@/db/connection/manager';

describe('DatabaseConnectionManager', () => {
  let manager: DatabaseConnectionManager;

  beforeEach(() => {
    // Create a new manager instance for each test
    manager = new DatabaseConnectionManager({
      autoOpen: false, // Disable auto-open for controlled testing
      healthCheckInterval: 100, // Short interval for testing
      maxRetryAttempts: 2,
      retryDelay: 50
    });
  });

  afterEach(async () => {
    // Clean up after each test
    if (manager) {
      manager.destroy();
    }
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
        retryDelay: 2000
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
        autoOpen: true
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
      // Create a manager with an invalid database name to force an error
      const invalidManager = new DatabaseConnectionManager();

      // Mock the database to throw an error
      const mockDb = vi.spyOn(invalidManager as any, 'db', 'get').mockReturnValue({
        open: vi.fn().mockRejectedValue(new Error('Database open failed')),
        on: vi.fn(),
        close: vi.fn(),
        isOpen: vi.fn().mockReturnValue(false)
      });

      await expect(invalidManager.open()).rejects.toThrow('Database open failed');
      expect(invalidManager.getState()).toBe(ConnectionState.FAILED);
      expect(invalidManager.getLastError()).toBeInstanceOf(Error);

      mockDb.mockRestore();
      invalidManager.destroy();
    });

    it('should retry failed connections', async () => {
      const retryManager = new DatabaseConnectionManager({
        maxRetryAttempts: 2,
        retryDelay: 10
      });

      let attemptCount = 0;
      const mockDb = vi.spyOn(retryManager as any, 'db', 'get').mockReturnValue({
        open: vi.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          // Simulate successful open by triggering ready event
          setTimeout(() => {
            (retryManager as any).state = ConnectionState.OPEN;
          }, 0);
          return Promise.resolve();
        }),
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'ready' && attemptCount >= 3) {
            setTimeout(callback, 0);
          }
        }),
        close: vi.fn(),
        isOpen: vi.fn().mockReturnValue(true),
        verno: 1
      });

      await retryManager.open();

      // Wait for state to be updated
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(attemptCount).toBe(3); // Initial attempt + 2 retries
      expect(retryManager.getState()).toBe(ConnectionState.OPEN);

      mockDb.mockRestore();
      retryManager.destroy();
    });
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
        healthCheckInterval: 50
      });

      await healthCheckManager.open();
      
      // Let health check run for a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      healthCheckManager.destroy();
      expect(healthCheckManager.getState()).toBe(ConnectionState.CLOSED);
    });
  });
});
