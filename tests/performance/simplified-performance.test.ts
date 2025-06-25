/**
 * Simplified Performance Validation
 *
 * Focuses on core performance metrics that are critical for the refactored
 * database architecture, using only verified APIs and data models.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebTimeTrackerDB } from '@/core/db/schemas';
import { HealthCheckUtil } from '@/core/db/utils/health-check.util';
import { VersionManagerUtil } from '@/core/db/utils/version-manager.util';
import { ConnectionService } from '@/core/db/connection/service';

describe('Simplified Performance Validation', () => {
  let db: WebTimeTrackerDB;
  let dbService: ConnectionService;

  beforeEach(async () => {
    db = new WebTimeTrackerDB();
    await db.open();
    dbService = new ConnectionService();
  });

  afterEach(async () => {
    if (db) {
      try {
        await db.delete();
        db.close();
      } catch (error) {
        console.warn('Database cleanup failed:', error);
      }
    }
  });

  describe('Core Database Performance', () => {
    it('should initialize database within performance target', async () => {
      const startTime = performance.now();

      const testDb = new WebTimeTrackerDB();
      await testDb.open();
      await testDb.close();

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // 1 second target
      console.log(`Database initialization: ${duration.toFixed(2)}ms`);
    });

    it('should perform health checks efficiently', async () => {
      const startTime = performance.now();

      const healthResult = await HealthCheckUtil.performHealthCheck(db);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(healthResult.healthy).toBe(true);
      expect(duration).toBeLessThan(200); // 200ms target
      console.log(`Health check: ${duration.toFixed(2)}ms`);
    });

    it('should perform comprehensive health checks within target', async () => {
      const startTime = performance.now();

      const healthResult = await HealthCheckUtil.performHealthCheck(db, {
        includePerformance: true,
        maxResponseTime: 1000,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(healthResult.healthy).toBe(true);
      expect(duration).toBeLessThan(300); // 300ms target
      console.log(`Comprehensive health check: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Version Management Performance', () => {
    it('should handle version operations efficiently', async () => {
      const startTime = performance.now();

      // Test static methods that don't require database instance
      const latestVersion = VersionManagerUtil.getLatestVersion();
      const isValidVersion = VersionManagerUtil.isValidVersion(1);
      const formattedVersion = VersionManagerUtil.formatVersion(1);
      const versionStatus = VersionManagerUtil.getVersionStatus(1);

      // Test database-dependent methods
      const versionInfo = await VersionManagerUtil.getVersionInfo(db);
      const needsUpgrade = await VersionManagerUtil.needsUpgrade(db);
      const isCompatible = await VersionManagerUtil.isCompatible(db);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Verify results
      expect(typeof latestVersion).toBe('number');
      expect(typeof isValidVersion).toBe('boolean');
      expect(typeof formattedVersion).toBe('string');
      expect(typeof versionStatus).toBe('string');
      expect(typeof versionInfo).toBe('object');
      expect(typeof needsUpgrade).toBe('boolean');
      expect(typeof isCompatible).toBe('boolean');

      expect(duration).toBeLessThan(100); // 100ms target
      console.log(`Version operations: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Database Service Performance', () => {
    it('should handle database service operations efficiently', async () => {
      const startTime = performance.now();

      // Test service health and readiness
      const isReady = await dbService.isReady();
      const healthStatus = await dbService.getHealthStatus();
      const dbInfo = dbService.getDatabaseInfo();

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(typeof isReady).toBe('boolean');
      expect(typeof healthStatus).toBe('object');
      expect(typeof dbInfo).toBe('object');

      expect(duration).toBeLessThan(250); // 250ms target
      console.log(`Database service operations: ${duration.toFixed(2)}ms`);
    });

    it('should handle basic database queries efficiently', async () => {
      const startTime = performance.now();

      // Test basic table operations that don't require complex data
      const eventsCount = await db.eventslog.count();
      const statsCount = await db.aggregatedstats.count();

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(typeof eventsCount).toBe('number');
      expect(typeof statsCount).toBe('number');

      expect(duration).toBeLessThan(100); // 100ms target
      console.log(`Basic database queries: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Scalability Indicators', () => {
    it('should maintain consistent performance across multiple operations', async () => {
      const operations = [];
      const startTime = performance.now();

      // Perform multiple concurrent health checks
      for (let i = 0; i < 5; i++) {
        operations.push(HealthCheckUtil.performHealthCheck(db));
      }

      const results = await Promise.all(operations);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // All health checks should succeed
      results.forEach(result => {
        expect(result.healthy).toBe(true);
      });

      expect(duration).toBeLessThan(500); // 500ms for 5 operations
      console.log(`5 concurrent health checks: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should meet all core performance targets', async () => {
      const performanceResults = [];

      // Test 1: Database initialization
      const initStart = performance.now();
      const testDb = new WebTimeTrackerDB();
      await testDb.open();
      await testDb.close();
      const initDuration = performance.now() - initStart;
      performanceResults.push({
        operation: 'Database Initialization',
        duration: initDuration,
        target: 1000,
        passed: initDuration < 1000,
      });

      // Test 2: Health check
      const healthStart = performance.now();
      await HealthCheckUtil.performHealthCheck(db);
      const healthDuration = performance.now() - healthStart;
      performanceResults.push({
        operation: 'Health Check',
        duration: healthDuration,
        target: 200,
        passed: healthDuration < 200,
      });

      // Test 3: Version operations
      const versionStart = performance.now();
      await VersionManagerUtil.getVersionInfo(db);
      const versionDuration = performance.now() - versionStart;
      performanceResults.push({
        operation: 'Version Operations',
        duration: versionDuration,
        target: 100,
        passed: versionDuration < 100,
      });

      // Test 4: Service operations
      const serviceStart = performance.now();
      await dbService.isReady();
      const serviceDuration = performance.now() - serviceStart;
      performanceResults.push({
        operation: 'Service Operations',
        duration: serviceDuration,
        target: 250,
        passed: serviceDuration < 250,
      });

      // Verify all tests passed
      const allPassed = performanceResults.every(result => result.passed);
      expect(allPassed).toBe(true);

      // Log results
      console.log('\n=== Performance Summary ===');
      performanceResults.forEach(result => {
        const status = result.passed ? 'PASS' : 'FAIL';
        console.log(
          `${result.operation}: ${result.duration.toFixed(2)}ms (target: ${result.target}ms) - ${status}`
        );
      });

      const avgDuration =
        performanceResults.reduce((sum, r) => sum + r.duration, 0) / performanceResults.length;
      const passedCount = performanceResults.filter(r => r.passed).length;

      console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Tests Passed: ${passedCount}/${performanceResults.length}`);
      console.log(`Overall Performance: ${allPassed ? 'EXCELLENT' : 'NEEDS IMPROVEMENT'}`);
    });
  });
});
