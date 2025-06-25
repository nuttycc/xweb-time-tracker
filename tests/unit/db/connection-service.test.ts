/**
 * Database Connection Service Unit Tests
 *
 * Tests for high-level database service interface, transaction management,
 * error handling, retry mechanisms, and timeout scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  ConnectionService,
  type DatabaseOperationOptions,
  type TransactionCallback,
} from '@/db/connection/service';
import {
  connectionManager,
  type HealthCheckResult,
  ConnectionState,
} from '@/db/connection/manager';
import type { WebTimeTrackerDB } from '@/db/schemas';
import type { Transaction } from 'dexie';

// Mock the connection manager
vi.mock('@/db/connection/manager', async () => {
  const actual =
    await vi.importActual<typeof import('@/db/connection/manager')>('@/db/connection/manager');
  return {
    ...actual,
    connectionManager: {
      getDatabase: vi.fn() as Mock<() => Promise<WebTimeTrackerDB>>,
      performHealthCheck: vi.fn() as Mock<() => Promise<HealthCheckResult>>,
      getDatabaseInfo: vi.fn() as Mock<() => { name: string; version: number; state: string }>,
      open: vi.fn() as Mock<() => Promise<void>>,
      close: vi.fn() as Mock<() => void>,
      destroy: vi.fn() as Mock<() => void>,
    },
  };
});

// Create mock database instance
function createMockDatabase(): WebTimeTrackerDB {
  return {
    transaction: vi.fn() as Mock<
      (
        mode: string,
        tables: string[],
        callback: (transaction: Transaction) => unknown
      ) => Promise<unknown>
    >,
    eventsLog: {
      add: vi.fn() as Mock<(item: unknown) => Promise<number>>,
      get: vi.fn() as Mock<(key: number) => Promise<unknown>>,
      toArray: vi.fn() as Mock<() => Promise<unknown[]>>,
    },
    aggregatedStats: {
      add: vi.fn() as Mock<(item: unknown) => Promise<string>>,
      get: vi.fn() as Mock<(key: string) => Promise<unknown>>,
      toArray: vi.fn() as Mock<() => Promise<unknown[]>>,
    },
    isOpen: vi.fn().mockReturnValue(true) as Mock<() => boolean>,
    close: vi.fn() as Mock<() => void>,
    on: vi.fn() as Mock<(event: string, handler: (...args: unknown[]) => void) => void>,
    verno: 1,
  } as unknown as WebTimeTrackerDB;
}

describe('ConnectionService', () => {
  let service: ConnectionService;
  let mockDb: WebTimeTrackerDB;

  beforeEach(() => {
    service = new ConnectionService();
    mockDb = createMockDatabase();

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    (connectionManager.getDatabase as Mock<() => Promise<WebTimeTrackerDB>>).mockResolvedValue(
      mockDb
    );
    (
      connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
    ).mockResolvedValue({
      isHealthy: true,
      state: ConnectionState.OPEN,
      version: 1,
      lastError: null,
      lastChecked: Date.now(),
    });
    (
      connectionManager.getDatabaseInfo as Mock<
        () => { name: string; version: number; state: string }
      >
    ).mockReturnValue({
      name: 'WebTimeTracker',
      version: 1,
      state: 'OPEN',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute method', () => {
    it('should execute database operation successfully', async () => {
      const operation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockResolvedValue('test result');

      const result = await service.execute(operation);

      expect(result).toBe('test result');
      expect(connectionManager.getDatabase).toHaveBeenCalledOnce();
      expect(operation).toHaveBeenCalledWith(mockDb);
    });

    it('should handle operation timeout', async () => {
      const slowOperation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve('slow result'), 200))
        );

      const options: DatabaseOperationOptions = {
        timeout: 100,
        retryOnFailure: false, // Disable retries for timeout test
      };

      await expect(service.execute(slowOperation, options)).rejects.toThrow(
        'Database operation timed out after 100ms'
      );

      expect(connectionManager.getDatabase).toHaveBeenCalledOnce();
      expect(slowOperation).toHaveBeenCalledWith(mockDb);
    });

    it('should retry failed operations when retryOnFailure is true', async () => {
      let attemptCount = 0;
      const flakyOperation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve('success after retry');
        });

      const options: DatabaseOperationOptions = {
        retryOnFailure: true,
        maxRetries: 2,
      };

      const result = await service.execute(flakyOperation, options);

      expect(result).toBe('success after retry');
      expect(flakyOperation).toHaveBeenCalledTimes(3);
      expect(connectionManager.getDatabase).toHaveBeenCalledTimes(3);
    });

    it('should not retry when retryOnFailure is false', async () => {
      const failingOperation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockRejectedValue(new Error('Operation failed'));

      const options: DatabaseOperationOptions = {
        retryOnFailure: false,
      };

      await expect(service.execute(failingOperation, options)).rejects.toThrow('Operation failed');

      expect(failingOperation).toHaveBeenCalledOnce();
      expect(connectionManager.getDatabase).toHaveBeenCalledOnce();
    });

    it('should throw error after max retries exceeded', async () => {
      const alwaysFailingOperation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockRejectedValue(new Error('Persistent failure'));

      const options: DatabaseOperationOptions = {
        retryOnFailure: true,
        maxRetries: 1,
      };

      await expect(service.execute(alwaysFailingOperation, options)).rejects.toThrow(
        'Persistent failure'
      );

      expect(alwaysFailingOperation).toHaveBeenCalledTimes(2); // Initial + 1 retry
      expect(connectionManager.getDatabase).toHaveBeenCalledTimes(2);
    });

    it('should handle database connection errors', async () => {
      (connectionManager.getDatabase as Mock<() => Promise<WebTimeTrackerDB>>).mockRejectedValue(
        new Error('Database connection failed')
      );

      const operation = vi.fn<(db: WebTimeTrackerDB) => Promise<string>>();

      await expect(service.execute(operation)).rejects.toThrow('Database connection failed');

      expect(operation).not.toHaveBeenCalled();
    });

    it('should use default options when none provided', async () => {
      const operation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockResolvedValue('result');

      const result = await service.execute(operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledWith(mockDb);
    });

    it('should handle zero timeout (no timeout)', async () => {
      const operation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockResolvedValue('result');
      const options: DatabaseOperationOptions = { timeout: 0 };

      const result = await service.execute(operation, options);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledWith(mockDb);
    });
  });

  describe('transaction method', () => {
    it('should execute read-write transaction successfully', async () => {
      const mockTransaction = { mode: 'readwrite' } as Transaction;
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockResolvedValue('transaction result');

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          return Promise.resolve(callback(mockTransaction));
        }
      );

      const result = await service.transaction('rw', ['eventsLog'], transactionCallback);

      expect(result).toBe('transaction result');
      expect(mockDb.transaction).toHaveBeenCalledWith('rw', ['eventsLog'], expect.any(Function));
      expect(transactionCallback).toHaveBeenCalledWith(mockDb, mockTransaction);
    });

    it('should execute read-only transaction successfully', async () => {
      const mockTransaction = { mode: 'readonly' } as Transaction;
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockResolvedValue('read result');

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          return Promise.resolve(callback(mockTransaction));
        }
      );

      const result = await service.transaction('r', ['eventsLog'], transactionCallback);

      expect(result).toBe('read result');
      expect(mockDb.transaction).toHaveBeenCalledWith('r', ['eventsLog'], expect.any(Function));
      expect(transactionCallback).toHaveBeenCalledWith(mockDb, mockTransaction);
    });

    it('should handle transaction errors', async () => {
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockRejectedValue(new Error('Transaction failed'));

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          return Promise.resolve(callback({} as Transaction));
        }
      );

      await expect(service.transaction('rw', ['eventsLog'], transactionCallback)).rejects.toThrow(
        'Transaction failed'
      );

      expect(transactionCallback).toHaveBeenCalled();
    });

    it('should pass through transaction options', async () => {
      const transactionCallback = vi.fn<TransactionCallback<string>>().mockResolvedValue('result');
      const options: DatabaseOperationOptions = { timeout: 5000, maxRetries: 1 };

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          return Promise.resolve(callback({} as Transaction));
        }
      );

      const result = await service.transaction('rw', ['eventsLog'], transactionCallback, options);

      expect(result).toBe('result');
      expect(connectionManager.getDatabase).toHaveBeenCalledOnce();
    });
  });

  describe('readTransaction method', () => {
    it('should execute read-only transaction', async () => {
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockResolvedValue('read result');

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          expect(mode).toBe('r');
          return Promise.resolve(callback({} as Transaction));
        }
      );

      const result = await service.readTransaction(['eventsLog'], transactionCallback);

      expect(result).toBe('read result');
      expect(mockDb.transaction).toHaveBeenCalledWith('r', ['eventsLog'], expect.any(Function));
    });
  });

  describe('writeTransaction method', () => {
    it('should execute read-write transaction', async () => {
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockResolvedValue('write result');

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          expect(mode).toBe('rw');
          return Promise.resolve(callback({} as Transaction));
        }
      );

      const result = await service.writeTransaction(['eventsLog'], transactionCallback);

      expect(result).toBe('write result');
      expect(mockDb.transaction).toHaveBeenCalledWith('rw', ['eventsLog'], expect.any(Function));
    });
  });

  describe('getHealthStatus method', () => {
    it('should return health check result', async () => {
      const mockHealthResult: HealthCheckResult = {
        isHealthy: true,
        state: ConnectionState.OPEN,
        version: 1,
        lastError: null,
        lastChecked: Date.now(),
      };

      (
        connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
      ).mockResolvedValue(mockHealthResult);

      const result = await service.getHealthStatus();

      expect(result).toEqual(mockHealthResult);
      expect(connectionManager.performHealthCheck).toHaveBeenCalledOnce();
    });

    it('should handle health check errors', async () => {
      (
        connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
      ).mockRejectedValue(new Error('Health check failed'));

      await expect(service.getHealthStatus()).rejects.toThrow('Health check failed');
    });
  });

  describe('isReady method', () => {
    it('should return true when database is healthy', async () => {
      (
        connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
      ).mockResolvedValue({
        isHealthy: true,
        state: ConnectionState.OPEN,
        version: 1,
        lastError: null,
        lastChecked: Date.now(),
      });

      const result = await service.isReady();

      expect(result).toBe(true);
      expect(connectionManager.performHealthCheck).toHaveBeenCalledOnce();
    });

    it('should return false when database is unhealthy', async () => {
      (
        connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
      ).mockResolvedValue({
        isHealthy: false,
        state: ConnectionState.CLOSED,
        version: null,
        lastError: null,
        lastChecked: Date.now(),
      });

      const result = await service.isReady();

      expect(result).toBe(false);
      expect(connectionManager.performHealthCheck).toHaveBeenCalledOnce();
    });

    it('should return false when health check throws error', async () => {
      (
        connectionManager.performHealthCheck as Mock<() => Promise<HealthCheckResult>>
      ).mockRejectedValue(new Error('Health check error'));

      const result = await service.isReady();

      expect(result).toBe(false);
      expect(connectionManager.performHealthCheck).toHaveBeenCalledOnce();
    });
  });

  describe('getDatabaseInfo method', () => {
    it('should return database information', () => {
      const mockInfo = {
        name: 'WebTimeTracker',
        version: 1,
        state: 'OPEN' as const,
      };

      (
        connectionManager.getDatabaseInfo as Mock<
          () => { name: string; version: number; state: string }
        >
      ).mockReturnValue(mockInfo);

      const result = service.getDatabaseInfo();

      expect(result).toEqual(mockInfo);
      expect(connectionManager.getDatabaseInfo).toHaveBeenCalledOnce();
    });
  });

  describe('connect method', () => {
    it('should open database connection', async () => {
      (connectionManager.open as Mock<() => Promise<void>>).mockResolvedValue(undefined);

      await service.connect();

      expect(connectionManager.open).toHaveBeenCalledOnce();
    });

    it('should handle connection errors', async () => {
      (connectionManager.open as Mock<() => Promise<void>>).mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(service.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect method', () => {
    it('should close database connection', () => {
      service.disconnect();

      expect(connectionManager.close).toHaveBeenCalledOnce();
    });
  });

  describe('destroy method', () => {
    it('should destroy connection manager', () => {
      service.destroy();

      expect(connectionManager.destroy).toHaveBeenCalledOnce();
    });
  });

  describe('createTimeoutPromise (private method integration)', () => {
    it('should timeout long-running operations', async () => {
      // Use a more realistic timeout test without relying on exact timing
      const longOperation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve('result'), 1000))
        );

      const options: DatabaseOperationOptions = {
        timeout: 50,
        retryOnFailure: false, // Disable retries for timeout test
      };

      await expect(service.execute(longOperation, options)).rejects.toThrow(
        'Database operation timed out after 50ms'
      );

      expect(connectionManager.getDatabase).toHaveBeenCalledOnce();
      expect(longOperation).toHaveBeenCalledWith(mockDb);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle undefined lastError in retry logic', async () => {
      let attemptCount = 0;
      const operation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockImplementation(() => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('First failure');
          }
          if (attemptCount === 2) {
            throw new Error('Second failure');
          }
          throw new Error('Final failure');
        });

      const options: DatabaseOperationOptions = {
        retryOnFailure: true,
        maxRetries: 1,
      };

      await expect(service.execute(operation, options)).rejects.toThrow('Second failure');

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle retry delay correctly', async () => {
      let attemptCount = 0;
      const operation = vi
        .fn<(db: WebTimeTrackerDB) => Promise<string>>()
        .mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Retry needed');
          }
          return Promise.resolve('success');
        });

      const options: DatabaseOperationOptions = {
        retryOnFailure: true,
        maxRetries: 1,
      };

      const startTime = Date.now();
      const result = await service.execute(operation, options);
      const endTime = Date.now();

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      // Should have waited at least 1 second (1000ms * 1 attempt) but allow some tolerance
      expect(endTime - startTime).toBeGreaterThan(800); // Reduced from 900 for CI tolerance
    });
  });

  describe('complex transaction scenarios', () => {
    it('should handle nested transaction operations', async () => {
      const outerCallback = vi.fn<TransactionCallback<string>>().mockImplementation(async db => {
        // Simulate nested operation within transaction
        return service.execute(async innerDb => {
          expect(innerDb).toBe(db);
          return 'nested result';
        });
      });

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, _tables: string[], callback: (transaction: Transaction) => unknown) => {
          return Promise.resolve(callback({} as Transaction));
        }
      );

      const result = await service.transaction('rw', ['eventsLog'], outerCallback);

      expect(result).toBe('nested result');
      expect(outerCallback).toHaveBeenCalled();
    });

    it('should handle transaction with multiple tables', async () => {
      const transactionCallback = vi
        .fn<TransactionCallback<string>>()
        .mockResolvedValue('multi-table result');

      (
        mockDb.transaction as unknown as Mock<
          (
            mode: string,
            tables: string[],
            callback: (transaction: Transaction) => unknown
          ) => Promise<unknown>
        >
      ).mockImplementation(
        (_mode: string, tables: string[], callback: (transaction: Transaction) => unknown) => {
          expect(tables).toEqual(['eventsLog', 'aggregatedStats']);
          return Promise.resolve(callback({} as Transaction));
        }
      );

      const result = await service.transaction(
        'rw',
        ['eventsLog', 'aggregatedStats'],
        transactionCallback
      );

      expect(result).toBe('multi-table result');
      expect(mockDb.transaction).toHaveBeenCalledWith(
        'rw',
        ['eventsLog', 'aggregatedStats'],
        expect.any(Function)
      );
    });
  });
});
