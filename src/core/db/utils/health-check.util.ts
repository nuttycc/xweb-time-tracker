/**
 * Database Health Check Utility
 *
 * Provides comprehensive health checking capabilities for the database,
 * extracted and enhanced from the connection manager.
 *
 * @module db/utils/health-check
 */

import type { WebTimeTrackerDB } from '../schemas';
import type { HealthCheckResult, UtilityOptions } from './types';
import { HealthStatus } from './types';

/**
 * Health check configuration options
 */
export interface HealthCheckOptions extends UtilityOptions {
  /** Include performance metrics */
  includePerformance?: boolean;
  /** Test data operations */
  testOperations?: boolean;
  /** Maximum allowed response time (ms) */
  maxResponseTime?: number;
}

/**
 * Database Health Check Utility Class
 *
 * Provides static methods for performing various types of health checks
 * on the database connection and operations.
 */
export class HealthCheckUtil {
  /**
   * Perform a comprehensive health check on the database
   *
   * @param db - Database instance to check
   * @param options - Health check options
   * @returns Promise resolving to health check result
   */
  static async performHealthCheck(
    db: WebTimeTrackerDB,
    options: HealthCheckOptions = {}
  ): Promise<HealthCheckResult> {
    // Handle null options explicitly (default parameters don't work with explicit null)
    const safeOptions = options || {};

    const startTime = Date.now();
    const result: HealthCheckResult = {
      healthy: false,
      timestamp: startTime,
      database: {
        connected: false,
      },
    };

    try {
      // Check basic database connectivity
      await this.checkDatabaseConnection(db, result);

      // Include performance metrics if requested
      if (safeOptions.includePerformance) {
        await this.checkPerformance(db, result, safeOptions);
      }

      // Test basic operations if requested
      if (safeOptions.testOperations) {
        await this.testBasicOperations(db, result);
      }

      // Calculate overall health status
      result.healthy = this.calculateOverallHealth(result, safeOptions);
    } catch (error) {
      result.database.error = (error as Error).message;
      result.healthy = false;
    }

    // Calculate response time
    const responseTime = Date.now() - startTime;
    if (result.performance) {
      result.performance.responseTime = responseTime;
    } else {
      result.performance = { responseTime };
    }

    return result;
  }

  /**
   * Check basic database connection
   */
  private static async checkDatabaseConnection(
    db: WebTimeTrackerDB,
    result: HealthCheckResult
  ): Promise<void> {
    try {
      // Check if database is open
      if (!db.isOpen()) {
        throw new Error('Database is not open');
      }

      // Get database version
      result.database.version = db.verno.toString();
      result.database.connected = true;

      // Perform a simple read operation to verify accessibility
      await db.eventslog.count();
    } catch (error) {
      result.database.connected = false;
      result.database.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Check database performance metrics
   */
  private static async checkPerformance(
    db: WebTimeTrackerDB,
    result: HealthCheckResult,
    options: HealthCheckOptions
  ): Promise<void> {
    const startTime = performance.now();

    try {
      // Test a simple count operation for performance
      await db.eventslog.count();

      const responseTime = performance.now() - startTime;

      if (!result.performance) {
        result.performance = { responseTime: 0 };
      }
      result.performance.responseTime = responseTime;

      // Check if response time exceeds threshold
      if (options.maxResponseTime && responseTime > options.maxResponseTime) {
        if (!result.details) {
          result.details = {};
        }
        result.details.performanceWarning = `Response time ${responseTime}ms exceeds threshold ${options.maxResponseTime}ms`;
      }

      // Add memory usage if available
      if (typeof performance !== 'undefined' && 'memory' in performance) {
        const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
        if (memory) {
          result.performance.memoryUsage = memory.usedJSHeapSize;
        }
      }
    } catch (error) {
      if (!result.details) {
        result.details = {};
      }
      result.details.performanceError = (error as Error).message;
    }
  }

  /**
   * Test basic database operations
   */
  private static async testBasicOperations(
    db: WebTimeTrackerDB,
    result: HealthCheckResult
  ): Promise<void> {
    try {
      // Test read operations on both tables
      const [eventsCount, statsCount] = await Promise.all([
        db.eventslog.count(),
        db.aggregatedstats.count(),
      ]);

      if (!result.details) {
        result.details = {};
      }

      result.details.tableStatus = {
        eventslog: { count: eventsCount, accessible: true },
        aggregatedstats: { count: statsCount, accessible: true },
      };
    } catch (error) {
      if (!result.details) {
        result.details = {};
      }
      result.details.operationError = (error as Error).message;
    }
  }

  /**
   * Calculate overall health status based on all checks
   */
  private static calculateOverallHealth(
    result: HealthCheckResult,
    options: HealthCheckOptions
  ): boolean {
    // Must have database connection
    if (!result.database.connected) {
      return false;
    }

    // Check performance threshold if specified
    if (options.maxResponseTime && result.performance) {
      if (result.performance.responseTime > options.maxResponseTime) {
        return false;
      }
    }

    // Check for operation errors
    if (result.details?.operationError) {
      return false;
    }

    return true;
  }

  /**
   * Quick health check - minimal overhead
   *
   * @param db - Database instance to check
   * @returns Promise resolving to boolean health status
   */
  static async quickHealthCheck(db: WebTimeTrackerDB): Promise<boolean> {
    try {
      if (!db.isOpen()) {
        return false;
      }

      // Simple read operation test
      await db.eventslog.count();

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get health status level based on result
   *
   * @param result - Health check result
   * @returns Health status level
   */
  static getHealthStatus(result: HealthCheckResult): HealthStatus {
    if (!result.database.connected) {
      return HealthStatus.CRITICAL;
    }

    if (!result.healthy) {
      return HealthStatus.WARNING;
    }

    if (result.details?.performanceWarning) {
      return HealthStatus.WARNING;
    }

    return HealthStatus.HEALTHY;
  }
}
