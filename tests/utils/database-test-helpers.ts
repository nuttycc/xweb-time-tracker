/**
 * Database Test Helpers
 * 
 * Provides utilities for setting up and managing database instances in tests.
 * Ensures proper initialization and cleanup of IndexedDB in test environments.
 */

import { WebTimeTrackerDB, DATABASE_NAME } from '../../src/core/db/schemas';
import { DatabaseService } from '../../src/core/db/services/database.service';

/**
 * Creates and initializes a new WebTimeTrackerDB instance for testing with a unique or specified database name.
 *
 * Ensures that required tables are present and throws an error if initialization fails.
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
 * Creates and returns a DatabaseService instance backed by a newly initialized test database.
 *
 * The test database is isolated for testing purposes and is fully initialized before use.
 * @returns A DatabaseService instance connected to a test database
 */
export async function createTestDatabaseService(): Promise<DatabaseService> {
  const testDb = await createTestDatabase();

  // Create DatabaseService with the test database instance
  const service = new DatabaseService(testDb);

  return service;
}

/**
 * Closes and deletes the provided test database instance, removing it from IndexedDB if possible.
 *
 * Any errors encountered during cleanup are logged as warnings and do not interrupt test execution.
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
 * Waits for IndexedDB to become available in the current environment.
 *
 * Resolves immediately if IndexedDB is present, or after a short delay if using a mock or polyfill in test environments.
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
 * Inserts predefined test event records into the database for integration testing.
 *
 * Adds two recent event objects to the `eventslog` table of the provided database instance and returns the inserted event data.
 *
 * @returns The array of inserted test event objects.
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
