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
 * Create a mock WebTimeTrackerDB with all methods mocked
 */
export function createMockDatabase(): MockProxy<WebTimeTrackerDB> {
  const mockDb = mock<WebTimeTrackerDB>();

  // Set up default mock implementations
  mockDb.isOpen.mockReturnValue(true);
  Object.defineProperty(mockDb, 'verno', { value: 1, writable: true });
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
 * Create test HealthCheckResult data
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
 * Create test VersionInfo data
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
 * Create test VersionComparison data
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
 * Create test UtilityOptions
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
 * Create test HealthCheckOptions
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
 * Create test VersionManagerOptions
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
 * Generate unique test database name for isolation
 */
export function generateTestDatabaseName(): string {
  return `TestDB_Utils_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Mock performance.now() for consistent timing tests
 */
export function mockPerformanceNow(): void {
  let mockTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    mockTime += 10; // Increment by 10ms each call
    return mockTime;
  });
}

/**
 * Mock Date.now() for consistent timestamp tests
 */
export function mockDateNow(baseTime: number = 1640995200000): void {
  let mockTime = baseTime;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    mockTime += 1000; // Increment by 1 second each call
    return mockTime;
  });
}

/**
 * Create a database that throws specific errors
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
 * Utility to wait for async operations in tests
 */
export function waitForAsync(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reset all mocks in a mock database
 */
export function resetMockDatabase(mockDb: MockProxy<WebTimeTrackerDB>): void {
  vi.clearAllMocks();

  // Reset to default implementations
  mockDb.isOpen.mockReturnValue(true);
  Object.defineProperty(mockDb, 'verno', { value: 1, writable: true });
  mockDb.transaction.mockResolvedValue(undefined);

  if (mockDb.eventslog?.count) {
    (mockDb.eventslog.count as ReturnType<typeof vi.fn>).mockResolvedValue(100);
  }

  if (mockDb.aggregatedstats?.count) {
    (mockDb.aggregatedstats.count as ReturnType<typeof vi.fn>).mockResolvedValue(50);
  }
}

/**
 * Create test data for performance testing
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
 * Validate test result structure
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
 * Validate version info structure
 */
export function validateVersionInfo(versionInfo: VersionInfo): boolean {
  return (
    typeof versionInfo.current === 'number' &&
    typeof versionInfo.latest === 'number' &&
    typeof versionInfo.upgradeNeeded === 'boolean'
  );
}
