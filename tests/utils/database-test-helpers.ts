/**
 * Database Test Helpers
 * 
 * Provides utilities for setting up and managing database instances in tests.
 * Ensures proper initialization and cleanup of IndexedDB in test environments.
 */

import { WebTimeTrackerDB, DATABASE_NAME } from '../../src/core/db/schemas';
import { DatabaseService } from '../../src/core/db/services/database.service';

/**
 * Creates and initializes a WebTimeTrackerDB instance for testing, using a unique or specified database name.
 *
 * Ensures that the required tables (`eventslog` and `aggregatedstats`) are present, throwing an error if initialization fails.
 *
 * @param dbName - Optional custom name for the test database
 * @returns The initialized WebTimeTrackerDB instance
 */
export async function createTestDatabase(dbName?: string): Promise<WebTimeTrackerDB> {
  const testDbName = dbName || `${DATABASE_NAME}_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create a new database instance with unique name
  const testDb = new WebTimeTrackerDB();
  
  // Override the database name for testing
  (testDb as WebTimeTrackerDB & { _dbName: string })._dbName = testDbName;
  
  // Ensure the database is properly opened and initialized
  await testDb.open();
  
  // Verify tables are properly initialized
  if (!testDb.eventslog || !testDb.aggregatedstats) {
    throw new Error('Database tables not properly initialized');
  }
  
  return testDb;
}

/**
 * Creates a DatabaseService instance connected to a freshly initialized test database.
 *
 * The returned service uses an isolated database instance suitable for testing scenarios.
 * @returns A DatabaseService instance backed by a test database
 */
export async function createTestDatabaseService(): Promise<DatabaseService> {
  const testDb = await createTestDatabase();

  // Create DatabaseService with the test database instance
  const service = new DatabaseService(testDb);

  return service;
}

/**
 * Closes and deletes the specified test database instance, and attempts to remove it from IndexedDB storage.
 *
 * Errors encountered during cleanup are logged as warnings and do not interrupt test execution.
 */
export async function cleanupTestDatabase(db: WebTimeTrackerDB): Promise<void> {
  try {
    const dbName = (db as WebTimeTrackerDB & { _dbName?: string })._dbName || DATABASE_NAME;
    await db.close();
    await db.delete();
    
    // Also try to delete from IndexedDB directly
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase(dbName);
    }
  } catch (error) {
    // Ignore cleanup errors in tests
    console.warn('Database cleanup warning:', error);
  }
}

/**
 * Ensures that IndexedDB is available before proceeding.
 *
 * Resolves immediately if IndexedDB is present, or waits briefly to accommodate environments where IndexedDB is initialized asynchronously, such as with mocks or polyfills.
 */
export async function waitForIndexedDB(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB !== 'undefined') {
      // IndexedDB is available, resolve immediately
      resolve();
    } else {
      // Wait a bit for fake-indexeddb to initialize
      setTimeout(resolve, 100);
    }
  });
}

/**
 * Inserts two predefined event records into the `eventslog` table of the provided database instance for integration testing.
 *
 * The inserted events simulate recent user activity with valid UUIDs and timestamps within the last hour.
 *
 * @returns An array containing the inserted test event objects.
 */
export async function createTestData(db: WebTimeTrackerDB) {
  const testEvents = [
    {
      eventType: 'open_time_start' as const,
      visitId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
      activityId: null,
      url: 'https://example.com',
      timestamp: Date.now() - 1800000, // 30 minutes ago (within 1 hour window)
      tabId: 1,
      isProcessed: 0,
    },
    {
      eventType: 'active_time_start' as const,
      visitId: '550e8400-e29b-41d4-a716-446655440000', // Same visitId
      activityId: '550e8400-e29b-41d4-a716-446655440001', // Valid UUID
      url: 'https://example.com',
      timestamp: Date.now() - 1500000, // 25 minutes ago (within 1 hour window)
      tabId: 1,
      isProcessed: 0,
    },
  ];

  for (const event of testEvents) {
    await db.eventslog.add(event);
  }

  return testEvents;
}
