/**
 * Utils Layer Test Utilities
 *
 * Provides mock factories, test data generators, and utility functions
 * for testing Utils layer components with type safety.
 */

import { vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';
import type { WebTimeTrackerDB } from '@/db/schemas';
import type {
  HealthCheckResult,
  VersionInfo,
  VersionComparison,
  UtilityOptions,
  HealthCheckOptions,
  VersionManagerOptions,
} from '@/db/utils';
import { UtilityErrorType } from '@/db/utils/types';

/**
 * Creates a fully mocked `WebTimeTrackerDB` instance with default behaviors for testing.
 *
 * The returned mock database has `isOpen` returning `true`, version set to `1`, `transaction` resolving to `undefined`, and table count methods returning fixed values.
 *
 * @returns A mock proxy of `WebTimeTrackerDB` with default method and property mocks
 */
export function createMockDatabase(): MockProxy<WebTimeTrackerDB> {
  const mockDb = mock<WebTimeTrackerDB>();

  // Set up default mock implementations
  mockDb.isOpen.mockReturnValue(true);

  // Define verno as getter for vitest-mock-extended compatibility
  setMockDatabaseVersion(mockDb, 1);

  mockDb.transaction.mockResolvedValue(undefined);

  // Mock table objects with count methods
  mockDb.eventslog = {
    count: vi.fn().mockResolvedValue(100),
  } as unknown as WebTimeTrackerDB['eventslog'];

  mockDb.aggregatedstats = {
    count: vi.fn().mockResolvedValue(50),
  } as unknown as WebTimeTrackerDB['aggregatedstats'];

  return mockDb;
}

/**
 * Generates a `HealthCheckResult` object with default healthy status, current timestamp, and typical database and performance metrics.
 *
 * Allows partial overrides to customize any field in the result.
 *
 * @param overrides - Optional fields to override in the generated `HealthCheckResult`
 * @returns A `HealthCheckResult` object for use in tests
 */
export function createTestHealthCheckResult(
  overrides: Partial<HealthCheckResult> = {}
): HealthCheckResult {
  const timestamp = Date.now();
  const baseResult: HealthCheckResult = {
    healthy: true,
    timestamp,
    database: {
      connected: true,
      version: '1',
    },
    performance: {
      responseTime: 50,
      memoryUsage: 1024 * 1024, // 1MB
    },
    ...overrides,
  };

  return baseResult;
}

/**
 * Generates a VersionInfo object with default values for testing, allowing optional property overrides.
 *
 * @param overrides - Partial properties to override the default VersionInfo fields
 * @returns A VersionInfo object populated with default or overridden values
 */
export function createTestVersionInfo(overrides: Partial<VersionInfo> = {}): VersionInfo {
  const baseVersionInfo: VersionInfo = {
    current: 1,
    latest: 2,
    upgradeNeeded: true,
    migrationPath: ['1', '2'],
    history: [
      {
        version: 1,
        timestamp: Date.now() - 86400000, // 1 day ago
        description: 'Initial database schema',
      },
    ],
    ...overrides,
  };

  return baseVersionInfo;
}

/**
 * Generates a VersionComparison object with default values for testing.
 *
 * @param overrides - Optional properties to override the default VersionComparison fields
 * @returns A VersionComparison object with defaults merged with any provided overrides
 */
export function createTestVersionComparison(
  overrides: Partial<VersionComparison> = {}
): VersionComparison {
  const baseComparison: VersionComparison = {
    result: 1,
    difference: 1,
    migrationRequired: true,
    ...overrides,
  };

  return baseComparison;
}

/**
 * Generates a `UtilityOptions` object with default values for testing, allowing optional overrides.
 *
 * @param overrides - Optional properties to override the default utility options
 * @returns A `UtilityOptions` object with merged default and override values
 */
export function createTestUtilityOptions(overrides: Partial<UtilityOptions> = {}): UtilityOptions {
  return {
    verbose: false,
    timeout: 5000,
    retries: 2,
    ...overrides,
  };
}

/**
 * Generates a HealthCheckOptions object with default values for testing, allowing optional overrides.
 *
 * @param overrides - Optional properties to override the default HealthCheckOptions values
 * @returns A HealthCheckOptions object with defaults merged with any provided overrides
 */
export function createTestHealthCheckOptions(
  overrides: Partial<HealthCheckOptions> = {}
): HealthCheckOptions {
  return {
    includePerformance: false,
    testOperations: false,
    maxResponseTime: 1000,
    verbose: false,
    timeout: 5000,
    retries: 2,
    ...overrides,
  };
}

/**
 * Generates a VersionManagerOptions object with default values for testing.
 *
 * Allows partial overrides to customize specific option fields.
 *
 * @param overrides - Optional fields to override the default VersionManagerOptions.
 * @returns A VersionManagerOptions object with defaults merged with any provided overrides.
 */
export function createTestVersionManagerOptions(
  overrides: Partial<VersionManagerOptions> = {}
): VersionManagerOptions {
  return {
    allowDowngrade: false,
    backupBeforeUpgrade: true,
    migrationHandlers: new Map(),
    verbose: false,
    timeout: 10000,
    retries: 3,
    ...overrides,
  };
}

/**
 * Generates a unique test database name using the specified prefix, current timestamp, and a random suffix.
 *
 * @param prefix - Prefix to identify the test context (e.g., 'Utils', 'Services', 'Integration')
 * @returns A unique database name string for test isolation
 */
export function generateTestDatabaseName(prefix: string): string {
  return `TestDB_${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create test error instances for error handling tests
 */
export class TestUtilityError extends Error {
  constructor(
    message: string,
    public type: UtilityErrorType = UtilityErrorType.UNKNOWN
  ) {
    super(message);
    this.name = 'TestUtilityError';
  }
}

export class TestHealthCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestHealthCheckError';
  }
}

export class TestVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestVersionError';
  }
}

/**
 * Mocks `performance.now()` to return incrementing values by 10ms on each call for deterministic timing in tests.
 */
export function mockPerformanceNow(): void {
  let mockTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    mockTime += 10; // Increment by 10ms each call
    return mockTime;
  });
}

/**
 * Mocks `Date.now()` to return incrementing timestamps, starting from a specified base time.
 *
 * Each call to `Date.now()` increases the returned value by 1 second (1000 ms), ensuring predictable and consistent timestamps in tests.
 *
 * @param baseTime - The initial timestamp in milliseconds. Defaults to January 1, 2022 (1640995200000).
 */
export function mockDateNow(baseTime: number = 1640995200000): void {
  let mockTime = baseTime;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    mockTime += 1000; // Increment by 1 second each call
    return mockTime;
  });
}

/**
 * Returns a mocked database instance configured to simulate a specific error scenario.
 *
 * Depending on the `errorType`, the mock will simulate a connection failure, a transaction failure, or an operation failure on the `eventslog` table.
 *
 * @param errorType - The type of error to simulate: `'connection'`, `'transaction'`, or `'operation'`
 * @returns A mock `WebTimeTrackerDB` instance that throws the specified error type
 */
export function createErrorDatabase(
  errorType: 'connection' | 'transaction' | 'operation'
): MockProxy<WebTimeTrackerDB> {
  const mockDb = createMockDatabase();

  switch (errorType) {
    case 'connection':
      mockDb.isOpen.mockReturnValue(false);
      break;
    case 'transaction':
      mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));
      break;
    case 'operation':
      mockDb.eventslog = {
        count: vi.fn().mockRejectedValue(new Error('Operation failed')),
      } as unknown as WebTimeTrackerDB['eventslog'];
      break;
  }

  return mockDb;
}

/**
 * Sets the `verno` property on a mock database to return a specified version number.
 *
 * This enables version control in tests and supports spying with vitest-mock-extended.
 */
export function setMockDatabaseVersion(mockDb: MockProxy<WebTimeTrackerDB>, version: number): void {
  Object.defineProperty(mockDb, 'verno', {
    get: () => version,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Resets a mock `WebTimeTrackerDB` instance to its default mocked behaviors.
 *
 * Restores default return values for key methods and properties, ensuring consistent state for repeated tests.
 */
export function resetMockDatabase(mockDb: MockProxy<WebTimeTrackerDB>): void {
  vi.clearAllMocks();

  // Reset to default implementations
  mockDb.isOpen.mockReturnValue(true);

  // Define verno as getter for vitest-mock-extended compatibility
  setMockDatabaseVersion(mockDb, 1);

  mockDb.transaction.mockResolvedValue(undefined);

  if (mockDb.eventslog?.count) {
    (mockDb.eventslog.count as ReturnType<typeof vi.fn>).mockResolvedValue(100);
  }

  if (mockDb.aggregatedstats?.count) {
    (mockDb.aggregatedstats.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);
  }
}

/**
 * Returns predefined response times and memory usage values for performance testing scenarios.
 *
 * @returns An object containing typical response times (fast, normal, slow, timeout) and memory usage levels (low, normal, high) for use in performance tests.
 */
export function createPerformanceTestData() {
  return {
    fastResponse: 10,
    normalResponse: 100,
    slowResponse: 1000,
    timeoutResponse: 5000,
    memoryUsage: {
      low: 1024 * 1024, // 1MB
      normal: 10 * 1024 * 1024, // 10MB
      high: 100 * 1024 * 1024, // 100MB
    },
  };
}

/**
 * Checks whether a `HealthCheckResult` object has valid types for key properties.
 *
 * Returns `true` if `healthy` is a boolean, `timestamp` is a number, and `database.connected` is a boolean; otherwise, returns `false`.
 *
 * @param result - The health check result object to validate
 * @returns Whether the object has the expected structure and types
 */
export function validateHealthCheckResult(result: HealthCheckResult): boolean {
  return (
    typeof result.healthy === 'boolean' &&
    typeof result.timestamp === 'number' &&
    typeof result.database === 'object' &&
    typeof result.database.connected === 'boolean'
  );
}

/**
 * Checks whether a VersionInfo object has valid types for its key properties.
 *
 * @param versionInfo - The object to validate
 * @returns True if `current` and `latest` are numbers and `upgradeNeeded` is a boolean; otherwise, false
 */
export function validateVersionInfo(versionInfo: VersionInfo): boolean {
  return (
    typeof versionInfo.current === 'number' &&
    typeof versionInfo.latest === 'number' &&
    typeof versionInfo.upgradeNeeded === 'boolean'
  );
}
