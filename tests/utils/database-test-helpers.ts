/**
 * Database Test Helpers
 * 
 * Provides utilities for setting up and managing database instances in tests.
 * Ensures proper initialization and cleanup of IndexedDB in test environments.
 */

import { WebTimeTrackerDB, DATABASE_NAME } from '../../src/core/db/schemas';
import { DatabaseService } from '../../src/core/db/services/database.service';

/**
 * Create a test database instance with proper initialization
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
 * Create a test database service with proper initialization
 */
export async function createTestDatabaseService(): Promise<DatabaseService> {
  const testDb = await createTestDatabase();

  // Create DatabaseService with the test database instance
  const service = new DatabaseService(testDb);

  return service;
}

/**
 * Clean up test database
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
 * Wait for IndexedDB to be ready in test environment
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
 * Create test data for integration tests
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
